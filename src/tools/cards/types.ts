// The contract behind `bun run scripts/build-cards.ts`.
//
// The catalogue is built once, offline, and checked in; nothing here runs at
// request time. Splitting the data out means a fork isn't stuck with the two
// upstreams this project happens to use: a source knows how to turn *some*
// dataset into our normalized card shape, and an enricher fills in optional
// fields for cards it recognises. Pick them with CARD_SOURCE / CARD_ENRICHERS,
// or register your own in ./index.ts — see docs/adding-a-set.md.

import type { RarityCode } from "@server/services/cards";

export interface CatalogueSet {
  /** Display code, e.g. "A1a". */
  code: string;
  /** Lowercase prefix used for ordering and ids, e.g. "a1a". */
  prefix: string;
  name: string | null;
}

/** One card, already normalized to the shape the app reads. */
export interface CatalogueCard {
  id: string;
  name: string;
  set: string;
  setPrefix: string;
  number: number;
  rarity: RarityCode;
  ex: boolean;
  fa: boolean;
  type: string | null;
  pack: string | null;
}

/**
 * Fields a second dataset can contribute. Only present keys are applied, so an
 * enricher that knows about `pack` but not `type` leaves `type` alone.
 */
export type CardEnrichment = Partial<
  Pick<CatalogueCard, "ex" | "fa" | "type" | "pack">
>;

/** A dataset that can stand alone as the catalogue. */
export interface CardSource {
  /** Stable id for CARD_SOURCE, e.g. "flibustier". */
  id: string;
  /** Short label used in the generated `generatedFrom` line. */
  name: string;
  /** Licence of the data, printed at build time so you ship nothing unknowingly. */
  licence: string;
  /** Ordered oldest set first: the order drives the picker and LATEST_SET. */
  load(): Promise<{ sets: CatalogueSet[]; cards: CatalogueCard[] }>;
}

/** Optional metadata layered over a source, keyed by card id. */
export interface CardEnricher {
  id: string;
  name: string;
  licence: string;
  load(): Promise<Map<string, CardEnrichment>>;
}
