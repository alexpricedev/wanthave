// Optional enricher: the PocketDecks/pokemon-tcg-pocket-cards dataset
// (AGPL-3.0), which fills in the fields flib doesn't carry — energy type,
// multi-pack labels like "Shared(Genetic Apex)", and explicit ex/full-art flags.
//
// Because of that licence, this provider is swappable and optional: run with
// CARD_ENRICHERS= (empty) to build an MIT-only catalogue. See NOTICE.md.

import { loadJson } from "./load";
import type { CardEnricher, CardEnrichment } from "./types";

// Points at the repo's current home; the old chase-manning path 301s here.
const URL =
  "https://raw.githubusercontent.com/PocketDecks/pokemon-tcg-pocket-cards/main/data/v4/cards.json";

type PocketCard = {
  id: string;
  ex?: string;
  fullart?: string;
  type?: string;
  pack?: string;
};

export const pocketDecks: CardEnricher = {
  id: "pocketdecks",
  name: "chase-manning",
  licence: "AGPL-3.0",

  async load() {
    const raw = await loadJson<PocketCard[]>("chase.json", URL);
    if (!Array.isArray(raw)) {
      throw new Error("chase.json did not parse as an array — upstream moved?");
    }

    const byId = new Map<string, CardEnrichment>();

    for (const card of raw) {
      byId.set(card.id, {
        // Present for every row, so an explicit "No" overrides a name-derived
        // guess — that's what the previous inline merge did too.
        ex: card.ex === "Yes",
        fa: card.fullart === "Yes",
        // Only when defined, so the source's own fallbacks survive.
        ...(card.type ? { type: card.type } : {}),
        ...(card.pack ? { pack: card.pack } : {}),
      });
    }

    return byId;
  },
};
