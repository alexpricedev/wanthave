// Pokémon TCG Pocket friend codes are 16 digits, shown in game as four groups
// of four. We store the bare 16 digits and format for display.

// Returns the 16 bare digits, or null if the input isn't a valid friend code.
// Tolerant of spaces/dashes the user may paste in.
export const normalizeFriendId = (
  raw: string | null | undefined,
): string | null => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 16 ? digits : null;
};

// 16 digits → "1234 5678 9012 3456". Passes through anything unexpected.
export const formatFriendId = (fid: string): string => {
  if (!/^\d{16}$/.test(fid)) return fid;
  return fid.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
};
