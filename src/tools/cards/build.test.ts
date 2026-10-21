import { describe, expect, test } from "bun:test";
import { buildCatalogue } from "./build";
import type { CardEnricher, CardSource, CatalogueCard } from "./types";

const card = (overrides: Partial<CatalogueCard>): CatalogueCard => ({
  id: "a1-001",
  name: "Bulbasaur",
  set: "A1",
  setPrefix: "a1",
  number: 1,
  rarity: "d1",
  ex: false,
  fa: false,
  type: null,
  pack: "Mewtwo",
  ...overrides,
});

const sourceOf = (cards: CatalogueCard[]): CardSource => ({
  id: "fixture",
  name: "fixture",
  licence: "MIT",
  load: async () => ({
    sets: [
      { code: "A1", prefix: "a1", name: "Genetic Apex" },
      { code: "A1a", prefix: "a1a", name: "Mythical Island" },
      { code: "A2", prefix: "a2", name: "Empty Set" },
    ],
    cards,
  }),
});

const enricherOf = (
  id: string,
  entries: Record<
    string,
    Partial<Pick<CatalogueCard, "ex" | "fa" | "type" | "pack">>
  >,
): CardEnricher => ({
  id,
  name: id,
  licence: "test",
  load: async () => new Map(Object.entries(entries)),
});

describe("buildCatalogue", () => {
  test("layers enrichment over the source by card id", async () => {
    const catalogue = await buildCatalogue({
      source: sourceOf([card({})]),
      enrichers: [
        enricherOf("extra", {
          "a1-001": { type: "Grass", pack: "Shared(Genetic Apex)" },
        }),
      ],
    });

    expect(catalogue.cards[0]).toMatchObject({
      type: "Grass",
      pack: "Shared(Genetic Apex)",
      name: "Bulbasaur",
    });
  });

  test("ignores cards the enricher doesn't know", async () => {
    const catalogue = await buildCatalogue({
      source: sourceOf([card({ id: "a1-002", name: "Ivysaur" })]),
      enrichers: [enricherOf("extra", { "a1-001": { type: "Grass" } })],
    });

    expect(catalogue.cards[0]).toMatchObject({ type: null, name: "Ivysaur" });
  });

  test("only applies fields the enricher actually provides", async () => {
    const catalogue = await buildCatalogue({
      source: sourceOf([card({ type: "Trainer" })]),
      enrichers: [enricherOf("extra", { "a1-001": { ex: true } })],
    });

    // `type` was absent from the enrichment, so the source's value survives.
    expect(catalogue.cards[0]).toMatchObject({ ex: true, type: "Trainer" });
  });

  test("lets a later enricher win field by field", async () => {
    const catalogue = await buildCatalogue({
      source: sourceOf([card({})]),
      enrichers: [
        enricherOf("first", { "a1-001": { type: "Grass", pack: "One" } }),
        enricherOf("second", { "a1-001": { pack: "Two" } }),
      ],
    });

    expect(catalogue.cards[0]).toMatchObject({ type: "Grass", pack: "Two" });
  });

  test("orders cards by the source's set order, then number", async () => {
    const catalogue = await buildCatalogue({
      source: sourceOf([
        card({ id: "a1a-002", setPrefix: "a1a", number: 2 }),
        card({ id: "a1-002", setPrefix: "a1", number: 2 }),
        card({ id: "a1-001", setPrefix: "a1", number: 1 }),
      ]),
    });

    expect(catalogue.cards.map((c) => c.id)).toEqual([
      "a1-001",
      "a1-002",
      "a1a-002",
    ]);
  });

  test("counts cards per set and drops sets with none", async () => {
    const catalogue = await buildCatalogue({
      source: sourceOf([
        card({ id: "a1-001", setPrefix: "a1" }),
        card({ id: "a1-002", setPrefix: "a1", number: 2 }),
        card({ id: "a1a-001", setPrefix: "a1a" }),
      ]),
    });

    expect(catalogue.sets).toEqual([
      { code: "A1", prefix: "a1", name: "Genetic Apex", count: 2 },
      { code: "A1a", prefix: "a1a", name: "Mythical Island", count: 1 },
    ]);
  });

  test("records which providers produced the file", async () => {
    const catalogue = await buildCatalogue({
      source: sourceOf([card({})]),
      enrichers: [enricherOf("extra", {})],
    });

    expect(catalogue.generatedFrom).toBe(
      "fixture + extra pokemon-tcg-pocket datasets",
    );
  });

  test("refuses an empty catalogue rather than writing an unusable file", async () => {
    await expect(buildCatalogue({ source: sourceOf([]) })).rejects.toThrow(
      "produced no tradeable cards",
    );
  });
});
