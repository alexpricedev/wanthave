import type { BunRequest } from "bun";
import { getSessionContext } from "../../middleware/auth";
import { verifyMagicLink } from "../../services/auth";
import {
  type ClaimedList,
  claimList,
  claimListsByToken,
} from "../../services/lists";
import { log } from "../../services/logger";
import { setSessionCookie } from "../../services/sessions";
import { saveUserFriendId } from "../../services/users";
import { computeHMAC } from "../../utils/crypto";
import { redirect } from "../../utils/response";
import { CLAIM_COOKIE, CLAIM_TOKEN_COOKIE } from "../api/lists";

// Adopt every anonymous list this device built. The claim token covers lists
// created since it shipped; the legacy slug cookie covers the one list a guest
// mid-flow at that point would otherwise lose. Newest first.
//
// Genuinely best effort: by the time this runs the session cookie is set and
// the user is logged in, so a failure here must not turn a successful login
// into an error page. They keep their session; the lists stay unclaimed and
// can be claimed on a later login.
const claimPendingLists = async (
  req: BunRequest,
  userId: string,
): Promise<ClaimedList[]> => {
  const claimed: ClaimedList[] = [];

  try {
    const token = req.cookies.get(CLAIM_TOKEN_COOKIE);
    if (token) {
      claimed.push(...(await claimListsByToken(computeHMAC(token), userId)));
      req.cookies.delete(CLAIM_TOKEN_COOKIE);
    }

    const legacySlug = req.cookies.get(CLAIM_COOKIE);
    if (legacySlug) {
      if (!claimed.some((l) => l.slug === legacySlug)) {
        const legacy = await claimList(legacySlug, userId);
        if (legacy) {
          claimed.push({ slug: legacySlug, friendId: legacy.friendId });
        }
      }
      // Only once the claim is settled — dropping it first would orphan the
      // list for good if claimList threw.
      req.cookies.delete(CLAIM_COOKIE);
    }

    // Carrying the newest claimed friend ID onto the account is part of the
    // adoption, and just as optional.
    const friendId = claimed.find((l) => l.friendId)?.friendId;
    if (friendId) {
      await saveUserFriendId(userId, friendId);
    }
  } catch (error) {
    log.error("claim", `Could not claim lists for ${userId}: ${error}`);
  }

  return claimed;
};

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

      // "Create a link → sign up to keep it" should hand over everything this
      // device built. One claimed list lands on the list itself; several land
      // on the index that now holds them all.
      const claimed = await claimPendingLists(req, result.user.id);
      const destination =
        claimed.length === 1 ? `/l/${claimed[0].slug}` : "/lists";

      return new Response("", {
        status: 303,
        headers: { Location: destination },
      });
    } catch {
      return redirect("/login?error=Authentication failed. Please try again.");
    }
  },
};
