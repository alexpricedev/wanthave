import { CsrfField } from "../components/csrf-field";
import { Flash } from "../components/flash";
import { FormField } from "../components/form-field";
import { Layout } from "../components/layouts";
import type { User } from "../services/users";
import { MAX_DISPLAY_NAME_LENGTH } from "../utils/display-name";
import { formatFriendId } from "../utils/friend-id";

export interface AccountState {
  state?: "saved" | "error";
  error?: string;
}

interface AccountProps {
  user: User;
  csrfToken: string;
  logoutCsrf?: string;
  state?: AccountState;
}

// The two things an account remembers about a person: the name that leads
// their shared links, and the friend ID that prefills their next list. Both
// are set once here and reused everywhere, so neither has to be retyped.
export const Account = ({
  user,
  csrfToken,
  logoutCsrf,
  state,
}: AccountProps) => (
  <Layout
    title="Your account—wanthave"
    name="account"
    noindex
    user={user}
    csrfToken={logoutCsrf}
  >
    <section className="account-page">
      <header className="account-head">
        <h1>Your account</h1>
        <p className="lead">
          Signed in as <strong>{user.email}</strong>
        </p>
      </header>

      {state?.state === "saved" && (
        <Flash type="success">
          <span>Saved. Your lists will show this straight away.</span>
        </Flash>
      )}

      <form method="POST" action="/account">
        <CsrfField token={csrfToken} />

        {state?.state === "error" && state.error && (
          <Flash type="error">
            <span>{state.error}</span>
          </Flash>
        )}

        <FormField label="Your name" id="display_name">
          <input
            id="display_name"
            name="display_name"
            type="text"
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            autoComplete="nickname"
            placeholder="Your name or Discord handle"
            defaultValue={user.display_name ?? ""}
          />
          <p className="field-hint text-tertiary">
            Shown first when your link unfurls in Discord—“
            {user.display_name || "Alex"}—Pokémon Pocket trade list”. Leave it
            blank to share anonymously.
          </p>
        </FormField>

        <FormField label="Friend ID" id="friend_id">
          <input
            id="friend_id"
            name="friend_id"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="1234 5678 9012 3456"
            defaultValue={
              user.friend_id ? formatFriendId(user.friend_id) : undefined
            }
          />
          <p className="field-hint text-tertiary">
            16 digits. Prefilled into every new list you build, so you only type
            it once.
          </p>
        </FormField>

        <button type="submit" className="btn-primary">
          Save
        </button>
      </form>

      <p className="account-footnote text-tertiary">
        Changing your name updates every list you've shared, including the
        preview image on links already posted.
      </p>
    </section>
  </Layout>
);
