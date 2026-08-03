import type { BunRequest } from "bun";
import { getSessionContext, requireAuth } from "../../middleware/auth";
import { csrfProtection } from "../../middleware/csrf";
import { createCsrfToken } from "../../services/csrf";
import { refreshOgImagesForUser } from "../../services/lists";
import { saveUserDisplayName, setUserFriendId } from "../../services/users";
import type { AccountState } from "../../templates/account";
import { Account } from "../../templates/account";
import { validateDisplayName } from "../../utils/display-name";
import { normalizeFriendId } from "../../utils/friend-id";
import { redirect, render } from "../../utils/response";
import { stateHelpers } from "../../utils/state";

const { getFlash, setFlash } = stateHelpers<AccountState>();

// Where to send the user after a successful save. The name form is embedded in
// the list page, so it has somewhere to go back to — but only ever a path on
// this site: anything absolute, protocol-relative, or otherwise not a plain
// path falls back to the account page.
const safeReturnTo = (raw: FormDataEntryValue | null): string | null => {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || raw.includes("\n") || raw.includes("\r")) {
    return null;
  }
  return raw;
};

export const account = {
  async index(req: BunRequest): Promise<Response> {
    const authRedirect = await requireAuth(req);
    if (authRedirect) return authRedirect;

    const ctx = await getSessionContext(req);
    if (!ctx.user || !ctx.sessionId) return redirect("/login");

    const csrfToken = await createCsrfToken(ctx.sessionId, "POST", "/account");
    const logoutCsrf = await createCsrfToken(
      ctx.sessionId,
      "POST",
      "/auth/logout",
    );

    return render(
      <Account
        user={ctx.user}
        csrfToken={csrfToken}
        logoutCsrf={logoutCsrf}
        state={getFlash(req)}
      />,
    );
  },

  async update(req: BunRequest): Promise<Response> {
    const authRedirect = await requireAuth(req);
    if (authRedirect) return authRedirect;

    const ctx = await getSessionContext(req);
    if (!ctx.user) return redirect("/login");

    const csrf = await csrfProtection(req, {
      method: "POST",
      path: "/account",
    });
    if (csrf) return csrf;

    const formData = await req.formData();
    const returnTo = safeReturnTo(formData.get("return_to"));

    const name = validateDisplayName(formData.get("display_name") as string);
    if (!name.ok) {
      setFlash(req, { state: "error", error: name.error });
      // Errors go to the full form rather than back to the embedded prompt —
      // that one has no room to explain itself.
      return redirect("/account");
    }

    // The friend ID field only appears on the account page, so a form that
    // omits it entirely (the inline name prompt) must leave the stored one
    // alone rather than read the missing field as a deletion.
    const rawFriendId = formData.get("friend_id");
    if (typeof rawFriendId === "string") {
      const friendId = normalizeFriendId(rawFriendId);
      if (friendId === null && rawFriendId.replace(/\D/g, "").length > 0) {
        setFlash(req, {
          state: "error",
          error: "A friend ID is 16 digits. Check it, or clear it to skip.",
        });
        return redirect("/account");
      }
      await setUserFriendId(ctx.user.id, friendId);
    }

    const renamed = name.name !== ctx.user.display_name;
    await saveUserDisplayName(ctx.user.id, name.name);

    // The name is drawn on the OG image, so a rename has to reach the images
    // already cached for this user's lists.
    if (renamed) {
      await refreshOgImagesForUser(ctx.user.id);
    }

    if (returnTo) return redirect(returnTo);

    setFlash(req, { state: "saved" });
    return redirect("/account");
  },
};
