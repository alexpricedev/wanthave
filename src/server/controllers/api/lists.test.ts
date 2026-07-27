import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { SQL } from "bun";
import type { SessionContext } from "../../middleware/auth";
import type { User } from "../../services/users";
import { createBunRequest } from "../../test-utils/bun-request";
import { cleanupTestData } from "../../test-utils/helpers";

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

const { listsApi } = await import("./lists");

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
});
