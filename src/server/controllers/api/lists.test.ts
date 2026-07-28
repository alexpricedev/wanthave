import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { SQL } from "bun";
import type { SessionContext } from "../../middleware/auth";
import type { User } from "../../services/users";
import { createBunRequest, findSetCookie } from "../../test-utils/bun-request";
import { cleanupTestData } from "../../test-utils/helpers";
import { computeHMAC } from "../../utils/crypto";

// API controller test (see CLAUDE.md): the middleware is mocked out, but the
// list/user writes run against the real test database so we can assert the
// friend ID actually lands on the account.

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for tests");
}
const connection = new SQL(process.env.DATABASE_URL);

mock.module("../../services/database", () => ({
  get db() {
    return connection;
  },
}));

const guestContext: SessionContext = {
  sessionId: "guest-session",
  sessionHash: null,
  sessionType: "guest",
  user: null,
  isGuest: true,
  isAuthenticated: false,
  requiresSetCookie: false,
};

let mockContext: SessionContext = guestContext;

mock.module("../../middleware/auth", () => ({
  getSessionContext: async () => mockContext,
}));
mock.module("../../middleware/csrf", () => ({
  csrfProtection: async () => null,
}));
mock.module("../../middleware/rate-limit", () => ({
  rateLimit: () => null,
}));
mock.module("../../services/sessions", () => ({
  setSessionCookie: () => {},
}));

const { listsApi, CLAIM_TOKEN_COOKIE } = await import("./lists");

const CARDS = [{ cardId: "a1-036", kind: "want", quantity: 1 }];

const signIn = async (): Promise<User> => {
  const [user] = (await connection`
    INSERT INTO users (email) VALUES ('owner@test.com')
    RETURNING id, email, role, friend_id, created_at
  `) as User[];
  mockContext = {
    ...guestContext,
    sessionType: "authenticated",
    user,
    isGuest: false,
    isAuthenticated: true,
  };
  return user;
};

const friendIdOf = async (userId: string): Promise<string | null> => {
  const rows = (await connection`
    SELECT friend_id FROM users WHERE id = ${userId}
  `) as { friend_id: string | null }[];
  return rows[0].friend_id;
};

const post = (body: unknown) =>
  listsApi.create(
    createBunRequest("http://localhost:3000/api/lists", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

// Like post(), but hands back the request so the claim-token cookie it sets can
// be read, and lets a test send one in.
const postAnon = async (body: unknown, cookie?: string) => {
  const req = createBunRequest("http://localhost:3000/api/lists", {
    method: "POST",
    body: JSON.stringify(body),
    headers: cookie ? { cookie } : {},
  });
  return { req, response: await listsApi.create(req) };
};

const claimTokenFrom = (req: ReturnType<typeof createBunRequest>) =>
  findSetCookie(req, CLAIM_TOKEN_COOKIE)?.match(
    new RegExp(`${CLAIM_TOKEN_COOKIE}=([^;]+)`),
  )?.[1];

const claimHashes = async (): Promise<(string | null)[]> => {
  const rows = (await connection`
    SELECT claim_token_hash FROM trade_list ORDER BY created_at
  `) as { claim_token_hash: string | null }[];
  return rows.map((r) => r.claim_token_hash);
};

const put = (slug: string, body: unknown) =>
  listsApi.update(
    createBunRequest<"/api/lists/:slug">(
      `http://localhost:3000/api/lists/${slug}`,
      { method: "PUT", body: JSON.stringify(body) },
      { slug },
    ),
  );

describe("Lists API", () => {
  beforeEach(async () => {
    await cleanupTestData(connection);
    mockContext = guestContext;
  });

  afterAll(async () => {
    await connection.end();
    mock.restore();
  });

  test("saves the friend ID on the account when creating a list", async () => {
    const user = await signIn();

    const response = await post({
      cards: CARDS,
      friendId: "1234 5678 9012 3456",
    });

    expect(response.status).toBe(201);
    expect(await friendIdOf(user.id)).toBe("1234567890123456");
  });

  test("saves the friend ID on the account when editing a list", async () => {
    const user = await signIn();
    const created = (await (await post({ cards: CARDS })).json()) as {
      slug: string;
    };

    const response = await put(created.slug, {
      cards: CARDS,
      friendId: "1111222233334444",
    });

    expect(response.status).toBe(200);
    expect(await friendIdOf(user.id)).toBe("1111222233334444");
  });

  test("keeps the saved friend ID when a later list omits one", async () => {
    const user = await signIn();
    await post({ cards: CARDS, friendId: "1234567890123456" });

    await post({ cards: CARDS, friendId: "" });

    expect(await friendIdOf(user.id)).toBe("1234567890123456");
  });

  test("does not touch accounts for anonymous lists", async () => {
    const response = await post({
      cards: CARDS,
      friendId: "1234567890123456",
    });

    expect(response.status).toBe(201);
    const rows = await connection`SELECT id FROM users`;
    expect(rows).toHaveLength(0);
  });

  test("stores a claim token hash and returns the token as an httpOnly cookie", async () => {
    const { req, response } = await postAnon({ cards: CARDS });
    expect(response.status).toBe(201);

    const setCookie = findSetCookie(req, CLAIM_TOKEN_COOKIE);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    const token = claimTokenFrom(req);
    expect(token).toBeDefined();
    expect(await claimHashes()).toEqual([computeHMAC(token as string)]);
  });

  test("reuses the device's token so its lists claim together", async () => {
    const first = await postAnon({ cards: CARDS });
    const token = claimTokenFrom(first.req);

    const second = await postAnon(
      { cards: CARDS },
      `${CLAIM_TOKEN_COOKIE}=${token}`,
    );
    expect(claimTokenFrom(second.req)).toBe(token as string);

    const hashes = await claimHashes();
    expect(hashes).toHaveLength(2);
    expect(new Set(hashes).size).toBe(1);
  });

  test("mints a fresh token when the cookie is malformed", async () => {
    const { req } = await postAnon({ cards: CARDS }, `${CLAIM_TOKEN_COOKIE}=%`);

    const token = claimTokenFrom(req);
    expect(token).not.toBe("%");
    expect(await claimHashes()).toEqual([computeHMAC(token as string)]);
  });

  test("account lists get no claim token — they are already owned", async () => {
    await signIn();

    const { req } = await postAnon({ cards: CARDS });

    expect(findSetCookie(req, CLAIM_TOKEN_COOKIE)).toBeUndefined();
    expect(await claimHashes()).toEqual([null]);
  });
});
