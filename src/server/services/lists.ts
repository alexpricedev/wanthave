import { randomBytes } from "node:crypto";
import { computeHMAC } from "../utils/crypto";
import { normalizeFriendId } from "../utils/friend-id";
import { type Card, getCardById, isValidCardId, rarityRank } from "./cards";
import { db } from "./database";

export type ListKind = "want" | "have";

// Anonymous links live 90 days; account links never expire (null).
export const ANON_TTL_DAYS = 90;

// Guardrails so a single list can't be used to abuse the OG renderer / storage.
export const MAX_CARDS_PER_SECTION = 60;
const MAX_QUANTITY = 99;

// Slug alphabet: lowercase + digits minus visually ambiguous glyphs
// (0/o, 1/l/i). 11 chars from a 30-symbol alphabet ≈ 54 bits — unguessable.
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const SLUG_LENGTH = 11;

export const generateSlug = (): string => {
  const bytes = randomBytes(SLUG_LENGTH);
  let slug = "";
  for (let i = 0; i < SLUG_LENGTH; i++) {
    slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return slug;
};

export interface CardInput {
  cardId: string;
  kind: ListKind;
  quantity: number;
}

export interface CreateListInput {
  cards: CardInput[];
  friendId?: string | null;
  userId?: string | null;
  title?: string | null;
  // HMAC of the creating device's claim token. Anonymous lists only — an
  // account list is already owned and has nothing to claim.
  claimTokenHash?: string | null;
}

export interface ListCardRow {
  card: Card;
  kind: ListKind;
  quantity: number;
  position: number;
}

export interface TradeListRow {
  id: string;
  slug: string;
  user_id: string | null;
  title: string | null;
  friend_id: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

// A row read back with the owner's display name joined on.
type OwnedTradeListRow = TradeListRow & { owner_name: string | null };

export interface TradeList {
  id: string;
  slug: string;
  userId: string | null;
  title: string | null;
  // Display name of the account that owns this list, when it has one. Read
  // live rather than snapshotted, so renaming updates every list at once.
  ownerName: string | null;
  friendId: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  wants: ListCardRow[];
  haves: ListCardRow[];
}

export interface ListSummary {
  slug: string;
  title: string | null;
  wantCount: number;
  haveCount: number;
  createdAt: Date;
  expiresAt: Date | null;
}

export const isExpired = (list: { expiresAt: Date | null }): boolean =>
  list.expiresAt !== null && list.expiresAt.getTime() < Date.now();

// Normalize/validate the requested cards: drop unknown ids, dedupe so a card
// appears in at most one section (first occurrence wins), clamp quantity, and
// cap each section. Returns the cleaned, position-assigned rows.
export const sanitizeCards = (
  cards: CardInput[],
): { cardId: string; kind: ListKind; quantity: number; position: number }[] => {
  const seen = new Set<string>();
  const counts: Record<ListKind, number> = { want: 0, have: 0 };
  const out: {
    cardId: string;
    kind: ListKind;
    quantity: number;
    position: number;
  }[] = [];

  for (const c of cards) {
    if (c.kind !== "want" && c.kind !== "have") continue;
    if (!isValidCardId(c.cardId) || seen.has(c.cardId)) continue;
    if (counts[c.kind] >= MAX_CARDS_PER_SECTION) continue;
    seen.add(c.cardId);
    const quantity = Math.min(
      Math.max(1, Math.floor(Number(c.quantity) || 1)),
      MAX_QUANTITY,
    );
    out.push({
      cardId: c.cardId,
      kind: c.kind,
      quantity,
      position: counts[c.kind],
    });
    counts[c.kind]++;
  }

  return out;
};

const hydrate = (
  row: TradeListRow,
  cardRows: ListCardRow[],
  ownerName: string | null = null,
): TradeList => {
  const wants = cardRows
    .filter((c) => c.kind === "want")
    .sort((a, b) => a.position - b.position);
  const haves = cardRows
    .filter((c) => c.kind === "have")
    .sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    slug: row.slug,
    userId: row.user_id,
    title: row.title,
    ownerName,
    friendId: row.friend_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    wants,
    haves,
  };
};

interface RawCardRow {
  card_id: string;
  kind: ListKind;
  quantity: number;
  position: number;
}

const loadCardRows = (rows: RawCardRow[]): ListCardRow[] => {
  const out: ListCardRow[] = [];
  for (const r of rows) {
    const card = getCardById(r.card_id);
    if (!card) continue;
    out.push({
      card,
      kind: r.kind,
      quantity: r.quantity,
      position: r.position,
    });
  }
  return out;
};

// Groups a section's cards by rarity, ordered ◆1→◆4, ★1→★2, then ✵1→✵2, for
// the public page and builder ("Pocket trades are same-rarity swaps").
export const groupByRarity = (
  cards: ListCardRow[],
): { rarity: Card["rarity"]; cards: ListCardRow[] }[] => {
  const groups = new Map<Card["rarity"], ListCardRow[]>();
  for (const c of cards) {
    const list = groups.get(c.card.rarity) ?? [];
    list.push(c);
    groups.set(c.card.rarity, list);
  }
  return [...groups.entries()]
    .sort((a, b) => rarityRank(a[0]) - rarityRank(b[0]))
    .map(([rarity, list]) => ({ rarity, cards: list }));
};

// Insert card rows for a list. Assumes `cards` are already sanitized.
const insertCards = async (
  tx: typeof db,
  listId: string,
  cards: ReturnType<typeof sanitizeCards>,
): Promise<void> => {
  for (const c of cards) {
    await tx`
      INSERT INTO trade_list_card (list_id, card_id, kind, quantity, position)
      VALUES (${listId}, ${c.cardId}, ${c.kind}, ${c.quantity}, ${c.position})
    `;
  }
};

export type CreateResult =
  | { ok: true; list: TradeList }
  | { ok: false; error: string };

export const createTradeList = async (
  input: CreateListInput,
): Promise<CreateResult> => {
  const cards = sanitizeCards(input.cards);
  if (cards.length === 0) {
    return {
      ok: false,
      error: "Add at least one card before creating a link.",
    };
  }

  const friendId = normalizeFriendId(input.friendId);
  const userId = input.userId ?? null;
  const title = input.title?.trim() || null;
  const expiresAt = userId
    ? null
    : new Date(Date.now() + ANON_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const claimTokenHash = userId ? null : (input.claimTokenHash ?? null);

  // Retry on the astronomically-unlikely slug collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug();
    try {
      const list = await db.begin(async (tx) => {
        const [row] = (await tx`
          INSERT INTO trade_list (slug, user_id, title, friend_id, expires_at, claim_token_hash)
          VALUES (${slug}, ${userId}, ${title}, ${friendId}, ${expiresAt}, ${claimTokenHash})
          RETURNING id, slug, user_id, title, friend_id, created_at, updated_at, expires_at,
            (SELECT display_name FROM users WHERE id = user_id) AS owner_name
        `) as OwnedTradeListRow[];
        await insertCards(tx, row.id, cards);
        return row;
      });
      return {
        ok: true,
        list: hydrate(list, loadCardRows(cardsToRaw(cards)), list.owner_name),
      };
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  return { ok: false, error: "Could not generate a unique link. Try again." };
};

// Turn sanitized inputs back into the shape loadCardRows expects, so a freshly
// created list is returned fully hydrated without a re-query.
const cardsToRaw = (cards: ReturnType<typeof sanitizeCards>): RawCardRow[] =>
  cards.map((c) => ({
    card_id: c.cardId,
    kind: c.kind,
    quantity: c.quantity,
    position: c.position,
  }));

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code: string }).code === "23505";

export const getTradeListBySlug = async (
  slug: string,
): Promise<TradeList | null> => {
  // The owner's display name comes along for the ride: it leads the page's
  // meta title, so the unfurl says whose list this is.
  const rows = (await db`
    SELECT l.id, l.slug, l.user_id, l.title, l.friend_id,
      l.created_at, l.updated_at, l.expires_at, u.display_name AS owner_name
    FROM trade_list l
    LEFT JOIN users u ON u.id = l.user_id
    WHERE l.slug = ${slug}
  `) as (TradeListRow & { owner_name: string | null })[];
  if (rows.length === 0) return null;

  const cardRows = (await db`
    SELECT card_id, kind, quantity, position
    FROM trade_list_card WHERE list_id = ${rows[0].id}
  `) as RawCardRow[];

  return hydrate(rows[0], loadCardRows(cardRows), rows[0].owner_name);
};

// Update an account-owned list in place (edit keeps the same slug/link). Returns
// the updated list, or null if it doesn't exist or isn't owned by the user.
export const updateTradeList = async (
  slug: string,
  userId: string,
  input: {
    cards: CardInput[];
    friendId?: string | null;
    title?: string | null;
  },
): Promise<TradeList | null> => {
  const cards = sanitizeCards(input.cards);
  if (cards.length === 0) return null;

  const friendId = normalizeFriendId(input.friendId);
  const title = input.title?.trim() || null;

  const updated = await db.begin(async (tx) => {
    const rows = (await tx`
      UPDATE trade_list
      SET friend_id = ${friendId}, title = ${title},
          updated_at = CURRENT_TIMESTAMP, og_image = NULL
      WHERE slug = ${slug} AND user_id = ${userId}
      RETURNING id, slug, user_id, title, friend_id, created_at, updated_at, expires_at,
        (SELECT display_name FROM users WHERE id = user_id) AS owner_name
    `) as OwnedTradeListRow[];
    if (rows.length === 0) return null;
    await tx`DELETE FROM trade_list_card WHERE list_id = ${rows[0].id}`;
    await insertCards(tx, rows[0].id, cards);
    return rows[0];
  });

  if (!updated) return null;
  return hydrate(updated, loadCardRows(cardsToRaw(cards)), updated.owner_name);
};

export interface ClaimedList {
  slug: string;
  friendId: string | null;
}

// Claim an anonymous list into an account: it stops expiring and starts
// belonging to the user. No-op if already owned by someone.
export const claimList = async (
  slug: string,
  userId: string,
): Promise<{ friendId: string | null } | null> => {
  const [row] = (await db`
    UPDATE trade_list
    SET user_id = ${userId}, expires_at = NULL, claim_token_hash = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE slug = ${slug} AND user_id IS NULL
    RETURNING friend_id
  `) as { friend_id: string | null }[];
  return row ? { friendId: row.friend_id } : null;
};

// Claim every anonymous list built on one device — the whole point of the claim
// token, so a guest who made three lists doesn't sign up and keep only one.
// Returns them newest first so the caller can land the user on the list they
// most likely just made.
export const claimListsByToken = async (
  claimTokenHash: string,
  userId: string,
): Promise<ClaimedList[]> => {
  const rows = (await db`
    UPDATE trade_list
    SET user_id = ${userId}, expires_at = NULL, claim_token_hash = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE claim_token_hash = ${claimTokenHash} AND user_id IS NULL
    RETURNING slug, friend_id, created_at
  `) as { slug: string; friend_id: string | null; created_at: string }[];

  // UPDATE ... RETURNING has no defined row order, so sort here.
  return rows
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .map((r) => ({ slug: r.slug, friendId: r.friend_id }));
};

// Does this device hold the claim token for an unclaimed list — i.e. did it
// build it? Lets the list page tell a guest the list is theirs before they have
// an account. Deliberately returns no token material to the caller.
export const isDeviceClaimant = async (
  slug: string,
  claimToken: string,
): Promise<boolean> => {
  const rows = await db`
    SELECT 1 FROM trade_list
    WHERE slug = ${slug} AND user_id IS NULL
      AND claim_token_hash = ${computeHMAC(claimToken)}
  `;
  return rows.length > 0;
};

export const deleteList = async (
  slug: string,
  userId: string,
): Promise<boolean> => {
  const result = await db`
    DELETE FROM trade_list WHERE slug = ${slug} AND user_id = ${userId}
  `;
  return Boolean((result as { count?: number }).count);
};

export const getListsByUser = async (
  userId: string,
): Promise<ListSummary[]> => {
  const rows = (await db`
    SELECT l.slug, l.title, l.created_at, l.expires_at,
      count(*) FILTER (WHERE c.kind = 'want')::int AS want_count,
      count(*) FILTER (WHERE c.kind = 'have')::int AS have_count
    FROM trade_list l
    LEFT JOIN trade_list_card c ON c.list_id = l.id
    WHERE l.user_id = ${userId}
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `) as {
    slug: string;
    title: string | null;
    created_at: string;
    expires_at: string | null;
    want_count: number;
    have_count: number;
  }[];

  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    wantCount: r.want_count,
    haveCount: r.have_count,
    createdAt: new Date(r.created_at),
    expiresAt: r.expires_at ? new Date(r.expires_at) : null,
  }));
};

// ─── OG image cache ────────────────────────────────────────────────────────
// The rendered PNG is cached on the row (rendered once for anon lists; cleared
// on edit for account lists — see updateTradeList).

export const getCachedOgImage = async (
  slug: string,
): Promise<Uint8Array | null> => {
  const rows = (await db`
    SELECT og_image FROM trade_list WHERE slug = ${slug}
  `) as { og_image: Uint8Array | null }[];
  if (rows.length === 0 || !rows[0].og_image) return null;
  return rows[0].og_image;
};

// A user renaming themselves changes what every list of theirs unfurls as: the
// name is drawn on the OG image, and the meta tag's ?v= token is updated_at.
// Dropping the cached PNG and bumping the timestamp is what makes a rename
// reach an already-pinned Discord post instead of stopping at the HTML.
export const refreshOgImagesForUser = async (userId: string): Promise<void> => {
  await db`
    UPDATE trade_list
    SET og_image = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId}
  `;
};

export const setCachedOgImage = async (
  slug: string,
  bytes: Uint8Array,
): Promise<void> => {
  await db`
    UPDATE trade_list SET og_image = ${Buffer.from(bytes)} WHERE slug = ${slug}
  `;
};
