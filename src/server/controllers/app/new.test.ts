import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SessionContext } from "../../middleware/auth";
import type { User } from "../../services/users";
import { createBunRequest } from "../../test-utils/bun-request";

// View controller test (see CLAUDE.md): mock the service layer, assert on the
// rendered HTML.

const guestContext: SessionContext = {
  sessionId: "guest-session",
  sessionHash: null,
  sessionType: "guest",
  user: null,
  isGuest: true,
  isAuthenticated: false,
  requiresSetCookie: false,
};

const authContext = (friendId: string | null): SessionContext => ({
  ...guestContext,
  sessionType: "authenticated",
  user: {
    id: "user-1",
    email: "user@example.com",
    friend_id: friendId,
  } as User,
  isGuest: false,
  isAuthenticated: true,
});

let mockContext: SessionContext = guestContext;

mock.module("../../middleware/auth", () => ({
  getSessionContext: async () => mockContext,
}));
mock.module("../../services/sessions", () => ({
  setSessionCookie: () => {},
}));
mock.module("../../services/csrf", () => ({
  createCsrfToken: async () => "test-csrf-token",
}));

const { newList } = await import("./new");

const get = () =>
  newList.index(
    createBunRequest("http://localhost:3000/new", { method: "GET" }),
  );

describe("New List Controller", () => {
  beforeEach(() => {
    mockContext = guestContext;
  });

  afterAll(() => {
    mock.restore();
  });

  test("renders the builder for guests without a prefilled friend ID", async () => {
    const response = await get();
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('data-page="new"');
    expect(html).toContain("builder-root");
    expect(html).not.toContain("friendId");
  });

  test("prefills the friend ID saved on the account", async () => {
    mockContext = authContext("1234567890123456");

    const html = await (await get()).text();

    expect(html).toContain("friendId");
    expect(html).toContain("1234567890123456");
  });

  test("omits the prefill when the account has no friend ID", async () => {
    mockContext = authContext(null);

    const html = await (await get()).text();

    expect(html).not.toContain("friendId");
  });

  test("returns 503 when no session can be established", async () => {
    mockContext = { ...guestContext, sessionId: null };

    const response = await get();

    expect(response.status).toBe(503);
  });
});
