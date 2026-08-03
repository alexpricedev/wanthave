import type { BunRequest } from "bun";
import { getSessionContext } from "../../middleware/auth";
import { checkCsrf, isRecoverableCsrfFailure } from "../../middleware/csrf";
import { rateLimit } from "../../middleware/rate-limit";
import { createCsrfToken } from "../../services/csrf";
import { sessionHashFromRequest, track } from "../../services/events";
import {
  ANON_TTL_DAYS,
  type CardInput,
  createTradeList,
  updateTradeList,
} from "../../services/lists";
import { setSessionCookie } from "../../services/sessions";
import { saveUserFriendId } from "../../services/users";
import { computeHMAC, generateSecureToken } from "../../utils/crypto";

// Legacy: anonymous list creation used to drop the newest list's slug here, and
// login claimed that one list. Nothing writes it any more — auth/callback still
// reads it so guests mid-flow when claim tokens shipped don't lose their list.
// Safe to delete once the old cookie's 7-day max-age has passed.
export const CLAIM_COOKIE = "wh_claim";

// Per-device claim token. Every anonymous list stores its HMAC, so signing in
// adopts all of them at once (see auth/callback). httpOnly: unlike the slug it
// replaces, holding this token is what authorizes the claim.
export const CLAIM_TOKEN_COOKIE = "wh_owner";

// Outlive the lists it claims, so the window to sign up and keep them matches
// how long they actually live rather than expiring out from under the user.
const CLAIM_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: ANON_TTL_DAYS * 24 * 60 * 60,
};

// Shape of a freshly minted generateSecureToken(). The cookie is user-supplied,
// so anything else gets thrown away rather than hashed into a DB column.
const CLAIM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

// Reuse this device's existing token so every list it has built shares one, and
// mint a fresh one for a first-time guest.
const deviceClaimToken = (req: BunRequest): string => {
  const existing = req.cookies.get(CLAIM_TOKEN_COOKIE);
  return existing && CLAIM_TOKEN_PATTERN.test(existing)
    ? existing
    : generateSecureToken();
};

interface CreateBody {
  cards?: unknown;
  friendId?: unknown;
  title?: unknown;
}

// Coerce the untrusted JSON body's cards into CardInput[]. Full validation
// (unknown ids, dupes, caps) happens in the service; this just shapes it.
const parseCards = (raw: unknown): CardInput[] => {
  if (!Array.isArray(raw)) return [];
  const out: CardInput[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const { cardId, kind, quantity } = item as Record<string, unknown>;
      if (typeof cardId === "string" && (kind === "want" || kind === "have")) {
        out.push({
          cardId,
          kind,
          quantity: typeof quantity === "number" ? quantity : 1,
        });
      }
    }
  }
  return out;
};

const asString = (v: unknown): string | null =>
  typeof v === "string" ? v : null;

// The builder is a long-lived page: a CSRF token minted when it loaded goes
// stale after ~15-30 minutes, and until now that was a dead end — the 403 body
// was plain text the island couldn't read, and retrying could never work
// because the token in the page was permanently expired. A stale token still
// proves the caller holds this session's secret (or, for a lapsed session, the
// request has already been given a fresh one), so refuse the action but hand
// back a token that works. The user clicks again and keeps every card.
const CSRF_EXPIRED_MESSAGE =
  "Your session timed out while you were building. Nothing was lost — press the button again to save.";

const csrfGuard = async (
  req: BunRequest,
  sessionId: string,
  method: string,
  path: string,
): Promise<Response | null> => {
  const result = await checkCsrf(req, { method, path });
  if (result.ok) return null;

  if (isRecoverableCsrfFailure(result)) {
    try {
      const csrfToken = await createCsrfToken(sessionId, method, path);
      return Response.json(
        { error: CSRF_EXPIRED_MESSAGE, code: "csrf-expired", csrfToken },
        { status: 403 },
      );
    } catch {
      // Session vanished between the check and minting - fall through to the
      // hard failure rather than pretending recovery is possible.
    }
  }

  // Hard failure. Re-shape the middleware's plain-text body as JSON so the
  // island shows the real reason instead of its generic fallback.
  return Response.json(
    { error: await result.response.text() },
    { status: result.response.status },
  );
};

export const listsApi = {
  async create(req: BunRequest): Promise<Response> {
    // Cap list creation per IP so a script can't flood the DB / OG renderer.
    const limited = rateLimit(req, 12, 60_000);
    if (limited) return limited;

    const ctx = await getSessionContext(req);
    if (!ctx.sessionId) {
      return Response.json({ error: "No session" }, { status: 403 });
    }
    if (ctx.requiresSetCookie) {
      setSessionCookie(req, ctx.sessionId);
    }

    const csrf = await csrfGuard(req, ctx.sessionId, "POST", "/api/lists");
    if (csrf) return csrf;

    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const friendId = asString(body.friendId);
    const claimToken = ctx.user ? null : deviceClaimToken(req);
    const cards = parseCards(body.cards);
    const result = await createTradeList({
      cards,
      friendId,
      title: asString(body.title),
      userId: ctx.user?.id ?? null,
      claimTokenHash: claimToken ? computeHMAC(claimToken) : null,
    });

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    // The denominator for the builder funnel: against page views on /new this
    // says whether a low list count is a traffic problem or a builder problem.
    void track({
      name: "list_created",
      slug: result.list.slug,
      userId: ctx.user?.id ?? null,
      sessionHash: sessionHashFromRequest(req),
      props: {
        want_count: cards.filter((c) => c.kind === "want").length,
        have_count: cards.filter((c) => c.kind === "have").length,
        has_friend_id: Boolean(friendId),
        has_title: Boolean(asString(body.title)),
        is_anon: ctx.user == null,
      },
    });

    // Keep the friend ID on the account so the next list prefills it.
    if (ctx.user) {
      await saveUserFriendId(ctx.user.id, friendId);
    }

    // Re-set on every anonymous create so an active guest's claim window keeps
    // pace with their newest list rather than aging out from the first one.
    if (claimToken) {
      req.cookies.set(
        CLAIM_TOKEN_COOKIE,
        claimToken,
        CLAIM_TOKEN_COOKIE_OPTIONS,
      );
    }

    return Response.json({ slug: result.list.slug }, { status: 201 });
  },

  async update<T extends `${string}:slug${string}`>(
    req: BunRequest<T>,
  ): Promise<Response> {
    const ctx = await getSessionContext(req);
    if (!ctx.isAuthenticated || !ctx.user || !ctx.sessionId) {
      return Response.json({ error: "Login required" }, { status: 403 });
    }

    const { slug } = req.params;
    const csrf = await csrfGuard(
      req,
      ctx.sessionId,
      "PUT",
      `/api/lists/${slug}`,
    );
    if (csrf) return csrf;

    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const friendId = asString(body.friendId);
    const updated = await updateTradeList(slug, ctx.user.id, {
      cards: parseCards(body.cards),
      friendId,
      title: asString(body.title),
    });

    if (!updated) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    await saveUserFriendId(ctx.user.id, friendId);

    return Response.json({ slug: updated.slug }, { status: 200 });
  },
};
