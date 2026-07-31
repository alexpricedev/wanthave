import type { BunRequest } from "bun";
import { getSessionContext } from "../../middleware/auth";
import { createCsrfToken } from "../../services/csrf";
import { getDemoOgImage } from "../../services/demo-list";
import { setSessionCookie } from "../../services/sessions";
import { Home } from "../../templates/home";
import { render } from "../../utils/response";

export const home = {
  async index(req: BunRequest): Promise<Response> {
    const ctx = await getSessionContext(req);

    if (ctx.requiresSetCookie && ctx.sessionId) {
      setSessionCookie(req, ctx.sessionId);
    }

    let csrfToken: string | undefined;
    if (ctx.isAuthenticated && ctx.sessionId) {
      csrfToken = await createCsrfToken(ctx.sessionId, "POST", "/auth/logout");
    }

    return render(<Home user={ctx.user} csrfToken={csrfToken} />);
  },

  // GET /og/demo.png — the hero's unfurl preview, produced by the same
  // renderer that makes a real share image, so the home page can't drift from
  // what Discord actually shows.
  async demoOg(req: BunRequest): Promise<Response> {
    const png = await getDemoOgImage();
    // The page links a `?v=` URL keyed to the cards it draws, so that one can be
    // cached forever; a bare hit is someone's stale copy and gets an hour.
    const versioned = new URL(req.url).searchParams.has("v");
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": versioned
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
      },
    });
  },
};
