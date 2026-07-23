import type { BunRequest } from "bun";
import { getSessionContext } from "../../middleware/auth";
import { csrfProtection } from "../../middleware/csrf";
import { rateLimit } from "../../middleware/rate-limit";
import { createCsrfToken } from "../../services/csrf";
import { getEmailService } from "../../services/email";
import { createFeedback } from "../../services/feedback";
import { log } from "../../services/logger";
import { setSessionCookie } from "../../services/sessions";
import type { FeedbackState } from "../../templates/feedback";
import { Feedback } from "../../templates/feedback";
import { redirect, render } from "../../utils/response";
import { stateHelpers } from "../../utils/state";

const { getFlash, setFlash } = stateHelpers<FeedbackState>();

// The page the user came from, for triage. Only same-origin http(s) URLs, and
// never /feedback itself (which would just record the round-trips through this
// page). Empty string when there's nothing useful to record.
const capturePageUrl = (req: BunRequest): string => {
  const referer = req.headers.get("referer");
  if (!referer) return "";
  try {
    const url = new URL(referer);
    const here = new URL(req.url);
    if (url.origin !== here.origin) return "";
    if (url.pathname === "/feedback") return "";
    return url.href;
  } catch {
    return "";
  }
};

export const feedback = {
  async index(req: BunRequest): Promise<Response> {
    const ctx = await getSessionContext(req);

    if (ctx.requiresSetCookie && ctx.sessionId) {
      setSessionCookie(req, ctx.sessionId);
    }

    const csrfToken = ctx.sessionId
      ? await createCsrfToken(ctx.sessionId, "POST", "/feedback")
      : "";

    const state = getFlash(req);

    return render(
      <Feedback
        user={ctx.user}
        csrfToken={csrfToken}
        pageUrl={capturePageUrl(req)}
        state={state}
      />,
    );
  },

  async submit(req: BunRequest): Promise<Response> {
    // Cap submissions per IP so a script can't flood the table / notifications.
    const limited = rateLimit(req, 8, 60_000);
    if (limited) return limited;

    const ctx = await getSessionContext(req);
    if (ctx.requiresSetCookie && ctx.sessionId) {
      setSessionCookie(req, ctx.sessionId);
    }

    const csrf = await csrfProtection(req, {
      method: "POST",
      path: "/feedback",
    });
    if (csrf) return csrf;

    const formData = await req.formData();
    const message = (formData.get("message") as string) ?? "";
    const guestEmail = (formData.get("email") as string) ?? "";
    const pageUrl = (formData.get("page_url") as string) ?? "";

    // Prefer the account email; fall back to the reply address a guest typed.
    const email = ctx.user?.email ?? guestEmail.trim() ?? null;

    const result = await createFeedback({
      userId: ctx.user?.id ?? null,
      sessionId: ctx.sessionId,
      message,
      email: email || null,
      pageUrl,
      userAgent: req.headers.get("user-agent"),
    });

    if (!result.ok) {
      setFlash(req, { state: "error", error: result.error });
      return redirect("/feedback");
    }

    // Fire the notification after the DB write. A mail failure must never lose
    // the saved feedback, so it's logged, not surfaced.
    try {
      await getEmailService().sendFeedbackNotification({
        message: result.feedback.message,
        submitter: result.feedback.email,
        pageUrl: result.feedback.pageUrl,
        userAgent: result.feedback.userAgent,
      });
    } catch (error) {
      log.error("feedback", `Failed to send notification: ${String(error)}`);
    }

    setFlash(req, { state: "sent" });
    return redirect("/feedback");
  },
};
