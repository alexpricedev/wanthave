import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { BunRequest } from "bun";
import type { SessionContext } from "../../middleware/auth";
import type { CreateResult, ListSummary } from "../../services/lists";
import type { User } from "../../services/users";
import type { ListsState } from "../../templates/lists";
import { createBunRequest, findSetCookie } from "../../test-utils/bun-request";
import { computeHMAC } from "../../utils/crypto";

// View controller test (see CLAUDE.md): mock the service layer, assert on the
// rendered HTML and on the Response (status / Location).

const user: User = {
  id: "user-1",
  email: "owner@example.com",
  role: "user",
  friend_id: null,
  display_name: "Alex",
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

const summary: ListSummary = {
  slug: "abcdefghijk",
  title: "Supporters",
  wantCount: 7,
  haveCount: 15,
  createdAt: new Date("2026-07-26T12:00:00Z"),
  expiresAt: null,
};

let mockContext: SessionContext = authContext;
let mockAuthRedirect: Response | null = null;
let mockCsrfResponse: Response | null = null;
let mockSummaries: ListSummary[] = [];
let mockDuplicate: CreateResult | null = null;
let duplicateCalls: [string, string][] = [];

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
mock.module("../../services/lists", () => ({
  getListsByUser: async () => mockSummaries,
  getTradeListBySlug: async () => null,
  deleteList: async () => true,
  duplicateList: async (slug: string, userId: string) => {
    duplicateCalls.push([slug, userId]);
    return mockDuplicate;
  },
}));

import { lists } from "./lists";

const copyResult = (slug: string, title: string | null): CreateResult => ({
  ok: true,
  list: {
    id: "id-2",
    slug,
    userId: user.id,
    title,
    ownerName: "Alex",
    friendId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
    wants: [],
    haves: [],
  },
});

// The flash cookie is signed and read back for real — see utils/flash.
const withFlash = (state: ListsState) => {
  const payload = JSON.stringify(state);
  return createBunRequest("http://localhost:3000/lists", {
    headers: { cookie: `flash_state=${computeHMAC(payload)}.${payload}` },
  });
};

const readFlash = (req: BunRequest): ListsState | null => {
  const cookie = findSetCookie(req, "flash_state");
  if (!cookie) return null;
  const payload = cookie.slice(
    cookie.indexOf("{"),
    cookie.lastIndexOf("}") + 1,
  );
  return JSON.parse(payload) as ListsState;
};

const postDuplicate = (slug: string) =>
  createBunRequest<"/lists/:slug/duplicate">(
    `http://localhost:3000/lists/${slug}/duplicate`,
    { method: "POST" },
    { slug },
  );

beforeEach(() => {
  mockContext = authContext;
  mockAuthRedirect = null;
  mockCsrfResponse = null;
  mockSummaries = [summary];
  mockDuplicate = copyResult("newslug1234", "Supporters (copy)");
  duplicateCalls = [];
});

afterAll(() => mock.restore());

describe("lists.index", () => {
  test("offers a duplicate button alongside the other row actions", async () => {
    const html = await (
      await lists.index(createBunRequest("http://localhost:3000/lists"))
    ).text();

    expect(html).toContain('action="/lists/abcdefghijk/duplicate"');
    expect(html).toContain("Duplicate");
    expect(html).toContain('action="/lists/abcdefghijk/delete"');
    expect(html).toContain('href="/lists/abcdefghijk/edit"');
  });

  test("confirms a copy and links to editing it", async () => {
    const html = await (
      await lists.index(
        withFlash({
          state: "copied",
          slug: "newslug1234",
          title: "Supporters (copy)",
        }),
      )
    ).text();

    expect(html).toContain("Supporters (copy)");
    expect(html).toContain('href="/lists/newslug1234/edit"');
  });

  test("shows why a copy failed", async () => {
    const html = await (
      await lists.index(
        withFlash({ state: "error", error: "Nothing left to copy." }),
      )
    ).text();

    expect(html).toContain("Nothing left to copy.");
  });
});

describe("lists.duplicate", () => {
  test("copies the list and returns to the lists page", async () => {
    const req = postDuplicate("abcdefghijk");
    const res = await lists.duplicate(req);

    expect(duplicateCalls).toEqual([["abcdefghijk", "user-1"]]);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/lists");
    expect(readFlash(req)).toEqual({
      state: "copied",
      slug: "newslug1234",
      title: "Supporters (copy)",
    });
  });

  test("bounces quietly when the list isn't the user's", async () => {
    mockDuplicate = null;

    const req = postDuplicate("someoneelses");
    const res = await lists.duplicate(req);

    expect(res.headers.get("Location")).toBe("/lists");
    expect(readFlash(req)).toBeNull();
  });

  test("surfaces a copy the service refused to make", async () => {
    mockDuplicate = { ok: false, error: "Could not generate a unique link." };

    const req = postDuplicate("abcdefghijk");
    await lists.duplicate(req);

    expect(readFlash(req)).toEqual({
      state: "error",
      error: "Could not generate a unique link.",
    });
  });

  test("honours a CSRF failure", async () => {
    mockCsrfResponse = new Response("Invalid CSRF token", { status: 403 });

    const res = await lists.duplicate(postDuplicate("abcdefghijk"));

    expect(res.status).toBe(403);
    expect(duplicateCalls).toEqual([]);
  });

  test("sends a signed-out visitor to login", async () => {
    mockAuthRedirect = new Response("", {
      status: 303,
      headers: { Location: "/login" },
    });

    const res = await lists.duplicate(postDuplicate("abcdefghijk"));

    expect(res.headers.get("Location")).toBe("/login");
    expect(duplicateCalls).toEqual([]);
  });
});
