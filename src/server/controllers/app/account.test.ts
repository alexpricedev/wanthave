import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SessionContext } from "../../middleware/auth";
import type { User } from "../../services/users";
import { createBunRequest } from "../../test-utils/bun-request";

// View controller test (see CLAUDE.md): mock the service layer, assert on the
// rendered HTML and on the Response (status / Location).

const user: User = {
  id: "user-1",
  email: "owner@example.com",
  role: "user",
  friend_id: null,
  display_name: null,
  created_at: new Date(),
};

const authContext: SessionContext = {
  sessionId: "owner-session",
  sessionHash: null,
  sessionType: "authenticated",
  user,
  isGuest: false,
  isAuthenticated: true,
  requiresSetCookie: false,
};

let mockContext: SessionContext = authContext;
let mockAuthRedirect: Response | null = null;
let mockCsrfResponse: Response | null = null;
let savedNames: (string | null | undefined)[] = [];
let savedFriendIds: (string | null)[] = [];
let refreshedUsers: string[] = [];

mock.module("../../middleware/auth", () => ({
  getSessionContext: async () => mockContext,
  requireAuth: async () => mockAuthRedirect,
}));
mock.module("../../middleware/csrf", () => ({
  csrfProtection: async () => mockCsrfResponse,
}));
mock.module("../../services/csrf", () => ({
  createCsrfToken: async () => "test-csrf-token",
}));
mock.module("../../services/users", () => ({
  saveUserDisplayName: async (_id: string, name: string | null | undefined) => {
    savedNames.push(name);
    return name ?? null;
  },
  setUserFriendId: async (_id: string, friendId: string | null) => {
    savedFriendIds.push(friendId);
  },
}));
mock.module("../../services/lists", () => ({
  refreshOgImagesForUser: async (id: string) => {
    refreshedUsers.push(id);
  },
}));

import { account } from "./account";

const post = (fields: Record<string, string>) => {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return createBunRequest("http://localhost:3000/account", {
    method: "POST",
    body,
  });
};

describe("account.index", () => {
  beforeEach(() => {
    mockContext = authContext;
    mockAuthRedirect = null;
  });

  afterAll(() => mock.restore());

  test("renders the form with the account's current values", async () => {
    mockContext = {
      ...authContext,
      user: { ...user, display_name: "Alex", friend_id: "1234567890123456" },
    };

    const html = await (
      await account.index(createBunRequest("http://localhost:3000/account"))
    ).text();

    expect(html).toContain('value="Alex"');
    expect(html).toContain("1234 5678 9012 3456");
    expect(html).toContain("owner@example.com");
  });

  test("sends a signed-out visitor to login", async () => {
    mockAuthRedirect = new Response("", {
      status: 303,
      headers: { Location: "/login" },
    });

    const res = await account.index(
      createBunRequest("http://localhost:3000/account"),
    );

    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/login");
  });
});

describe("account.update", () => {
  beforeEach(() => {
    mockContext = authContext;
    mockAuthRedirect = null;
    mockCsrfResponse = null;
    savedNames = [];
    savedFriendIds = [];
    refreshedUsers = [];
  });

  afterAll(() => mock.restore());

  test("saves the name and re-renders the images it appears on", async () => {
    const res = await account.update(post({ display_name: " Alex " }));

    expect(savedNames).toEqual(["Alex"]);
    expect(refreshedUsers).toEqual(["user-1"]);
    expect(res.headers.get("Location")).toBe("/account");
  });

  test("returns to the page the prompt was embedded in", async () => {
    const res = await account.update(
      post({ display_name: "Alex", return_to: "/l/abcdefghijk?created=1" }),
    );

    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/l/abcdefghijk?created=1");
  });

  test("refuses to bounce off-site", async () => {
    for (const returnTo of [
      "https://evil.example/phish",
      "//evil.example/phish",
      "/lists\\nLocation: https://evil.example",
    ]) {
      const res = await account.update(
        post({ display_name: "Alex", return_to: returnTo }),
      );
      expect(res.headers.get("Location")).toBe("/account");
    }
  });

  test("rejects a name it cannot store and saves nothing", async () => {
    const res = await account.update(post({ display_name: "A".repeat(30) }));

    expect(savedNames).toEqual([]);
    expect(res.headers.get("Location")).toBe("/account");
  });

  test("clears the name when the field is submitted blank", async () => {
    mockContext = { ...authContext, user: { ...user, display_name: "Alex" } };

    await account.update(post({ display_name: "" }));

    expect(savedNames).toEqual([null]);
    expect(refreshedUsers).toEqual(["user-1"]);
  });

  test("leaves the images alone when the name did not change", async () => {
    mockContext = { ...authContext, user: { ...user, display_name: "Alex" } };

    await account.update(post({ display_name: "Alex" }));

    expect(savedNames).toEqual(["Alex"]);
    expect(refreshedUsers).toEqual([]);
  });

  test("stores a valid friend ID and rejects a malformed one", async () => {
    await account.update(
      post({ display_name: "Alex", friend_id: "1234 5678 9012 3456" }),
    );
    expect(savedFriendIds).toEqual(["1234567890123456"]);

    savedFriendIds = [];
    const res = await account.update(
      post({ display_name: "Alex", friend_id: "12345" }),
    );
    expect(savedFriendIds).toEqual([]);
    expect(res.headers.get("Location")).toBe("/account");
  });

  test("leaves a stored friend ID alone when the form omits the field", async () => {
    // The inline name prompt posts only the name — a missing field is not a
    // request to delete anything.
    await account.update(post({ display_name: "Alex" }));

    expect(savedFriendIds).toEqual([]);
  });

  test("honours a CSRF failure", async () => {
    mockCsrfResponse = new Response("Invalid CSRF token", { status: 403 });

    const res = await account.update(post({ display_name: "Alex" }));

    expect(res.status).toBe(403);
    expect(savedNames).toEqual([]);
  });
});
