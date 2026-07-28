import type { BunRequest } from "bun";
import { getSessionContext } from "../../middleware/auth";
import { createCsrfToken } from "../../services/csrf";
import {
  getCachedOgImage,
  getTradeListBySlug,
  isExpired,
  setCachedOgImage,
} from "../../services/lists";
import { renderOgImage } from "../../services/og";
import { setSessionCookie } from "../../services/sessions";
import { ListPage } from "../../templates/list";
import { ListUnavailable } from "../../templates/list-unavailable";
import { render } from "../../utils/response";

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

    return render(
      <ListPage
        list={tradeList}
        shareUrl={shareUrl}
        created={created}
        canClaim={tradeList.userId === null}
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

    const cached = await getCachedOgImage(slug);
    const bytes = cached ?? (await renderOgImage(tradeList));
    if (!cached) {
      await setCachedOgImage(slug, bytes);
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
