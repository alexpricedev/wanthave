#!/usr/bin/env bun
/**
 * Build the static card catalogue that ships with the app.
 *
 * Two community datasets are merged on set+number:
 *   - flimsylion (.cache/flib.json) — the precise rarity scheme (letter codes
 *     C/U/R/RR/AR/SR/SAR/S/SSR/...). This is the ONLY source that distinguishes
 *     shiny (S/SSR) from the star full-arts; the glyph-based feeds collapse them.
 *   - chase-manning (.cache/chase.json) — the ex / full-art / card-type (Trainer)
 *     attributes that flib doesn't carry.
 * No image bytes are stored here. Art lives in our own bucket, keyed by card id;
 * run `bun run scripts/sync-card-art.ts` after adding a set to mirror it.
 *
 * Only the tradeable rarities survive the filter: ◆1–◆4, ★1, ★2, and ✵1/✵2
 * shiny (tradeable since the Oct 2025 update, ★2+ at a Shinedust cost). Immersive
 * (★3), Crown, and promos are dropped, matching the "tradeable only" rule.
 *
 * Run: `bun run scripts/build-cards.ts` (requires .cache/flib.json and
 * .cache/chase.json). The output JSON is checked in; not part of the runtime.
 */

// flimsylion card — set + number is the join key; rarity is the precise code.
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

// chase-manning card — id like "a1-001" joins to flib's set+number.
type ChaseCard = {
  id: string;
  ex?: string;
  fullart?: string;
  type?: string;
  pack?: string;
};

// flib letter code → our normalized rarity code. Tradeable tiers only; anything
// absent here (IM immersive ★3, UR crown) is non-tradeable and dropped.
const RARITY_MAP: Record<string, string> = {
  C: "d1",
  U: "d2",
  R: "d3",
  RR: "d4",
  AR: "s1", // ★1 art rare (full art)
  SR: "s2", // ★2 super rare (rainbow full-art EX)
  SAR: "s2", // ★2 special art rare — same in-game trade tier as SR
  S: "sh1", // ✵1 shiny
  SSR: "sh2", // ✵2 shiny (super)
};

// The star tiers are always full-art; used as a fallback when a card has no
// chase-manning row (a handful of shiny cards only appear in flib).
const FULLART_CODES = new Set(["s1", "s2", "sh1", "sh2"]);

// chase-manning lags flib by a release or two, so the newest set arrives with no
// chase rows at all. Its `ex` and `fullart` columns are reproducible from flib
// alone (they agree exactly with the " ex" name suffix and FULLART_CODES across
// the whole catalogue), but `type` is not. Search only cares about Trainer vs
// not, and flib's asset filename prefix carries that: cTR_ = Trainer, cPK_ =
// Pokémon. The Pokémon energy type stays null until chase catches up.
const typeFromImage = (image: string | undefined): string | null =>
  image?.startsWith("cTR") ? "Trainer" : null;

// Ordered oldest → newest. Set codes are how the community refers to sets; the
// display name is added where it's well established, otherwise the code stands
// on its own.
const SET_ORDER = [
  "a1", "a1a", "a2", "a2a", "a2b", "a3", "a3a", "a3b",
  "a4", "a4a", "a4b", "b1", "b1a", "b2", "b2a", "b2b", "b3", "b3a", "b3b",
  "b4", "b4a",
];

// English set names, sourced from the flibustier/pokemon-tcg-pocket-database
// `dist/sets.json` (which agrees with the names we already had). Kept in sync
// with SET_ORDER so every browsable set shows its name in the picker.
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
};

// a1 → A1, a1a → A1a, b2b → B2b (uppercase leading letter only)
const setCodeOf = (prefix: string): string =>
  prefix.replace(/^[a-z]/, (c) => c.toUpperCase());

const flib = JSON.parse(
  await Bun.file(".cache/flib.json").text(),
) as FlibCard[];
const chase = JSON.parse(
  await Bun.file(".cache/chase.json").text(),
) as ChaseCard[];

const chaseById = new Map(chase.map((c) => [c.id, c]));
const setRank = new Map(SET_ORDER.map((s, i) => [s, i]));

type OutCard = {
  id: string;
  name: string;
  set: string; // display set code, e.g. "A1a"
  setPrefix: string; // lowercase prefix used for ordering, e.g. "a1a"
  number: number;
  rarity: string; // d1|d2|d3|d4|s1|s2|sh1|sh2
  ex: boolean;
  fa: boolean; // full-art
  type: string | null;
  pack: string | null;
};

const out: OutCard[] = [];
for (const f of flib) {
  const rarity = RARITY_MAP[f.rarity];
  if (!rarity) continue; // non-tradeable rarity
  const prefix = String(f.set).toLowerCase();
  if (!setRank.has(prefix)) continue; // promos / non-numbered sets

  const id = `${prefix}-${String(f.number).padStart(3, "0")}`;
  const meta = chaseById.get(id);

  out.push({
    id,
    name: f.name,
    set: setCodeOf(prefix),
    setPrefix: prefix,
    number: f.number,
    rarity,
    ex: meta ? meta.ex === "Yes" : / ex$/i.test(f.name),
    fa: meta ? meta.fullart === "Yes" : FULLART_CODES.has(rarity),
    type: meta?.type ?? typeFromImage(f.image),
    pack: meta?.pack ?? f.packs?.[0] ?? null,
  });
}

out.sort((a, b) => {
  const sr = (setRank.get(a.setPrefix) ?? 0) - (setRank.get(b.setPrefix) ?? 0);
  return sr !== 0 ? sr : a.number - b.number;
});

const sets = SET_ORDER.map((prefix) => ({
  code: setCodeOf(prefix),
  prefix,
  name: SET_NAMES[prefix] ?? null,
  count: out.filter((c) => c.setPrefix === prefix).length,
})).filter((s) => s.count > 0);

const payload = {
  generatedFrom: "flimsylion + chase-manning pokemon-tcg-pocket datasets",
  sets,
  cards: out,
};
// Indented, not minified: the file is checked in, so adding a set should show
// up as a few hundred added lines rather than one rewritten 1MB line.
await Bun.write(
  "src/server/data/cards.json",
  `${JSON.stringify(payload, null, 2)}\n`,
);

const byRarity = out.reduce<Record<string, number>>((acc, c) => {
  acc[c.rarity] = (acc[c.rarity] ?? 0) + 1;
  return acc;
}, {});
console.log(
  `Wrote ${out.length} tradeable cards across ${sets.length} sets.`,
  byRarity,
);
