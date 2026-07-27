import { CsrfField } from "../components/csrf-field";
import { Flash } from "../components/flash";
import { FormField } from "../components/form-field";
import { Layout } from "../components/layouts";
import type { User } from "../services/users";

export interface FeedbackState {
  state?: "sent" | "error";
  error?: string;
}

export interface FeedbackProps {
  user?: User | null;
  csrfToken: string;
  pageUrl: string;
  formStamp: string;
  state?: FeedbackState;
}

export const Feedback = ({
  user,
  csrfToken,
  pageUrl,
  formStamp,
  state,
}: FeedbackProps) => {
  return (
    <Layout
      title="Feedback - WantHave"
      name="feedback"
      user={user}
      canonicalPath="/feedback"
      description="Tell us what you think of WantHave — bugs, ideas, or anything else."
      noindex
    >
      <div className="feedback-page">
        <h1>Send us feedback</h1>
        <p className="feedback-intro">
          Found a bug, got an idea, or just want to say something? We read every
          message.
        </p>

        {state?.state === "sent" && (
          <Flash type="success">
            <span>Thanks — we got your feedback.</span>
          </Flash>
        )}

        <form method="POST" action="/feedback">
          <CsrfField token={csrfToken} />
          <input type="hidden" name="page_url" value={pageUrl} />
          <input type="hidden" name="form_ts" value={formStamp} />

          {state?.state === "error" && state.error && (
            <Flash type="error">
              <span>{state.error}</span>
            </Flash>
          )}

          <FormField label="Your feedback" id="message">
            <textarea
              id="message"
              name="message"
              rows={6}
              required
              placeholder="What's on your mind?"
            />
          </FormField>

          {!user && (
            <FormField label="Email (optional)" id="email">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="So we can reply"
              />
            </FormField>
          )}

          <button type="submit" className="btn-primary">
            Send feedback
          </button>
        </form>
      </div>
    </Layout>
  );
};
