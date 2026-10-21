#!/usr/bin/env bun
/**
 * Build the static card catalogue that ships with the app.
 *
 * Two pieces are pluggable (see src/tools/cards/):
 *
 *   CARD_SOURCE     one dataset that stands alone as the catalogue
 *                   (default: flibustier, MIT)
 *   CARD_ENRICHERS  comma-separated datasets layered on top, field by field
 *                   (default: pocketdecks, AGPL-3.0 — set to "" to drop it)
 *
 * Inputs are cached under .cache/ and only fetched when absent — delete the
 * file to refresh it. The output JSON is checked in and is not part of the
 * runtime: no network call happens while the app is serving.
 *
 * Run: `bun run scripts/build-cards.ts`
 *      `CARD_ENRICHERS= bun run scripts/build-cards.ts`   # MIT-only catalogue
 *
 * Art is a separate step: after adding a set, run scripts/sync-card-art.ts.
 */

import {
  DEFAULT_ENRICHERS,
  DEFAULT_SOURCE,
  resolveProviders,
} from "../src/tools/cards";
import {
  buildCatalogue,
  serialiseCatalogue,
} from "../src/tools/cards/build";

const outputPath = "src/server/data/cards.json";

const sourceId = process.env.CARD_SOURCE ?? DEFAULT_SOURCE;
// An explicitly empty CARD_ENRICHERS means "no enrichment"; unset means default.
const enricherIds =
  process.env.CARD_ENRICHERS === undefined
    ? DEFAULT_ENRICHERS
    : process.env.CARD_ENRICHERS.split(",")
        .map((id) => id.trim())
        .filter(Boolean);

try {
  const { source, enrichers } = resolveProviders({ sourceId, enricherIds });
  const catalogue = await buildCatalogue({ source, enrichers });
  await Bun.write(outputPath, serialiseCatalogue(catalogue));

  const byRarity = catalogue.cards.reduce<Record<string, number>>(
    (acc, card) => {
      acc[card.rarity] = (acc[card.rarity] ?? 0) + 1;
      return acc;
    },
    {},
  );

  console.log(
    `Providers: ${[source, ...enrichers]
      .map((provider) => `${provider.name} (${provider.licence})`)
      .join(", ")}`,
  );
  console.log(
    `Wrote ${catalogue.cards.length} tradeable cards across ${catalogue.sets.length} sets to ${outputPath}.`,
  );
  console.log(byRarity);
} catch (error) {
  // A provider id typo or an upstream shape change is a message, not a stack.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
