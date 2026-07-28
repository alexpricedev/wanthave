import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { SQL } from "bun";
import { cleanupTestData, randomEmail } from "../test-utils/helpers";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for tests");
}
const connection = new SQL(process.env.DATABASE_URL);

mock.module("./database", () => ({
  get db() {
    return connection;
  },
}));

import { findOrCreateUser } from "./auth";
import {
  ANON_TTL_DAYS,
  claimList,
  claimListsByToken,
  createTradeList,
  deleteList,
  getCachedOgImage,
  getListsByUser,
  getTradeListBySlug,
  groupByRarity,
  isExpired,
  MAX_CARDS_PER_SECTION,
  sanitizeCards,
  setCachedOgImage,
  updateTradeList,
} from "./lists";

describe("sanitizeCards", () => {
  test("drops unknown ids and dedupes across sections", () => {
    const out = sanitizeCards([
      { cardId: "a1-036", kind: "want", quantity: 1 },
      { cardId: "a1-036", kind: "have", quantity: 1 }, // dup id
      { cardId: "nope-000", kind: "want", quantity: 1 }, // invalid
      { cardId: "a1-001", kind: "have", quantity: 5 },
    ]);
    expect(out.map((c) => c.cardId)).toEqual(["a1-036", "a1-001"]);
    expect(out[0].kind).toBe("want");
    expect(out[0].position).toBe(0);
    expect(out[1].position).toBe(0); // per-section position
  });

  test("clamps quantity between 1 and 99", () => {
    const out = sanitizeCards([
      { cardId: "a1-036", kind: "want", quantity: 0 },
      { cardId: "a1-001", kind: "want", quantity: 500 },
    ]);
    expect(out[0].quantity).toBe(1);
    expect(out[1].quantity).toBe(99);
  });

  test("caps each section", () => {
    const many = Array.from({ length: MAX_CARDS_PER_SECTION + 10 }, (_, i) => ({
      cardId: `a1-${String(i + 1).padStart(3, "0")}`,
      kind: "want" as const,
      quantity: 1,
    }));
    expect(sanitizeCards(many).length).toBe(MAX_CARDS_PER_SECTION);
  });
});

describe("createTradeList", () => {
  beforeEach(async () => {
    await cleanupTestData(connection);
  });

  test("rejects an empty list", async () => {
    const result = await createTradeList({ cards: [] });
    expect(result.ok).toBe(false);
  });

  test("creates an anonymous list with a 90-day expiry", async () => {
    const result = await createTradeList({
      cards: [{ cardId: "a1-036", kind: "want", quantity: 2 }],
      friendId: "1234 5678 9012 3456",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.list.slug).toHaveLength(11);
    expect(result.list.userId).toBeNull();
    expect(result.list.friendId).toBe("1234567890123456");
    expect(result.list.wants[0].quantity).toBe(2);
    expect(result.list.expiresAt).not.toBeNull();

    const days =
      ((result.list.expiresAt as Date).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(ANON_TTL_DAYS - 1);
    expect(days).toBeLessThan(ANON_TTL_DAYS + 1);
  });

  test("account list never expires", async () => {
    const user = await findOrCreateUser(randomEmail());
    const result = await createTradeList({
      cards: [{ cardId: "a1-001", kind: "want", quantity: 1 }],
      userId: user.id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.list.expiresAt).toBeNull();
    expect(result.list.userId).toBe(user.id);
  });

  test("round-trips through getTradeListBySlug", async () => {
    const result = await createTradeList({
      cards: [
        { cardId: "a1-036", kind: "want", quantity: 1 },
        { cardId: "a1-001", kind: "have", quantity: 3 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fetched = await getTradeListBySlug(result.list.slug);
    expect(fetched?.wants.map((w) => w.card.id)).toEqual(["a1-036"]);
    expect(fetched?.haves[0].quantity).toBe(3);
  });
});

describe("update / claim / delete", () => {
  beforeEach(async () => {
    await cleanupTestData(connection);
  });

  test("updateTradeList only touches the owner's list and clears the OG cache", async () => {
    const user = await findOrCreateUser(randomEmail());
    const created = await createTradeList({
      cards: [{ cardId: "a1-001", kind: "want", quantity: 1 }],
      userId: user.id,
    });
    if (!created.ok) throw new Error("setup failed");
    const { slug } = created.list;

    await setCachedOgImage(slug, new Uint8Array([1, 2, 3]));
    expect(await getCachedOgImage(slug)).not.toBeNull();

    const updated = await updateTradeList(slug, user.id, {
      cards: [
        { cardId: "a1-036", kind: "want", quantity: 1 },
        { cardId: "a1-002", kind: "have", quantity: 1 },
      ],
      friendId: "1111222233334444",
    });
    expect(updated?.wants[0].card.id).toBe("a1-036");
    expect(updated?.haves).toHaveLength(1);
    expect(await getCachedOgImage(slug)).toBeNull();

    // A different user can't edit it.
    const other = await findOrCreateUser(randomEmail());
    const denied = await updateTradeList(slug, other.id, {
      cards: [{ cardId: "a1-003", kind: "want", quantity: 1 }],
    });
    expect(denied).toBeNull();
  });

  test("claimList makes an anonymous list permanent and owned", async () => {
    const created = await createTradeList({
      cards: [{ cardId: "a1-001", kind: "want", quantity: 1 }],
      friendId: "1234567890123456",
    });
    if (!created.ok) throw new Error("setup failed");
    const user = await findOrCreateUser(randomEmail());

    expect(await claimList(created.list.slug, user.id)).toEqual({
      friendId: "1234567890123456",
    });
    const claimed = await getTradeListBySlug(created.list.slug);
    expect(claimed?.userId).toBe(user.id);
    expect(claimed?.expiresAt).toBeNull();

    // Claiming an already-owned list is a no-op.
    const other = await findOrCreateUser(randomEmail());
    expect(await claimList(created.list.slug, other.id)).toBeNull();
  });

  test("claimListsByToken claims every list from one device, newest first", async () => {
    const mine = "token-hash-mine";
    const older = await createTradeList({
      cards: [{ cardId: "a1-001", kind: "want", quantity: 1 }],
      claimTokenHash: mine,
      friendId: "1111222233334444",
    });
    const newer = await createTradeList({
      cards: [{ cardId: "a1-002", kind: "want", quantity: 1 }],
      claimTokenHash: mine,
      friendId: "5555666677778888",
    });
    // Another device's list, and one already owned — neither should move.
    const theirs = await createTradeList({
      cards: [{ cardId: "a1-003", kind: "want", quantity: 1 }],
      claimTokenHash: "token-hash-theirs",
    });
    if (!older.ok || !newer.ok || !theirs.ok) throw new Error("setup failed");

    await connection`
      UPDATE trade_list SET created_at = created_at - INTERVAL '1 hour'
      WHERE slug = ${older.list.slug}
    `;

    const user = await findOrCreateUser(randomEmail());
    const claimed = await claimListsByToken(mine, user.id);

    expect(claimed).toEqual([
      { slug: newer.list.slug, friendId: "5555666677778888" },
      { slug: older.list.slug, friendId: "1111222233334444" },
    ]);

    for (const slug of [newer.list.slug, older.list.slug]) {
      const list = await getTradeListBySlug(slug);
      expect(list?.userId).toBe(user.id);
      expect(list?.expiresAt).toBeNull();
    }

    const untouched = await getTradeListBySlug(theirs.list.slug);
    expect(untouched?.userId).toBeNull();

    // The token is spent once the lists are claimed.
    const other = await findOrCreateUser(randomEmail());
    expect(await claimListsByToken(mine, other.id)).toEqual([]);
  });

  test("getListsByUser returns summaries with counts; delete enforces ownership", async () => {
    const user = await findOrCreateUser(randomEmail());
    const created = await createTradeList({
      cards: [
        { cardId: "a1-001", kind: "want", quantity: 1 },
        { cardId: "a1-002", kind: "want", quantity: 1 },
        { cardId: "a1-003", kind: "have", quantity: 1 },
      ],
      userId: user.id,
    });
    if (!created.ok) throw new Error("setup failed");

    const summaries = await getListsByUser(user.id);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].wantCount).toBe(2);
    expect(summaries[0].haveCount).toBe(1);

    const other = await findOrCreateUser(randomEmail());
    expect(await deleteList(created.list.slug, other.id)).toBe(false);
    expect(await deleteList(created.list.slug, user.id)).toBe(true);
    expect(await getListsByUser(user.id)).toHaveLength(0);
  });
});

describe("helpers", () => {
  test("isExpired reflects expires_at", () => {
    expect(isExpired({ expiresAt: null })).toBe(false);
    expect(isExpired({ expiresAt: new Date(Date.now() + 1000) })).toBe(false);
    expect(isExpired({ expiresAt: new Date(Date.now() - 1000) })).toBe(true);
  });

  test("groupByRarity orders diamonds then stars", () => {
    const groups = groupByRarity([
      { card: { rarity: "s1" }, kind: "want", quantity: 1, position: 0 },
      { card: { rarity: "d1" }, kind: "want", quantity: 1, position: 1 },
      { card: { rarity: "d4" }, kind: "want", quantity: 1, position: 2 },
    ] as unknown as Parameters<typeof groupByRarity>[0]);
    expect(groups.map((g) => g.rarity)).toEqual(["d1", "d4", "s1"]);
  });
});

afterAll(async () => {
  await connection.end();
  mock.restore();
});
