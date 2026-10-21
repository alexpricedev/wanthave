// Default catalogue source: the flibustier/pokemon-tcg-pocket-database JSON
// feed (MIT). It carries sets, names, numbers, precise rarity codes and packs —
// enough to stand alone. Fields it doesn't carry (energy type, multi-pack
// labels) are left null here and can be filled in by an enricher.

import { loadJson } from "./load";
import type { CardSource, CatalogueCard, CatalogueSet } from "./types";

const URL =
  "https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.json";

type FlibCard = {
  set: string;
  number: number;
  rarity: string;
  name: string;
  packs?: string[];
  // Asset filename, e.g. "cPK_10_000010_00_FUSHIGIDANE_C.webp". The prefix is
  // the only signal flib carries for Pokémon (cPK) vs Trainer (cTR).
  image?: string;
};

// flib letter code → our normalized rarity code. Tradeable tiers only; anything
// absent here (immersive ★3, crown) is non-tradeable and dropped.
const RARITY_MAP: Record<string, CatalogueCard["rarity"]> = {
  C: "d1",
  U: "d2",
  R: "d3",
  RR: "d4",
  AR: "s1", // ★1 art rare
  SR: "s2", // ★2 super rare (rainbow full-art ex)
  SAR: "s2", // ★2 special art rare — same in-game trade tier as SR
  S: "sh1", // ✵1 shiny
  SSR: "sh2", // ✵2 shiny (super)
};

// The star tiers are always full-art.
const FULLART_CODES = new Set(["s1", "s2", "sh1", "sh2"]);

// a1 → A1, a1a → A1a, b2b → B2b (uppercase leading letter only)
const setCodeOf = (prefix: string) =>
  prefix.replace(/^[a-z]/, (c) => c.toUpperCase());

const typeFromImage = (image: string | undefined): string | null =>
  image?.startsWith("cTR") ? "Trainer" : null;

// Ordered oldest → newest. Set codes are how the community refers to sets; the
// display name is added where it's well established, otherwise the code stands
// on its own. A new set is added here and to SET_NAMES.
const SET_ORDER = [
  "a1",
  "a1a",
  "a2",
  "a2a",
  "a2b",
  "a3",
  "a3a",
  "a3b",
  "a4",
  "a4a",
  "a4b",
  "b1",
  "b1a",
  "b2",
  "b2a",
  "b2b",
  "b3",
  "b3a",
  "b3b",
  "b4",
  "b4a",
  "b4b",
];

const SET_NAMES: Record<string, string> = {
  a1: "Genetic Apex",
  a1a: "Mythical Island",
  a2: "Space-Time Smackdown",
  a2a: "Triumphant Light",
  a2b: "Shining Revelry",
  a3: "Celestial Guardians",
  a3a: "Extradimensional Crisis",
  a3b: "Eevee Grove",
  a4: "Wisdom of Sea and Sky",
  a4a: "Secluded Springs",
  a4b: "Deluxe Pack: ex",
  b1: "Mega Rising",
  b1a: "Crimson Blaze",
  b2: "Fantastical Parade",
  b2a: "Paldean Wonders",
  b2b: "Mega Shine",
  b3: "Pulsing Aura",
  b3a: "Paradox Drive",
  b3b: "Everyday Wonders",
  b4: "Ruler of the Skies",
  b4a: "Team Rocket’s Ambition",
  b4b: "Deluxe Pack: Mega",
};

export const flibustier: CardSource = {
  id: "flibustier",
  name: "flimsylion",
  licence: "MIT",

  async load() {
    const raw = await loadJson<FlibCard[]>("flib.json", URL);
    if (!Array.isArray(raw)) {
      throw new Error("flib.json did not parse as an array — upstream moved?");
    }

    const setRank = new Map(SET_ORDER.map((prefix, index) => [prefix, index]));
    const cards: CatalogueCard[] = [];

    for (const card of raw) {
      const rarity = RARITY_MAP[card.rarity];
      if (!rarity) continue; // non-tradeable rarity
      const prefix = String(card.set).toLowerCase();
      if (!setRank.has(prefix)) continue; // promos / non-numbered sets

      cards.push({
        id: `${prefix}-${String(card.number).padStart(3, "0")}`,
        name: card.name,
        set: setCodeOf(prefix),
        setPrefix: prefix,
        number: card.number,
        rarity,
        ex: / ex$/i.test(card.name),
        fa: FULLART_CODES.has(rarity),
        type: typeFromImage(card.image),
        pack: card.packs?.[0] ?? null,
      });
    }

    cards.sort((a, b) => {
      const rank =
        (setRank.get(a.setPrefix) ?? 0) - (setRank.get(b.setPrefix) ?? 0);
      return rank !== 0 ? rank : a.number - b.number;
    });

    const sets: CatalogueSet[] = SET_ORDER.map((prefix) => ({
      code: setCodeOf(prefix),
      prefix,
      name: SET_NAMES[prefix] ?? null,
    }));

    return { sets, cards };
  },
};
