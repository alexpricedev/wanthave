import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SessionContext } from "../../middleware/auth";
import { getCardById } from "../../services/cards";
import type { TradeList } from "../../services/lists";
import { createBunRequest } from "../../test-utils/bun-request";

// Mocked service layer — this is a view controller test (see CLAUDE.md): mock
// services, assert on the rendered HTML.
const guestContext: SessionContext = {
  sessionId: "guest-session",
  sessionHash: null,
  sessionType: "guest",
  user: null,
  isGuest: true,
  isAuthenticated: false,
  requiresSetCookie: false,
};

const ownerContext: SessionContext = {
  sessionId: "owner-session",
  sessionHash: null,
  sessionType: "authenticated",
  user: {
    id: "user-1",
    email: "owner@example.com",
    role: "user",
    friend_id: null,
    created_at: new Date(),
  },
  isGuest: false,
  isAuthenticated: true,
  requiresSetCookie: false,
};

let mockList: TradeList | null = null;
let mockExpired = false;
let mockContext: SessionContext = guestContext;

mock.module("../../middleware/auth", () => ({
  getSessionContext: async () => mockContext,
}));
mock.module("../../services/csrf", () => ({
  createCsrfToken: async () => "csrf-token",
}));
mock.module("../../services/sessions", () => ({
  setSessionCookie: () => {},
}));
mock.module("../../services/lists", () => ({
  getTradeListBySlug: async () => mockList,
  isExpired: () => mockExpired,
  getCachedOgImage: async () => null,
  setCachedOgImage: async () => {},
}));

import { list } from "./list";

const buildList = (): TradeList => {
  const charizard = getCardById("a1-036");
  const bulbasaur = getCardById("a1-001");
  if (!charizard || !bulbasaur) throw new Error("catalogue missing test cards");
  return {
    id: "id-1",
    slug: "abcdefghijk",
    userId: null,
    title: null,
    friendId: "1234567890123456",
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 1_000_000),
    wants: [{ card: charizard, kind: "want", quantity: 2, position: 0 }],
    haves: [{ card: bulbasaur, kind: "have", quantity: 1, position: 0 }],
  };
};

describe("list.index", () => {
  beforeEach(() => {
    mockList = buildList();
    mockExpired = false;
    mockContext = guestContext;
  });

  afterAll(() => mock.restore());

  test("renders the public page with wants, haves, friend ID, and flywheel CTA", async () => {
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      {},
      {
        slug: "abcdefghijk",
      },
    );
    const res = await list.index(req);
    const html = await res.text();

    expect(res.headers.get("content-type")).toBe("text/html");
    expect(html).toContain("Looking for");
    expect(html).toContain("For trade");
    expect(html).toContain("Charizard ex");
    expect(html).toContain("1234 5678 9012 3456");
    expect(html).toContain("Create your own trade list");
    // Per-list OG image is wired into the meta tags.
    expect(html).toContain("/l/abcdefghijk/og.png");
  });

  test("versions the OG image URL on updated_at so edits re-unfurl", async () => {
    const updatedAt = new Date("2026-01-02T03:04:05Z");
    mockList = { ...buildList(), updatedAt };
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      {},
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();
    expect(html).toContain(`/l/abcdefghijk/og.png?v=${updatedAt.getTime()}`);
  });

  test("shows the share link in the owner bar", async () => {
    mockContext = ownerContext;
    mockList = { ...buildList(), userId: "user-1" };
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      {},
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();
    expect(html).toContain("You own this list");
    expect(html).toContain(
      'data-copy-text="http://localhost:3000/l/abcdefghijk"',
    );
  });

  test("omits the owner-bar link on ?created=1 — the share panel has it", async () => {
    mockContext = ownerContext;
    mockList = { ...buildList(), userId: "user-1" };
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk?created=1",
      {},
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();
    expect(html).toContain("You own this list");
    // One copy control and one preview on the page (the share panel's), not two.
    expect(html.split("data-copy-text").length - 1).toBe(1);
    expect(html.split("og-preview-img").length - 1).toBe(1);
  });

  test("previews the unfurl from the versioned OG URL", async () => {
    const updatedAt = new Date("2026-01-02T03:04:05Z");
    mockContext = ownerContext;
    mockList = { ...buildList(), userId: "user-1", updatedAt };
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      {},
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();
    expect(html).toContain("Preview");
    // The preview must bust cache the same way the meta tag does — a bare
    // /og.png would serve the owner their pre-edit image.
    expect(html).toContain(
      `class="og-preview-img" src="/l/abcdefghijk/og.png?v=${updatedAt.getTime()}"`,
    );
  });

  test("shows the share panel and account nudge when ?created=1", async () => {
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk?created=1",
      {},
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();
    expect(html).toContain("Your link is ready");
    expect(html).toContain("Keep it forever");
  });

  test("renders the expired page (200, never 404)", async () => {
    mockExpired = true;
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      {},
      {
        slug: "abcdefghijk",
      },
    );
    const res = await list.index(req);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("This list has expired");
  });

  test("renders the not-found page for an unknown slug", async () => {
    mockList = null;
    const req = createBunRequest(
      "http://localhost:3000/l/zzzzzzzzzzz",
      {},
      {
        slug: "zzzzzzzzzzz",
      },
    );
    const html = await (await list.index(req)).text();
    expect(html).toContain("This list isn");
  });
});

describe("list.og", () => {
  afterAll(() => mock.restore());

  test("caches a versioned URL forever and the bare URL briefly", async () => {
    mockList = buildList();
    mockExpired = false;

    const versioned = await list.og(
      createBunRequest(
        "http://localhost:3000/l/abcdefghijk/og.png?v=123",
        {},
        { slug: "abcdefghijk" },
      ),
    );
    expect(versioned.headers.get("cache-control")).toContain("immutable");

    const bare = await list.og(
      createBunRequest(
        "http://localhost:3000/l/abcdefghijk/og.png",
        {},
        { slug: "abcdefghijk" },
      ),
    );
    expect(bare.headers.get("cache-control")).toBe("public, max-age=3600");
  });

  test("serves the branded fallback for a missing list", async () => {
    mockList = null;
    const req = createBunRequest(
      "http://localhost:3000/l/zzzzzzzzzzz/og.png",
      {},
      { slug: "zzzzzzzzzzz" },
    );
    const res = await list.og(req);
    expect(res.headers.get("content-type")).toBe("image/png");
  });
});
