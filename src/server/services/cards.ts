// The card catalogue — static reference data loaded once into memory from the
// checked-in JSON (see scripts/build-cards.ts). Only tradeable rarities (◆1–◆4,
// ★1, ★2, and ✵1/✵2 shiny) exist here, so the "zero invalid-rarity rule" is
// enforced at the data layer: a card the catalogue doesn't know about can never
// reach a list. Immersive (★3), Crown, and promos are non-tradeable and absent.

import catalogData from "../data/cards.json";

export type RarityCode =
  | "d1"
  | "d2"
  | "d3"
  | "d4"
  | "s1"
  | "s2"
  | "sh1"
  | "sh2";

export interface Card {
  id: string;
  name: string;
  set: string;
  setPrefix: string;
  number: number;
  rarity: RarityCode;
  ex: boolean;
  /** Full-art (illustration spans the whole card). */
  fa: boolean;
  type: string | null;
  pack: string | null;
}

export interface CardSet {
  code: string;
  prefix: string;
  name: string | null;
  count: number;
}

interface RarityMeta {
  code: RarityCode;
  /** In-game symbol, e.g. "◆1" / "★1". */
  label: string;
  /** Official in-game tier name, e.g. "Double Rare" / "Super Rare". */
  name: string;
  /** Ordering used to group lists (diamonds ascending, then one-star). */
  rank: number;
}

export const RARITIES: RarityMeta[] = [
  { code: "d1", label: "◆1", name: "Common", rank: 1 },
  { code: "d2", label: "◆2", name: "Uncommon", rank: 2 },
  { code: "d3", label: "◆3", name: "Rare", rank: 3 },
  { code: "d4", label: "◆4", name: "Double Rare", rank: 4 },
  { code: "s1", label: "★1", name: "Art Rare", rank: 5 },
  { code: "s2", label: "★2", name: "Super Rare", rank: 6 },
  { code: "sh1", label: "✵1", name: "Shiny Rare", rank: 7 },
  { code: "sh2", label: "✵2", name: "Double Shiny Rare", rank: 8 },
];

const RARITY_BY_CODE = new Map(RARITIES.map((r) => [r.code, r]));

export const rarityLabel = (code: RarityCode): string =>
  RARITY_BY_CODE.get(code)?.label ?? code;
export const rarityName = (code: RarityCode): string =>
  RARITY_BY_CODE.get(code)?.name ?? code;
export const rarityRank = (code: RarityCode): number =>
  RARITY_BY_CODE.get(code)?.rank ?? 99;

const catalog = catalogData as { sets: CardSet[]; cards: Card[] };

export const SETS: CardSet[] = catalog.sets;
const CARDS: Card[] = catalog.cards;
const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));
const SET_BY_CODE = new Map(SETS.map((s) => [s.code, s]));

export const getCardById = (id: string): Card | undefined => CARD_BY_ID.get(id);

export const isValidCardId = (id: string): boolean => CARD_BY_ID.has(id);

export const getCardsByIds = (ids: string[]): Card[] =>
  ids.map((id) => CARD_BY_ID.get(id)).filter((c): c is Card => c !== undefined);

export const getSet = (code: string): CardSet | undefined =>
  SET_BY_CODE.get(code);

export const getCardsBySet = (code: string): Card[] =>
  CARDS.filter((c) => c.set === code);

// Where the image proxy reads a card's art from in our own S3 bucket. The
// bucket is private and this key never reaches the browser — art is always
// served through /img/card/:id (see services/card-images.ts), which keeps CSP
// `img-src 'self'` intact and gives the OG renderer local bytes.
//
// The bucket is populated by scripts/sync-card-art.ts. We mirror rather than
// proxy an upstream CDN because the community art host publishes a new set's
// images days after the set itself, and that gap is visible to users.
export const artObjectKey = (card: Card): string => `cards/${card.id}.webp`;

// ─── Slang-aware search ────────────────────────────────────────────────────
// Resolves community shorthand ("RR chsr EX", "shiny pika", "FA trainer")
// alongside full names. A query is split into rarity filters, attribute filters
// (ex / full-art / trainer), and name tokens (alias-expanded); cards are then
// scored on how many name tokens they match.

// Shorthand → the canonical name fragment it should match. Covers the popular
// chase mons the community abbreviates; unknown tokens fall through as literals.
const NAME_ALIASES: Record<string, string> = {
  zard: "charizard",
  chsr: "charizard",
  char: "charizard",
  pika: "pikachu",
  mew2: "mewtwo",
  gardy: "gardevoir",
  gyara: "gyarados",
  dnite: "dragonite",
  drag: "dragonite",
  ttar: "tyranitar",
  tar: "tyranitar",
  ray: "rayquaza",
  rayray: "rayquaza",
  chomp: "garchomp",
  gren: "greninja",
  blast: "blastoise",
  venu: "venusaur",
  gar: "gengar",
  mimi: "mimikyu",
  eievui: "eevee",
  zap: "zapdos",
  moltres: "moltres",
  artic: "articuno",
  luca: "lucario",
  celebi: "celebi",
  giratina: "giratina",
  dialga: "dialga",
  palkia: "palkia",
  lugia: "lugia",
  hooh: "ho-oh",
  snorlax: "snorlax",
  machamp: "machamp",
  alakazam: "alakazam",
  darkrai: "darkrai",
  arceus: "arceus",
  marshadow: "marshadow",
};

// Rarity shorthand → the rarity code(s) it constrains the search to.
const RARITY_TOKENS: Record<string, RarityCode[]> = {
  // Diamonds ◆1–◆4
  "1d": ["d1"],
  "2d": ["d2"],
  "3d": ["d3"],
  "4d": ["d4"],
  "1diamond": ["d1"],
  "2diamond": ["d2"],
  "3diamond": ["d3"],
  "4diamond": ["d4"],
  diamond: ["d1", "d2", "d3", "d4"],
  diamonds: ["d1", "d2", "d3", "d4"],
  // Stars ★1–★2 (the full-art tiers)
  star: ["s1", "s2"],
  stars: ["s1", "s2"],
  "1star": ["s1"],
  onestar: ["s1"],
  s1: ["s1"],
  "2star": ["s2"],
  twostar: ["s2"],
  s2: ["s2"],
  // ★2 special-art full-arts — what the community means by "rainbow rare".
  // (Note: "RR" is Double Rare / ◆4 in strict TCG shorthand — reach that with
  // "4d"/"4diamond". Here it points at the rainbow ★2 cards people trade.)
  rr: ["s2"],
  rainbow: ["s2"],
  sir: ["s2"],
  sar: ["s2"],
  sr: ["s2"],
  // Shiny ✵1–✵2
  shiny: ["sh1", "sh2"],
  shiny1: ["sh1"],
  "1shiny": ["sh1"],
  shiny2: ["sh2"],
  "2shiny": ["sh2"],
};

// Attribute shorthand — filters that cut across rarities.
const EX_TOKENS = new Set(["ex", "gx"]);
const FULLART_TOKENS = new Set(["fa", "fullart"]);
const TRAINER_TOKENS = new Set([
  "trainer",
  "trainers",
  "supporter",
  "supporters",
]);

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface ParsedQuery {
  nameTokens: string[];
  rarities: Set<RarityCode>;
  requireEx: boolean;
  requireFullArt: boolean;
  requireTrainer: boolean;
}

const parseQuery = (query: string): ParsedQuery => {
  const rarities = new Set<RarityCode>();
  const nameTokens: string[] = [];
  let requireEx = false;
  let requireFullArt = false;
  let requireTrainer = false;

  // Collapse multi-word filter phrases before tokenizing so they read as one
  // filter rather than stray name tokens: "full art" → fullart, and spaced
  // rarity phrases like "2 star" / "4 diamonds" / "1 shiny" → 2star/4diamond/…
  // (plurals normalized to the singular token form).
  const normalized = normalize(query)
    .replace(/\bfull art\b/g, "fullart")
    .replace(
      /\b(\d)\s+(d|diamonds?|stars?|shiny)\b/g,
      (_, n, word) => n + word.replace(/s$/, ""),
    );

  for (const token of normalized.split(" ")) {
    if (!token) continue;
    if (EX_TOKENS.has(token)) {
      requireEx = true;
      continue;
    }
    if (FULLART_TOKENS.has(token)) {
      requireFullArt = true;
      continue;
    }
    if (TRAINER_TOKENS.has(token)) {
      requireTrainer = true;
      continue;
    }
    if (RARITY_TOKENS[token]) {
      for (const r of RARITY_TOKENS[token]) rarities.add(r);
      continue;
    }
    nameTokens.push(NAME_ALIASES[token] ?? token);
  }

  return { nameTokens, rarities, requireEx, requireFullArt, requireTrainer };
};

// Levenshtein distance capped at 1 — cheap tolerance for a single-character
// typo ("charizrd"). Returns 2 for anything worse so callers can treat it as
// "no fuzzy match".
const within1 = (a: string, b: string): boolean => {
  if (a === b) return true;
  const dl = a.length - b.length;
  if (dl < -1 || dl > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  if (i < a.length || j < b.length) edits++;
  return edits <= 1;
};

const tokenMatchesCard = (token: string, nameWords: string[]): boolean => {
  for (const word of nameWords) {
    if (word.includes(token)) return true;
    if (token.length >= 5 && within1(token, word)) return true;
  }
  return false;
};

export interface SearchResult {
  card: Card;
  score: number;
}

export const searchCards = (
  query: string,
  limit = 40,
  setFilter = "",
): Card[] => {
  const { nameTokens, rarities, requireEx, requireFullArt, requireTrainer } =
    parseQuery(query);

  // A query with no name and no filter at all is too broad to be useful.
  if (
    nameTokens.length === 0 &&
    rarities.size === 0 &&
    !requireEx &&
    !requireFullArt &&
    !requireTrainer
  ) {
    return [];
  }

  const results: SearchResult[] = [];

  for (const card of CARDS) {
    if (setFilter && card.set !== setFilter) continue;
    if (rarities.size > 0 && !rarities.has(card.rarity)) continue;
    if (requireEx && !card.ex) continue;
    if (requireFullArt && !card.fa) continue;
    if (requireTrainer && card.type !== "Trainer") continue;

    const nameWords = card.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);

    let matched = 0;
    let exact = 0;
    for (const token of nameTokens) {
      if (nameWords.some((w) => w === token)) {
        matched++;
        exact++;
      } else if (tokenMatchesCard(token, nameWords)) {
        matched++;
      }
    }

    if (nameTokens.length > 0 && matched < nameTokens.length) continue;

    // Score: prefer whole-word hits, newer sets, then lower card numbers so the
    // base non-ex print tends to lead when a query is otherwise ambiguous.
    const score =
      exact * 100 + matched * 40 + (card.ex ? 5 : 0) + rarityRank(card.rarity);
    results.push({ card, score });
  }

  results.sort(
    (a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name),
  );
  return results.slice(0, limit).map((r) => r.card);
};
