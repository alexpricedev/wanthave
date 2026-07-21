import { describe, expect, test } from "bun:test";
import {
  getCardById,
  getCardsBySet,
  isValidCardId,
  limitlessUrl,
  RARITIES,
  rarityLabel,
  SETS,
  searchCards,
} from "./cards";

describe("catalogue integrity", () => {
  test("only tradeable rarities exist in the catalogue", () => {
    const allowed = new Set(RARITIES.map((r) => r.code));
    for (const set of SETS) {
      for (const card of getCardsBySet(set.code)) {
        expect(allowed.has(card.rarity)).toBe(true);
      }
    }
  });

  test("sets are non-empty and start at A1", () => {
    expect(SETS.length).toBeGreaterThan(0);
    expect(SETS[0].code).toBe("A1");
  });

  test("card ids resolve and validate", () => {
    expect(isValidCardId("a1-036")).toBe(true);
    expect(isValidCardId("nonsense-999")).toBe(false);
    expect(getCardById("a1-036")?.name).toBe("Charizard ex");
  });

  test("limitlessUrl builds the padded CDN path", () => {
    const card = getCardById("a1-036");
    expect(card).toBeTruthy();
    if (card) {
      expect(limitlessUrl(card)).toBe(
        "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/A1/A1_036_EN.webp",
      );
    }
  });

  test("rarityLabel maps codes to in-game symbols", () => {
    expect(rarityLabel("d4")).toBe("◆4");
    expect(rarityLabel("s1")).toBe("★1");
    expect(rarityLabel("s2")).toBe("★2");
    expect(rarityLabel("sh1")).toBe("✵1");
    expect(rarityLabel("sh2")).toBe("✵2");
  });
});

describe("getCardsBySet", () => {
  test("returns only cards from the requested set", () => {
    const cards = getCardsBySet("A1");
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.set === "A1")).toBe(true);
  });

  test("unknown set returns empty", () => {
    expect(getCardsBySet("ZZ")).toEqual([]);
  });
});

describe("slang-aware search", () => {
  test("resolves community shorthand 'RR chsr EX' to rainbow Charizard ex ★2", () => {
    const results = searchCards("RR chsr EX");
    expect(results.length).toBeGreaterThan(0);
    for (const card of results) {
      expect(card.name.toLowerCase()).toContain("chariz");
      expect(card.ex).toBe(true);
      expect(card.rarity).toBe("s2");
    }
  });

  test("'sir'/'sar' also resolve to the ★2 special-art tier", () => {
    for (const term of ["sir", "sar"]) {
      const results = searchCards(`${term} chsr`);
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((c) => c.rarity === "s2")).toBe(true);
    }
  });

  test("'shiny' narrows to the shiny rarities", () => {
    const results = searchCards("shiny pikachu");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((c) => c.rarity === "sh1" || c.rarity === "sh2")).toBe(
      true,
    );
    expect(results.every((c) => c.name.toLowerCase().includes("pikachu"))).toBe(
      true,
    );
  });

  test("'FA' / 'full-art' filters to full-art cards", () => {
    for (const term of ["fa charizard", "full-art charizard"]) {
      const results = searchCards(term);
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((c) => c.fa)).toBe(true);
    }
  });

  test("'trainer' filters to Trainer cards", () => {
    const results = searchCards("trainer");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((c) => c.type === "Trainer")).toBe(true);
  });

  test("resolves a plain name", () => {
    const results = searchCards("pikachu");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name.toLowerCase()).toContain("pikachu");
  });

  test("tolerates a single-character typo", () => {
    const results = searchCards("charizrd");
    expect(
      results.some((c) => c.name.toLowerCase().includes("charizard")),
    ).toBe(true);
  });

  test("a rarity-only filter narrows without a name", () => {
    const results = searchCards("star");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((c) => c.rarity === "s1" || c.rarity === "s2")).toBe(
      true,
    );
  });

  test("empty query returns nothing", () => {
    expect(searchCards("")).toEqual([]);
    expect(searchCards("   ")).toEqual([]);
  });

  test("respects the result limit", () => {
    expect(searchCards("ex", 5).length).toBeLessThanOrEqual(5);
  });
});
