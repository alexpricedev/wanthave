import { SESSION_COOKIE_NAME } from "../utils/cookies";
import { computeHMAC } from "../utils/crypto";
import { classifyUserAgent } from "../utils/user-agent";
import { db } from "./database";
import { log } from "./logger";

/**
 * Product analytics. Three events, chosen to answer three decisions:
 *
 * - `page_viewed` — who visits, from where, and are they even human. Every
 *   other rate is meaningless until this one separates people from crawlers.
 * - `og_fetched`  — the share image is the product; this is the only record
 *   that a list was posted somewhere, on which platform, and whether the
 *   render that went out was complete and fast enough to beat an unfurl
 *   bot's timeout.
 * - `list_created` — the denominator. Against `page_viewed` on /new it says
 *   whether a low list count is a traffic problem or a builder problem.
 */
export type EventName = "page_viewed" | "og_fetched" | "list_created";

export interface TrackInput {
  name: EventName;
  /** HMAC of the session cookie (sessions.id_hash), never the raw token. */
  sessionHash?: string | null;
  userId?: string | null;
  slug?: string | null;
  isBot?: boolean;
  props?: Record<string, unknown>;
}

// Free-text pulled off the wire (Referer, User-Agent) is attacker-controlled and
// unbounded. Long enough to keep every real value intact.
const MAX_TEXT = 512;

const truncate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) : value;
};

/**
 * Record one event. Never throws and never blocks the response — analytics
 * failing is not a reason for a page to fail, so callers fire and forget.
 */
export const track = async (input: TrackInput): Promise<void> => {
  try {
    await db`
      INSERT INTO event (name, session_hash, user_id, slug, is_bot, props)
      VALUES (
        ${input.name},
        ${input.sessionHash ?? null},
        ${input.userId ?? null},
        ${input.slug ?? null},
        ${input.isBot ?? false},
        ${JSON.stringify(input.props ?? {})}::jsonb
      )
    `;
  } catch (error) {
    log.warn(
      "events",
      `Failed to record ${input.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

// These take a plain Request rather than a BunRequest so the shared response
// pipeline — which is generic over Request — can call them. The cookie jar is
// Bun's addition, so it's read through a narrow structural type and treated as
// optional rather than assumed present.
type WithCookies = { cookies?: { get(name: string): string | undefined } };

/**
 * The session's DB identity, derived from the cookie without a lookup. Read
 * after the handler has run so a first-time visitor — whose cookie is set
 * during the request — still gets attributed rather than counting as null.
 */
export const sessionHashFromRequest = (req: Request): string | null => {
  try {
    const raw = (req as Request & WithCookies).cookies?.get(
      SESSION_COOKIE_NAME,
    );
    return raw ? computeHMAC(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Record a page view, given a request and the response it produced.
 *
 * Gated on an HTML response so this can sit in the shared pipeline and still
 * only ever fire for pages — JSON, images, robots.txt and static assets all
 * filter themselves out with no per-route wiring to keep in sync.
 */
export const trackPageView = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (req.method !== "GET") return;
  if (!(res.headers.get("Content-Type") ?? "").startsWith("text/html")) return;

  const userAgent = req.headers.get("user-agent");
  const { isBot, platform } = classifyUserAgent(userAgent);

  await track({
    name: "page_viewed",
    sessionHash: sessionHashFromRequest(req),
    isBot,
    props: {
      path: new URL(req.url).pathname,
      referrer: truncate(req.headers.get("referer")),
      user_agent: truncate(userAgent),
      platform,
      status: res.status,
    },
  });
};

export interface OgFetchInput {
  slug: string;
  /** "ok" when a real list rendered; otherwise why the fallback image went out. */
  outcome: "ok" | "missing" | "expired";
  userAgent: string | null;
  /** False when the render fell back to placeholder tiles — a broken share. */
  renderComplete?: boolean;
  /** True when the cached PNG was served, so no render happened. */
  cacheHit?: boolean;
  durationMs: number;
  cardCount?: number;
  /** A `?v=` URL is a fresh unfurl of a specific edit rather than a re-fetch. */
  versioned?: boolean;
}

export const trackOgFetch = async (input: OgFetchInput): Promise<void> => {
  const { isBot, platform } = classifyUserAgent(input.userAgent);

  await track({
    name: "og_fetched",
    slug: input.slug,
    isBot,
    props: {
      outcome: input.outcome,
      platform,
      cache_hit: input.cacheHit ?? null,
      render_complete: input.renderComplete ?? null,
      duration_ms: input.durationMs,
      card_count: input.cardCount ?? null,
      versioned: input.versioned ?? false,
      user_agent: truncate(input.userAgent),
    },
  });
};
