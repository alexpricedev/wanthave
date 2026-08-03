import { beforeEach, describe, expect, mock, test } from "bun:test";
import { SQL } from "bun";
import { cleanupTestData } from "../test-utils/helpers";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for tests");
}
const connection = new SQL(process.env.DATABASE_URL);

mock.module("./database", () => ({
  get db() {
    return connection;
  },
}));

import { track, trackOgFetch, trackPageView } from "./events";

interface EventRow {
  name: string;
  session_hash: string | null;
  user_id: string | null;
  slug: string | null;
  is_bot: boolean;
  props: Record<string, unknown>;
}

const allEvents = async (): Promise<EventRow[]> => {
  const rows = (await connection`
    SELECT name, session_hash, user_id, slug, is_bot, props
    FROM event ORDER BY id
  `) as (Omit<EventRow, "props"> & { props: string | EventRow["props"] })[];
  // The driver hands jsonb back as text.
  return rows.map((row) => ({
    ...row,
    props: typeof row.props === "string" ? JSON.parse(row.props) : row.props,
  }));
};

const htmlResponse = (status = 200): Response =>
  new Response("<!doctype html><html></html>", {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

// The pipeline hands `trackPageView` a BunRequest; the parts it reads are url,
// method, headers and cookies, so a plain Request plus a cookie stub is enough.
const pageRequest = (
  url: string,
  headers: Record<string, string> = {},
  cookie?: string,
) => {
  const req = new Request(url, { headers }) as unknown as Parameters<
    typeof trackPageView
  >[0];
  Object.defineProperty(req, "cookies", {
    value: { get: () => cookie },
  });
  return req;
};

describe("track", () => {
  beforeEach(async () => {
    await cleanupTestData(connection);
  });

  test("writes an event with its props", async () => {
    await track({
      name: "list_created",
      slug: "abc123",
      props: { want_count: 3, have_count: 5, is_anon: true },
    });

    const [row] = await allEvents();
    expect(row.name).toBe("list_created");
    expect(row.slug).toBe("abc123");
    expect(row.is_bot).toBe(false);
    expect(row.props).toEqual({
      want_count: 3,
      have_count: 5,
      is_anon: true,
    });
  });

  test("defaults every optional field", async () => {
    await track({ name: "page_viewed" });

    const [row] = await allEvents();
    expect(row.session_hash).toBeNull();
    expect(row.user_id).toBeNull();
    expect(row.slug).toBeNull();
    expect(row.is_bot).toBe(false);
    expect(row.props).toEqual({});
  });

  test("swallows a database failure rather than breaking the caller", async () => {
    // A name long enough to blow past any sane column is not what fails here;
    // an invalid user_id is — it must not surface as a thrown error.
    await track({ name: "page_viewed", userId: "not-a-uuid" });

    expect(await allEvents()).toHaveLength(0);
  });
});

describe("trackPageView", () => {
  beforeEach(async () => {
    await cleanupTestData(connection);
  });

  test("records path, referrer and status for an HTML GET", async () => {
    await trackPageView(
      pageRequest("http://localhost:3000/new", {
        "user-agent":
          "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1",
        referer: "https://discord.com/channels/1/2",
      }),
      htmlResponse(),
    );

    const [row] = await allEvents();
    expect(row.name).toBe("page_viewed");
    expect(row.is_bot).toBe(false);
    expect(row.props.path).toBe("/new");
    expect(row.props.referrer).toBe("https://discord.com/channels/1/2");
    expect(row.props.status).toBe(200);
  });

  test("flags a crawler so human traffic can be counted separately", async () => {
    await trackPageView(
      pageRequest("http://localhost:3000/", {
        "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)",
      }),
      htmlResponse(),
    );

    const [row] = await allEvents();
    expect(row.is_bot).toBe(true);
  });

  test("attributes an unfurl bot fetching a list page to its platform", async () => {
    await trackPageView(
      pageRequest("http://localhost:3000/l/abc123", {
        "user-agent": "Mozilla/5.0 (compatible; Discordbot/2.0)",
      }),
      htmlResponse(),
    );

    const [row] = await allEvents();
    expect(row.is_bot).toBe(true);
    expect(row.props.platform).toBe("discord");
  });

  test("hashes the session cookie rather than storing it", async () => {
    await trackPageView(
      pageRequest("http://localhost:3000/", {}, "raw-session-value"),
      htmlResponse(),
    );

    const [row] = await allEvents();
    expect(row.session_hash).not.toBeNull();
    expect(row.session_hash).not.toBe("raw-session-value");
  });

  test("ignores non-HTML responses", async () => {
    await trackPageView(
      pageRequest("http://localhost:3000/api/cards"),
      Response.json({ ok: true }),
    );

    expect(await allEvents()).toHaveLength(0);
  });

  test("ignores non-GET requests", async () => {
    const req = new Request("http://localhost:3000/feedback", {
      method: "POST",
    }) as unknown as Parameters<typeof trackPageView>[0];
    Object.defineProperty(req, "cookies", { value: { get: () => undefined } });

    await trackPageView(req, htmlResponse());

    expect(await allEvents()).toHaveLength(0);
  });

  test("truncates an oversized referrer", async () => {
    await trackPageView(
      pageRequest("http://localhost:3000/", {
        referer: `https://example.com/${"a".repeat(2000)}`,
      }),
      htmlResponse(),
    );

    const [row] = await allEvents();
    expect((row.props.referrer as string).length).toBe(512);
  });
});

describe("trackOgFetch", () => {
  beforeEach(async () => {
    await cleanupTestData(connection);
  });

  test("records the platform, render outcome and timing of an unfurl", async () => {
    await trackOgFetch({
      slug: "abc123",
      outcome: "ok",
      userAgent: "Mozilla/5.0 (compatible; Discordbot/2.0)",
      renderComplete: true,
      cacheHit: false,
      durationMs: 420,
      cardCount: 66,
      versioned: true,
    });

    const [row] = await allEvents();
    expect(row.name).toBe("og_fetched");
    expect(row.slug).toBe("abc123");
    expect(row.is_bot).toBe(true);
    expect(row.props.platform).toBe("discord");
    expect(row.props.outcome).toBe("ok");
    expect(row.props.render_complete).toBe(true);
    expect(row.props.cache_hit).toBe(false);
    expect(row.props.duration_ms).toBe(420);
    expect(row.props.card_count).toBe(66);
    expect(row.props.versioned).toBe(true);
  });

  test("records an incomplete render, so broken shares are countable", async () => {
    await trackOgFetch({
      slug: "abc123",
      outcome: "ok",
      userAgent: "Twitterbot/1.0",
      renderComplete: false,
      cacheHit: false,
      durationMs: 900,
      cardCount: 4,
    });

    const [row] = await allEvents();
    expect(row.props.render_complete).toBe(false);
    expect(row.props.platform).toBe("twitter");
  });

  test("records a fallback image served for a dead link", async () => {
    await trackOgFetch({
      slug: "gone",
      outcome: "expired",
      userAgent: "Mozilla/5.0 (compatible; Discordbot/2.0)",
      durationMs: 12,
    });

    const [row] = await allEvents();
    expect(row.props.outcome).toBe("expired");
    expect(row.props.render_complete).toBeNull();
    expect(row.props.card_count).toBeNull();
  });
});
