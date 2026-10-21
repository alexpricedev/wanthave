// The provider registry. To plug in a different dataset, add a file next to
// this one that exports a CardSource or CardEnricher, register it below, and
// select it by id:
//
//   CARD_SOURCE=my-source CARD_ENRICHERS=my-enricher bun run scripts/build-cards.ts
//
// Setting CARD_ENRICHERS to an empty string drops all enrichment — that's how
// you build an MIT-only catalogue from the default source.

import { flibustier } from "./flibustier";
import { pocketDecks } from "./pocketdecks";
import type { CardEnricher, CardSource } from "./types";

export const CARD_SOURCES: Record<string, CardSource> = {
  [flibustier.id]: flibustier,
};

export const CARD_ENRICHERS: Record<string, CardEnricher> = {
  [pocketDecks.id]: pocketDecks,
};

export const DEFAULT_SOURCE = flibustier.id;
export const DEFAULT_ENRICHERS = [pocketDecks.id];

/** Resolve ids to providers, failing loudly rather than silently skipping one. */
export const resolveProviders = (options: {
  sourceId: string;
  enricherIds: string[];
}): { source: CardSource; enrichers: CardEnricher[] } => {
  const source = CARD_SOURCES[options.sourceId];
  if (!source) {
    throw new Error(
      `Unknown CARD_SOURCE "${options.sourceId}". Known: ${Object.keys(CARD_SOURCES).join(", ")}`,
    );
  }

  const enrichers = options.enricherIds.map((id) => {
    const enricher = CARD_ENRICHERS[id];
    if (!enricher) {
      throw new Error(
        `Unknown CARD_ENRICHERS entry "${id}". Known: ${Object.keys(CARD_ENRICHERS).join(", ")}`,
      );
    }
    return enricher;
  });

  return { source, enrichers };
};
