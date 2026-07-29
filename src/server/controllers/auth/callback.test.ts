import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { SQL } from "bun";
import { cleanupTestData } from "../../test-utils/helpers";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for tests");
}
const connection = new SQL(process.env.DATABASE_URL);

mock.module("../../services/database", () => ({
  get db() {
    return connection;
  },
}));

import { createMagicLink } from "../../services/auth";
import { db } from "../../services/database";
import { SESSION_COOKIE_NAME } from "../../services/sessions";
import { createBunRequest, findSetCookie } from "../../test-utils/bun-request";
import { computeHMAC } from "../../utils/crypto";
import { CLAIM_COOKIE, CLAIM_TOKEN_COOKIE } from "../api/lists";

// The real list service, with a switch one test flips to make the claim blow
// up — the point being that a failed claim still leaves the user logged in.
// Captured before mocking so the wrapper can't recurse into itself.
const realLists = await import("../../services/lists");
const { createTradeList } = realLists;
const realClaimListsByToken = realLists.claimListsByToken;
const realClaimList = realLists.claimList;
let claimThrows = false;
let legacyClaimThrows = false;

mock.module("../../services/lists", () => ({
  ...realLists,
  claimListsByToken: async (hash: string, userId: string) => {
    if (claimThrows) throw new Error("claim exploded");
    return realClaimListsByToken(hash, userId);
  },
  claimList: async (slug: string, userId: string) => {
    if (legacyClaimThrows) throw new Error("legacy claim exploded");
    return realClaimList(slug, userId);
  },
}));

const { callback } = await import("./callback");

const DEVICE_TOKEN = "device-token-for-callback-tests";

const anonList = async (opts: { friendId?: string } = {}): Promise<string> => {
  const created = await createTradeList({
    cards: [{ cardId: "a1-001", kind: "want", quantity: 1 }],
    claimTokenHash: computeHMAC(DEVICE_TOKEN),
    friendId: opts.friendId ?? null,
  });
  if (!created.ok) throw new Error("setup failed");
  return created.list.slug;
};

const callbackWithCookie = (rawToken: string, cookie: string) =>
  callback.index(
    createBunRequest(`http://localhost:3000/auth/callback?token=${rawToken}`, {
      headers: { cookie },
    }),
  );

describe("Callback Controller", () => {
  beforeEach(async () => {
    await cleanupTestData(db);
    claimThrows = false;
    legacyClaimThrows = false;
  });

  afterAll(async () => {
    await connection.end();
    mock.restore();
  });

  describe("GET /auth/callback", () => {
    test("successfully verifies valid magic link token", async () => {
      const { rawToken } = await createMagicLink("test@example.com");

      const request = createBunRequest(
        `http://localhost:3000/auth/callback?token=${rawToken}`,
        { method: "GET" },
      );

      const response = await callback.index(request);

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/lists");

      const setCookie = findSetCookie(request, SESSION_COOKIE_NAME);
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
    });

    test("marks token as used after successful verification", async () => {
      const { user, rawToken } = await createMagicLink("used@example.com");

      await callback.index(
        createBunRequest(
          `http://localhost:3000/auth/callback?token=${rawToken}`,
        ),
      );

      const tokens = await db`
        SELECT used_at FROM user_tokens
        WHERE user_id = ${user.id} AND type = 'magic_link'
      `;

      expect(tokens).toHaveLength(1);
      expect((tokens[0] as any).used_at).not.toBeNull();
    });

    test("creates valid session after token verification", async () => {
      const { user, rawToken } = await createMagicLink("session@example.com");

      const request = createBunRequest(
        `http://localhost:3000/auth/callback?token=${rawToken}`,
      );

      await callback.index(request);

      const setCookie = findSetCookie(request, SESSION_COOKIE_NAME);
      const sessionMatch = setCookie?.match(
        new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
      );
      const sessionId = sessionMatch?.[1];

      expect(sessionId).toBeDefined();
      if (!sessionId) {
        throw new Error("Session ID should be defined at this point");
      }

      const { computeHMAC } = await import("../../utils/crypto");
      const sessionIdHash = computeHMAC(sessionId);
      const sessions = await db`
        SELECT user_id, expires_at FROM sessions WHERE id_hash = ${sessionIdHash}
      `;

      expect(sessions).toHaveLength(1);
      expect((sessions[0] as any).user_id).toBe(user.id);

      const expiresAt = new Date((sessions[0] as any).expires_at as string);
      const now = new Date();
      const diffDays =
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(29);
      expect(diffDays).toBeLessThan(31);
    });

    test("redirects with error for missing token", async () => {
      const request = createBunRequest("http://localhost:3000/auth/callback", {
        method: "GET",
      });

      const response = await callback.index(request);

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "/login?error=Missing authentication token",
      );
    });

    test("redirects with error for invalid token", async () => {
      const request = createBunRequest(
        "http://localhost:3000/auth/callback?token=invalid-token",
        { method: "GET" },
      );

      const response = await callback.index(request);

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toContain("/login?error=");
      const location = response.headers.get("location");
      expect(location).toBeTruthy();
      expect(decodeURIComponent(location as string)).toContain(
        "Invalid or expired token",
      );
    });

    test("redirects with error for already used token", async () => {
      const { rawToken } = await createMagicLink("reuse@example.com");

      await callback.index(
        createBunRequest(
          `http://localhost:3000/auth/callback?token=${rawToken}`,
        ),
      );

      const response = await callback.index(
        createBunRequest(
          `http://localhost:3000/auth/callback?token=${rawToken}`,
        ),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toContain("/login?error=");
      const location2 = response.headers.get("location");
      expect(location2).toBeTruthy();
      expect(decodeURIComponent(location2 as string)).toContain(
        "Invalid or expired token",
      );
    });

    test("redirects with error for expired token", async () => {
      const { user, rawToken } = await createMagicLink("expired@example.com");

      await db`
        UPDATE user_tokens
        SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 hour'
        WHERE user_id = ${user.id} AND type = 'magic_link'
      `;

      const response = await callback.index(
        createBunRequest(
          `http://localhost:3000/auth/callback?token=${rawToken}`,
        ),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toContain("/login?error=");
      const location3 = response.headers.get("location");
      expect(location3).toBeTruthy();
      expect(decodeURIComponent(location3 as string)).toContain("expired");
    });

    test("claims every anon list built on the device, not just the newest", async () => {
      const withFriendId = await anonList({ friendId: "1234567890123456" });
      await db`
        UPDATE trade_list SET created_at = created_at - INTERVAL '1 hour'
        WHERE slug = ${withFriendId}
      `;
      const newest = await anonList();

      const { rawToken, user } = await createMagicLink("multi@example.com");
      const response = await callbackWithCookie(
        rawToken,
        `${CLAIM_TOKEN_COOKIE}=${DEVICE_TOKEN}`,
      );

      // More than one list claimed, so the index is the useful landing page.
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/lists");

      const claimed = (await db`
        SELECT slug FROM trade_list WHERE user_id = ${user.id}
      `) as { slug: string }[];
      expect(claimed.map((r) => r.slug).sort()).toEqual(
        [withFriendId, newest].sort(),
      );

      // Newest first, so the most recent friend ID wins — falling back past the
      // newest list here, which has none.
      const rows = (await db`
        SELECT friend_id FROM users WHERE id = ${user.id}
      `) as { friend_id: string | null }[];
      expect(rows[0].friend_id).toBe("1234567890123456");
    });

    test("lands on the list itself when the device made only one", async () => {
      const slug = await anonList();

      const { rawToken } = await createMagicLink("single@example.com");
      const response = await callbackWithCookie(
        rawToken,
        `${CLAIM_TOKEN_COOKIE}=${DEVICE_TOKEN}`,
      );

      expect(response.headers.get("location")).toBe(`/l/${slug}`);
    });

    test("a failed claim leaves the user logged in, not on an error page", async () => {
      const slug = await anonList();
      const { rawToken, user } = await createMagicLink("resilient@example.com");

      claimThrows = true;
      const request = createBunRequest(
        `http://localhost:3000/auth/callback?token=${rawToken}`,
        { headers: { cookie: `${CLAIM_TOKEN_COOKIE}=${DEVICE_TOKEN}` } },
      );
      const response = await callback.index(request);

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/lists");
      expect(findSetCookie(request, SESSION_COOKIE_NAME)).toContain(
        `${SESSION_COOKIE_NAME}=`,
      );

      // The claim didn't happen, and the token cookie survives so the next
      // login can retry it.
      expect(findSetCookie(request, CLAIM_TOKEN_COOKIE)).toBeUndefined();
      const rows = (await db`
        SELECT user_id FROM trade_list WHERE slug = ${slug}
      `) as { user_id: string | null }[];
      expect(rows[0].user_id).toBeNull();

      const users = (await db`
        SELECT id FROM users WHERE id = ${user.id}
      `) as { id: string }[];
      expect(users).toHaveLength(1);
    });

    test("leaves another device's lists alone", async () => {
      const created = await createTradeList({
        cards: [{ cardId: "a1-001", kind: "want", quantity: 1 }],
        claimTokenHash: computeHMAC("someone-elses-token"),
      });
      if (!created.ok) throw new Error("setup failed");

      const { rawToken, user } = await createMagicLink("nosy@example.com");
      const response = await callbackWithCookie(
        rawToken,
        `${CLAIM_TOKEN_COOKIE}=${DEVICE_TOKEN}`,
      );

      expect(response.headers.get("location")).toBe("/lists");
      const claimed = await db`
        SELECT slug FROM trade_list WHERE user_id = ${user.id}
      `;
      expect(claimed).toHaveLength(0);
    });

    // Guests who created a list before claim tokens shipped still hold the old
    // slug cookie — they shouldn't lose that list.
    test("still claims via the legacy slug cookie, friend ID and all", async () => {
      const created = await createTradeList({
        cards: [{ cardId: "a1-001", kind: "want", quantity: 1 }],
        friendId: "1234567890123456",
      });
      if (!created.ok) throw new Error("setup failed");

      const { rawToken, user } = await createMagicLink("claimer@example.com");

      const request = createBunRequest(
        `http://localhost:3000/auth/callback?token=${rawToken}`,
        { headers: { cookie: `${CLAIM_COOKIE}=${created.list.slug}` } },
      );

      const response = await callback.index(request);

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(`/l/${created.list.slug}`);

      const rows = await db`
        SELECT friend_id FROM users WHERE id = ${user.id}
      `;
      expect((rows[0] as { friend_id: string | null }).friend_id).toBe(
        "1234567890123456",
      );
    });

    test("keeps the legacy cookie when its claim fails, so a retry is possible", async () => {
      const created = await createTradeList({
        cards: [{ cardId: "a1-001", kind: "want", quantity: 1 }],
      });
      if (!created.ok) throw new Error("setup failed");

      const { rawToken } = await createMagicLink("retry@example.com");
      legacyClaimThrows = true;

      const request = createBunRequest(
        `http://localhost:3000/auth/callback?token=${rawToken}`,
        { headers: { cookie: `${CLAIM_COOKIE}=${created.list.slug}` } },
      );
      const response = await callback.index(request);

      // Login still succeeds, and the cookie isn't cleared — deleting it before
      // the claim landed would orphan the list for good.
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/lists");
      expect(findSetCookie(request, CLAIM_COOKIE)).toBeUndefined();

      const rows = (await db`
        SELECT user_id FROM trade_list WHERE slug = ${created.list.slug}
      `) as { user_id: string | null }[];
      expect(rows[0].user_id).toBeNull();
    });

    test("handles database errors gracefully", async () => {
      const { user, rawToken } = await createMagicLink("deleted@example.com");

      await db`DELETE FROM users WHERE id = ${user.id}`;

      const response = await callback.index(
        createBunRequest(
          `http://localhost:3000/auth/callback?token=${rawToken}`,
        ),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toContain("/login?error=");
      const location4 = response.headers.get("location");
      expect(location4).toBeTruthy();
      expect(decodeURIComponent(location4 as string)).toContain(
        "Invalid or expired token",
      );
    });
  });
});
