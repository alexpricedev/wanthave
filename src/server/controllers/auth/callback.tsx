import type { BunRequest } from "bun";
import { getSessionContext } from "../../middleware/auth";
import { verifyMagicLink } from "../../services/auth";
import { claimList } from "../../services/lists";
import { setSessionCookie } from "../../services/sessions";
import { saveUserFriendId } from "../../services/users";
import { redirect } from "../../utils/response";
import { CLAIM_COOKIE } from "../api/lists";

export const callback = {
  async index(req: BunRequest): Promise<Response> {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return redirect("/login?error=Missing authentication token");
    }

    try {
      const ctx = await getSessionContext(req);
      const guestSessionId = ctx.isGuest ? ctx.sessionId : null;
      const result = await verifyMagicLink(token, guestSessionId);

      if (!result.success) {
        return redirect(`/login?error=${encodeURIComponent(result.error)}`);
      }

      setSessionCookie(req, result.sessionId);

      // Auto-claim the anonymous list this device most recently created, so
      // "create a link → sign up to keep it" lands the user on their now-
      // permanent list. Best effort: a failed claim never blocks login.
      let destination = "/lists";
      const claimSlug = req.cookies.get(CLAIM_COOKIE);
      if (claimSlug) {
        req.cookies.delete(CLAIM_COOKIE);
        const claimed = await claimList(claimSlug, result.user.id);
        if (claimed) {
          destination = `/l/${claimSlug}`;
          if (claimed.friendId) {
            await saveUserFriendId(result.user.id, claimed.friendId);
          }
        }
      }

      return new Response("", {
        status: 303,
        headers: { Location: destination },
      });
    } catch {
      return redirect("/login?error=Authentication failed. Please try again.");
    }
  },
};
