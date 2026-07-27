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
          // Signed-in users get the friend ID saved on their account prefilled;
          // guests fall back to the client's sessionStorage copy.
          initial: ctx.user?.friend_id
            ? {
                wants: [],
                haves: [],
                friendId: ctx.user.friend_id,
                title: "",
              }
            : undefined,
        }}
        heading="Build your trade list"
        sub="Search for the cards you want and add them to your WANT list with a tap. Then switch modes to HAVE and repeat for what you have to trade. When you're done, get a link you can drop into Discord."
        user={ctx.user}
        csrfToken={logoutCsrf}
      />,
    );
  },
};
