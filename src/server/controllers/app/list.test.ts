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
    display_name: null,
    created_at: new Date(),
  },
  isGuest: false,
  isAuthenticated: true,
  requiresSetCookie: false,
};

const namedOwnerContext: SessionContext = {
  ...ownerContext,
  user: {
    id: "user-1",
    email: "owner@example.com",
    role: "user",
    friend_id: null,
    display_name: "Alex",
    created_at: new Date(),
  },
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
let mockIsDeviceClaimant = false;

mock.module("../../services/lists", () => ({
  getTradeListBySlug: async () => mockList,
  isExpired: () => mockExpired,
  isDeviceClaimant: async () => mockIsDeviceClaimant,
  getCachedOgImage: async () => null,
  setCachedOgImage: async () => {},
}));

import { CLAIM_TOKEN_COOKIE } from "../api/lists";
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
    ownerName: null,
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
    mockIsDeviceClaimant = false;
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
    expect(html).toContain("Claim account");
    expect(html).toContain("update it as trades come in");
  });

  test("tells a guest the list is theirs and offers to claim it", async () => {
    mockIsDeviceClaimant = true;
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      { headers: { cookie: `${CLAIM_TOKEN_COOKIE}=device-token` } },
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();

    expect(html).toContain("You made this list");
    expect(html).toContain("Claim &amp; edit");
    // They built it — don't pitch them on building one.
    expect(html).not.toContain("Create your own trade list");
    // ...and don't describe it as someone else's.
    expect(html).not.toContain("your buddy");
  });

  test("addresses the owner in the second person, not as a visitor", async () => {
    mockContext = ownerContext;
    mockList = { ...buildList(), userId: "user-1" };
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      {},
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();

    expect(html).toContain("the cards you&#x27;re looking for");
    expect(html).not.toContain("your buddy");
  });

  test("does not offer the claim to a visitor without the token", async () => {
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      {},
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();

    expect(html).not.toContain("You made this list");
    expect(html).toContain("Create your own trade list");
  });

  test("leaves the claim bar off an account-owned list", async () => {
    // Token present, but the list has an owner — nothing left to claim.
    mockIsDeviceClaimant = true;
    mockList = { ...buildList(), userId: "user-1" };
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      { headers: { cookie: `${CLAIM_TOKEN_COOKIE}=device-token` } },
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();

    expect(html).not.toContain("You made this list");
  });

  test("leads the meta title with the owner's name", async () => {
    mockList = { ...buildList(), userId: "user-1", ownerName: "Alex" };
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      {},
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();

    // The name is attributed in the tag: in a Discord embed the title is what
    // identifies the post, so "whose list is this" belongs in it.
    expect(html).toContain(
      "<title>Pokémon Pocket trade list by Alex on wanthave",
    );
    expect(html).toContain(
      'property="og:title" content="Pokémon Pocket trade list by Alex on wanthave"',
    );
    expect(html).toContain("Alex is looking for 1 card");
    expect(html).toContain("Alex&#x27;s trade list");
    // A visitor is told whose list it is instead of "your buddy".
    expect(html).toContain("These are the cards Alex is looking for");
    expect(html).not.toContain("your buddy");
  });

  test("puts the name ahead of a named list's title", async () => {
    mockList = {
      ...buildList(),
      userId: "user-1",
      ownerName: "Alex",
      title: "B4 wants",
    };
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      {},
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();

    expect(html).toContain("<title>B4 wants by Alex on wanthave</title>");
    expect(html).toContain("Shared by Alex");
  });

  test("leaves the title unchanged when the owner has no name", async () => {
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      {},
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();
    expect(html).toContain("<title>Pokémon Pocket trade list on wanthave");
  });

  test("asks an unnamed owner for their name at the share moment", async () => {
    mockContext = ownerContext;
    mockList = { ...buildList(), userId: "user-1" };
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk?created=1",
      {},
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();

    expect(html).toContain("Add your name to this link");
    expect(html).toContain('action="/account"');
    // Saving returns to the same panel they were reading.
    expect(html).toContain('name="return_to" value="/l/abcdefghijk?created=1"');
  });

  test("shows a named owner what their links say instead of the prompt", async () => {
    mockContext = namedOwnerContext;
    mockList = { ...buildList(), userId: "user-1", ownerName: "Alex" };
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      {},
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();

    expect(html).not.toContain("Add your name to this link");
    expect(html).toContain("Shared as <strong>Alex</strong>");
  });

  test("never asks a visitor for a name", async () => {
    mockList = { ...buildList(), userId: "user-2" };
    const req = createBunRequest(
      "http://localhost:3000/l/abcdefghijk",
      {},
      { slug: "abcdefghijk" },
    );
    const html = await (await list.index(req)).text();
    expect(html).not.toContain("Add your name");
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
