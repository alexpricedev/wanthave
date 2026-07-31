import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { SQL } from "bun";
import sharp from "sharp";
import { createBunRequest } from "../../test-utils/bun-request";
import { cleanupTestData } from "../../test-utils/helpers";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for tests");
}
const connection = new SQL(process.env.DATABASE_URL);

mock.module("../../services/database", () => ({
  get db() {
    return connection;
  },
}));

// No network in tests: the OG renderer falls back to its placeholder tile.
mock.module("../../services/card-images", () => ({
  getCardImage: async () => ({ status: "absent" }),
}));

import { home } from "./home";

describe("Home Controller", () => {
  beforeEach(async () => {
    await cleanupTestData(connection);
  });

  afterAll(async () => {
    await connection.end();
    mock.restore();
  });

  describe("GET /", () => {
    test("renders home page wrapped in the layout", async () => {
      const request = createBunRequest("http://localhost:3000/", {
        method: "GET",
      });
      const response = await home.index(request);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/html");
      expect(html).toContain('data-page="home"');
      expect(html).toContain("<main>");
    });

    test("hero points at the rendered demo unfurl", async () => {
      const request = createBunRequest("http://localhost:3000/", {
        method: "GET",
      });
      const html = await (await home.index(request)).text();

      expect(html).toContain('src="/og/demo.png?v=');
    });
  });

  describe("GET /og/demo.png", () => {
    test("serves a 1200x630 PNG", async () => {
      const response = await home.demoOg(
        createBunRequest("http://localhost:3000/og/demo.png", {
          method: "GET",
        }),
      );
      const bytes = new Uint8Array(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      const meta = await sharp(bytes).metadata();
      expect(meta.width).toBe(1200);
      expect(meta.height).toBe(630);
    });
  });
});
