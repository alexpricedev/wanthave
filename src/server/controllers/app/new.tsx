import type { BunRequest } from "bun";
import { getSessionContext } from "../../middleware/auth";
import { SETS } from "../../services/cards";
import { createCsrfToken } from "../../services/csrf";
import { setSessionCookie } from "../../services/sessions";
import { BuilderPage } from "../../templates/builder";
import { render } from "../../utils/response";

const setDtos = SETS.map((s) => ({
  code: s.code,
  name: s.name,
  count: s.count,
}));

export const newList = {
  async index(req: BunRequest): Promise<Response> {
    const ctx = await getSessionContext(req);
    if (ctx.requiresSetCookie && ctx.sessionId) {
      setSessionCookie(req, ctx.sessionId);
    }
    if (!ctx.sessionId) {
      // Session store is unavailable; without a session we can't mint the CSRF
      // token the builder needs. Surface a soft error rather than a broken page.
      return new Response("Session unavailable, please retry.", {
        status: 503,
      });
    }

    const createToken = await createCsrfToken(
      ctx.sessionId,
      "POST",
      "/api/lists",
    );

    let logoutCsrf: string | undefined;
    if (ctx.isAuthenticated) {
      logoutCsrf = await createCsrfToken(ctx.sessionId, "POST", "/auth/logout");
    }

    return render(
      <BuilderPage
        config={{
          sets: setDtos,
          csrfToken: createToken,
          mode: "create",
        }}
        heading="Build your trade list"
        sub="Add what you're looking for and what you've got. Get a link you can drop in to Discord."
        user={ctx.user}
        csrfToken={logoutCsrf}
      />,
    );
  },
};
