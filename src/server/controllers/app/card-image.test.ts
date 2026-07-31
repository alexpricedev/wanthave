import { describe, expect, mock, test } from "bun:test";
import { createBunRequest } from "../../test-utils/bun-request";

// Art for "a1-001" resolves; "b4-001" is a real card not yet mirrored into the
// bucket; "a1-002" stands in for the bucket failing to answer. Nothing here
// touches the network.
mock.module("../../services/card-images", () => ({
  getCardImage: async (id: string) => {
    if (id === "a1-001")
      return { status: "ok", bytes: new Uint8Array([1, 2, 3]) };
    if (id === "a1-002") return { status: "error" };
    return { status: "absent" };
  },
  getPlaceholderImageBytes: async () => new Uint8Array([9, 9]),
}));

const { cardImage } = await import("./card-image");

const show = (id: string): Promise<Response> =>
  cardImage.show(
    createBunRequest(`http://localhost:3000/img/card/${id}`, {}, { id }),
  );

describe("cardImage.show", () => {
  test("serves fetched art as immutable webp", async () => {
    const res = await show("a1-001");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  test("serves a short-lived placeholder for a known card with no art yet", async () => {
    const res = await show("b4-001");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([9, 9]),
    );
  });

  test("404s for an id that isn't in the catalogue", async () => {
    const res = await show("zz9-999");
    expect(res.status).toBe(404);
  });

  // A placeholder here would be a 200 the CDN caches, so a momentary bucket
  // failure would leave a blank tile pinned at the edge long after it passed.
  test("503s without caching when the bucket can't be read", async () => {
    const res = await show("a1-002");
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
