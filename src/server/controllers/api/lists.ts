import type { BunRequest } from "bun";
import { getSessionContext } from "../../middleware/auth";
import { csrfProtection } from "../../middleware/csrf";
import { rateLimit } from "../../middleware/rate-limit";
import {
  type CardInput,
  createTradeList,
  updateTradeList,
} from "../../services/lists";
import { setSessionCookie } from "../../services/sessions";
import { saveUserFriendId } from "../../services/users";

// Set on anonymous list creation so the next successful login auto-claims the
// list into the new account (see auth/callback). Readable by JS is fine — it
// only holds a public slug.
export const CLAIM_COOKIE = "wh_claim";

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

    const csrf = await csrfProtection(req, {
      method: "POST",
      path: "/api/lists",
    });
    if (csrf) return csrf;

    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const friendId = asString(body.friendId);
    const result = await createTradeList({
      cards: parseCards(body.cards),
      friendId,
      title: asString(body.title),
      userId: ctx.user?.id ?? null,
    });

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    // Keep the friend ID on the account so the next list prefills it.
    if (ctx.user) {
      await saveUserFriendId(ctx.user.id, friendId);
    }

    // Anonymous lists: drop a claim cookie so a later signup keeps this link.
    if (!ctx.user) {
      req.cookies.set(CLAIM_COOKIE, result.list.slug, {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return Response.json({ slug: result.list.slug }, { status: 201 });
  },

  async update<T extends `${string}:slug${string}`>(
    req: BunRequest<T>,
  ): Promise<Response> {
    const ctx = await getSessionContext(req);
    if (!ctx.isAuthenticated || !ctx.user) {
      return Response.json({ error: "Login required" }, { status: 403 });
    }

    const { slug } = req.params;
    const csrf = await csrfProtection(req, {
      method: "PUT",
      path: `/api/lists/${slug}`,
    });
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
