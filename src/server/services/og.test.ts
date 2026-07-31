import { describe, expect, mock, test } from "bun:test";
import sharp from "sharp";
import { getCardsBySet } from "./cards";
import type { ListCardRow, TradeList } from "./lists";

// No network in tests: the renderer falls back to its placeholder tile, which
// exercises the same layout maths as real art.
mock.module("./card-images", () => ({
  getCardImage: async () => ({ status: "absent" }),
}));

import { renderOgImage } from "./og";

const catalogue = getCardsBySet("A1");

const rows = (kind: "want" | "have", count: number): ListCardRow[] =>
  Array.from({ length: count }, (_, i) => ({
    card: catalogue[i % catalogue.length],
    kind,
    quantity: 1,
    position: i,
  }));

const buildList = (wants: number, haves: number): TradeList => ({
  id: "id",
  slug: "slug",
  userId: null,
  title: null,
  friendId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  expiresAt: null,
  wants: rows("want", wants),
  haves: rows("have", haves),
});

describe("renderOgImage", () => {
  // Every branch of the layout: one-sided, both sides on one row, both sides
  // split across two rows, and the overlap floor at the section cap.
  const cases: [number, number][] = [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 2],
    [3, 10],
    [6, 6],
    [20, 20],
    [0, 30],
    [60, 60],
  ];

  for (const [wants, haves] of cases) {
    test(`renders a 1200x630 PNG for ${wants} wants / ${haves} haves`, async () => {
      const render = await renderOgImage(buildList(wants, haves));
      const meta = await sharp(render.png).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBe(1200);
      expect(meta.height).toBe(630);
      // Art is mocked away here, so every drawn card is a placeholder — the
      // render must report itself incomplete so the caller skips the cache.
      expect(render.complete).toBe(false);
    });
  }
});
