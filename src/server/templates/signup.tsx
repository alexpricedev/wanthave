import { Flash } from "../components/flash";
import { FormField } from "../components/form-field";
import { BaseLayout } from "../components/layouts";
import { Wordmark } from "../components/wordmark";

export interface SignupState {
  state?: "email-sent" | "validation-error";
  error?: string;
}

export interface SignupProps {
  state?: SignupState;
}

export const Signup = ({ state }: SignupProps) => {
  return (
    <BaseLayout
      title="Sign up - WantHave"
      description="Sign up for WantHave to keep your trade list links permanent and editable—no passwords to remember."
      canonicalPath="/signup"
      noindex
    >
      <main className="login-page">
        <div className="login-wrapper">
          <div className="login-header">
            <a href="/">
              <Wordmark />
            </a>
          </div>

          <div className="login-card">
            <h1 className="login-title">Create your account</h1>
            <p className="login-subtitle">
              We'll send you a magic link to sign up instantly
            </p>

            {state?.state === "email-sent" ? (
              <Flash type="success">
                <p>Check your email!</p>
                <p>
                  We've sent you a magic link. Click it to sign up instantly.
                </p>
                <p>For testing: Check the server console for the magic link.</p>
              </Flash>
            ) : (
              <form method="POST" action="/signup">
                {state?.state === "validation-error" && state.error && (
                  <Flash type="error">
                    <span>{state.error}</span>
                  </Flash>
                )}

                <FormField label="Email address" id="email">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="Enter your email"
                  />
                </FormField>

                <button type="submit" className="login-submit btn-primary">
                  Send magic link
                </button>
              </form>
            )}

            <div className="login-footer">
              <a href="/">Back to home</a>
            </div>
          </div>
        </div>
      </main>
    </BaseLayout>
  );
};
