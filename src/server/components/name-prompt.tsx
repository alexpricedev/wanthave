import { MAX_DISPLAY_NAME_LENGTH } from "../utils/display-name";
import { CsrfField } from "./csrf-field";

interface NamePromptProps {
  csrfToken?: string;
  // Where /account sends the user back to once the name is saved.
  returnTo: string;
  // A page can carry two of these (share panel and owner bar), and a duplicate
  // input id would break both labels.
  idPrefix: string;
  label?: string;
}

// Onboarding, asked at the moment it pays off: a signed-in user looking at the
// link they're about to paste into Discord. One field, no page to leave, and
// skippable by ignoring it — the same posture as the account nudge.
export const NamePrompt = ({
  csrfToken,
  returnTo,
  idPrefix,
  label = "Add your name to this link",
}: NamePromptProps) => {
  const inputId = `${idPrefix}-display-name`;
  return (
    <form className="name-prompt" method="post" action="/account">
      <CsrfField token={csrfToken ?? null} />
      <input type="hidden" name="return_to" value={returnTo} />
      <label className="friend-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="name-prompt-row">
        <input
          id={inputId}
          className="friend-input"
          type="text"
          name="display_name"
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          autoComplete="nickname"
          placeholder="Your name or Discord handle"
        />
        <button type="submit" className="btn-primary name-prompt-btn">
          Save
        </button>
      </div>
      <p className="name-prompt-hint text-tertiary">
        It goes first in the preview—“Alex—Pokémon Pocket trade list”—so people
        in the channel know whose list they're looking at. It's saved to your
        account and used on every list you share.
      </p>
    </form>
  );
};
