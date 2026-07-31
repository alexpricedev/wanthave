import type { BunRequest } from "bun";
import { getSessionContext } from "../../middleware/auth";
import { createCsrfToken } from "../../services/csrf";
import {
  getCachedOgImage,
  getTradeListBySlug,
  isDeviceClaimant,
  isExpired,
  setCachedOgImage,
} from "../../services/lists";
import { renderOgImage } from "../../services/og";
import { setSessionCookie } from "../../services/sessions";
import { ListPage } from "../../templates/list";
import { ListUnavailable } from "../../templates/list-unavailable";
import { render } from "../../utils/response";
import { CLAIM_TOKEN_COOKIE } from "../api/lists";

// The site-wide branded fallback OG, served for expired/missing links so old
// Discord posts never look broken.
const fallbackOg = async (): Promise<Response> => {
  const file = Bun.file("public/og-image.png");
  return new Response(file, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
};

export const list = {
  async index<T extends `${string}:slug${string}`>(
    req: BunRequest<T>,
  ): Promise<Response> {
    const ctx = await getSessionContext(req);
    if (ctx.requiresSetCookie && ctx.sessionId) {
      setSessionCookie(req, ctx.sessionId);
    }

    let logoutCsrf: string | undefined;
    if (ctx.isAuthenticated && ctx.sessionId) {
      logoutCsrf = await createCsrfToken(ctx.sessionId, "POST", "/auth/logout");
    }

    const { slug } = req.params;
    const tradeList = await getTradeListBySlug(slug);

    if (!tradeList) {
      return render(
        <ListUnavailable
          reason="missing"
          user={ctx.user}
          csrfToken={logoutCsrf}
        />,
      );
    }
    if (isExpired(tradeList)) {
      return render(
        <ListUnavailable
          reason="expired"
          user={ctx.user}
          csrfToken={logoutCsrf}
        />,
      );
    }

    const url = new URL(req.url);
    const created = url.searchParams.get("created") === "1";
    const shareUrl = `${url.origin}/l/${slug}`;

    const isOwner = ctx.user?.id != null && tradeList.userId === ctx.user.id;

    // A guest returning to a list they built: the page can tell them it's
    // theirs and what an account would add. Only worth a lookup for an
    // unclaimed list viewed by someone carrying a claim token.
    const claimToken = req.cookies.get(CLAIM_TOKEN_COOKIE);
    const builtHere =
      tradeList.userId === null &&
      Boolean(claimToken) &&
      (await isDeviceClaimant(slug, claimToken as string));

    return render(
      <ListPage
        list={tradeList}
        shareUrl={shareUrl}
        created={created}
        canClaim={tradeList.userId === null}
        builtHere={builtHere}
        isOwner={isOwner}
        user={ctx.user}
        csrfToken={logoutCsrf}
      />,
    );
  },

  // GET /l/:slug/og.png — the rendered unfurl image. Cached on the row after
  // first render (anon lists are immutable, so this renders once).
  async og<T extends `${string}:slug${string}`>(
    req: BunRequest<T>,
  ): Promise<Response> {
    const { slug } = req.params;
    const tradeList = await getTradeListBySlug(slug);

    if (!tradeList || isExpired(tradeList)) {
      return fallbackOg();
    }

    // A render that fell back to placeholder tiles isn't cached. An anon list is
    // immutable, so caching one would freeze the placeholders in place forever —
    // and whatever made the art unavailable (a set not yet mirrored, a bad
    // deploy, a blip) is by definition the transient case. Re-rendering until the
    // art resolves costs one render per unfurl.
    const cached = await getCachedOgImage(slug);
    let bytes = cached;
    if (!bytes) {
      const render = await renderOgImage(tradeList);
      bytes = render.png;
      if (render.complete) {
        await setCachedOgImage(slug, bytes);
      }
    }

    // A `?v=` URL is unique per edit (the page mints a new one from updated_at),
    // so it can be cached forever. The bare URL is what older unfurls point at,
    // and its content changes on every edit — keep that one short-lived so
    // stale embeds recover on their own.
    const versioned = new URL(req.url).searchParams.has("v");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": versioned
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
      },
    });
  },
};
