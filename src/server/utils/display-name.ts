// The name a user puts on their shared lists. It leads the public page's meta
// title and is drawn on the OG image, so it is cleaned hard on the way in:
// anything that could reshape a title bar (control characters, bidi overrides,
// line breaks, runs of whitespace) is stripped rather than escaped.

export const MIN_DISPLAY_NAME_LENGTH = 2;
export const MAX_DISPLAY_NAME_LENGTH = 24;

// C0/C1 controls plus the bidi overrides and isolates — invisible characters
// that would let a name rewrite the text around it in a title or an unfurl.
const INVISIBLE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

// Flatten whitespace (a tab or newline becomes a plain space), drop the
// invisibles, then collapse and trim what's left. The collapse runs twice
// because removing a zero-width character can leave two spaces touching.
// Returns null when nothing usable is left — the same "no name" the column
// stores.
export const normalizeDisplayName = (
  raw: string | null | undefined,
): string | null => {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
};

export type DisplayNameResult =
  | { ok: true; name: string | null }
  | { ok: false; error: string };

// Form-facing check. A blank field is a deliberate "remove my name", not an
// error, so it succeeds with null; only a name that's present but unusable is
// rejected, with copy the account form can show as-is.
export const validateDisplayName = (
  raw: string | null | undefined,
): DisplayNameResult => {
  const name = normalizeDisplayName(raw);
  if (name === null) return { ok: true, name: null };

  const length = [...name].length;
  if (length < MIN_DISPLAY_NAME_LENGTH) {
    return {
      ok: false,
      error: `Give your name at least ${MIN_DISPLAY_NAME_LENGTH} characters, or leave it blank.`,
    };
  }
  if (length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      ok: false,
      error: `Keep your name to ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`,
    };
  }

  return { ok: true, name };
};
