import { describe, expect, mock, test } from "bun:test";
import { createBunRequest } from "../../test-utils/bun-request";

// Art for "a1-001" resolves; "b4-001" is a real card whose art the CDN doesn't
// have yet. Nothing here touches the network.
mock.module("../../services/card-images", () => ({
  getCardImageBytes: async (id: string) =>
    id === "a1-001" ? new Uint8Array([1, 2, 3]) : null,
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
});
