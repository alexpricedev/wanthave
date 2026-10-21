// Merge a source with any enrichers into the exact file the app imports.
// Kept separate from the script so the merge rules are testable without
// touching the network or the filesystem.

import type {
  CardEnricher,
  CardEnrichment,
  CardSource,
  CatalogueCard,
  CatalogueSet,
} from "./types";

export type CatalogueSetMeta = CatalogueSet & { count: number };

export interface CatalogueFile {
  generatedFrom: string;
  sets: CatalogueSetMeta[];
  cards: CatalogueCard[];
}

const defined = (fields: CardEnrichment): CardEnrichment => {
  const result: CardEnrichment = {};
  if (fields.ex !== undefined) result.ex = fields.ex;
  if (fields.fa !== undefined) result.fa = fields.fa;
  if (fields.type !== undefined) result.type = fields.type;
  if (fields.pack !== undefined) result.pack = fields.pack;
  return result;
};

export interface BuildOptions {
  source: CardSource;
  /** Applied in order; a later enricher wins field by field. */
  enrichers?: CardEnricher[];
}

export const buildCatalogue = async ({
  source,
  enrichers = [],
}: BuildOptions): Promise<CatalogueFile> => {
  const { sets, cards } = await source.load();

  if (cards.length === 0) {
    throw new Error(`Source "${source.id}" produced no tradeable cards`);
  }

  const enrichment = new Map<string, CardEnrichment>();
  for (const enricher of enrichers) {
    for (const [id, fields] of await enricher.load()) {
      enrichment.set(id, { ...enrichment.get(id), ...defined(fields) });
    }
  }

  const setRank = new Map(sets.map((set, index) => [set.prefix, index]));

  const merged = cards
    .filter((card) => setRank.has(card.setPrefix))
    .map((card) => {
      const extra = enrichment.get(card.id);
      return extra ? { ...card, ...extra } : card;
    })
    .sort((a, b) => {
      const rank =
        (setRank.get(a.setPrefix) ?? 0) - (setRank.get(b.setPrefix) ?? 0);
      return rank !== 0 ? rank : a.number - b.number;
    });

  const counts = new Map<string, number>();
  for (const card of merged) {
    counts.set(card.setPrefix, (counts.get(card.setPrefix) ?? 0) + 1);
  }

  return {
    generatedFrom: `${[source, ...enrichers]
      .map((provider) => provider.name)
      .join(" + ")} pokemon-tcg-pocket datasets`,
    sets: sets
      .map((set) => ({ ...set, count: counts.get(set.prefix) ?? 0 }))
      .filter((set) => set.count > 0),
    cards: merged,
  };
};

export const serialiseCatalogue = (catalogue: CatalogueFile): string =>
  // Indented, not minified: the file is checked in, so adding a set should show
  // up as a few hundred added lines rather than one rewritten 1MB line.
  `${JSON.stringify(catalogue, null, 2)}\n`;
