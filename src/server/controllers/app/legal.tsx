import type { BunRequest } from "bun";
import { getSessionContext } from "../../middleware/auth";
import { createCsrfToken } from "../../services/csrf";
import { setSessionCookie } from "../../services/sessions";
import { Privacy, Terms } from "../../templates/legal";
import { render } from "../../utils/response";

// Resolves session context so the shared chrome (nav, logout form) renders
// correctly for both guests and signed-in users.
async function chrome(req: BunRequest): Promise<{
  user: Awaited<ReturnType<typeof getSessionContext>>["user"];
  csrfToken?: string;
}> {
  const ctx = await getSessionContext(req);
  if (ctx.requiresSetCookie && ctx.sessionId) {
    setSessionCookie(req, ctx.sessionId);
  }
  let csrfToken: string | undefined;
  if (ctx.isAuthenticated && ctx.sessionId) {
    csrfToken = await createCsrfToken(ctx.sessionId, "POST", "/auth/logout");
  }
  return { user: ctx.user, csrfToken };
}

export const legal = {
  async privacy(req: BunRequest): Promise<Response> {
    const { user, csrfToken } = await chrome(req);
    return render(<Privacy user={user} csrfToken={csrfToken} />);
  },
  async terms(req: BunRequest): Promise<Response> {
    const { user, csrfToken } = await chrome(req);
    return render(<Terms user={user} csrfToken={csrfToken} />);
  },
};
