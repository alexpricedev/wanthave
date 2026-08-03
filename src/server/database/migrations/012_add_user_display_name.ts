/**
 * Display name on the account.
 *
 * A shared list is a person's artefact, so it should say whose it is: the name
 * leads the page's meta title, so a Discord unfurl reads "Alex—…" rather than
 * an anonymous "Pokémon Pocket trade list". Nullable and non-unique — it's a
 * label, not a handle: there are no profiles to address and nothing resolves a
 * list by name.
 *
 * Length is capped in the column as well as in normalizeDisplayName so a name
 * can't be stretched past what the title and OG image can carry.
 */
import type { SQL } from "bun";

export const up = async (db: SQL): Promise<void> => {
  await db`ALTER TABLE users ADD COLUMN display_name VARCHAR(24)`;
};

export const down = async (db: SQL): Promise<void> => {
  await db`ALTER TABLE users DROP COLUMN IF EXISTS display_name`;
};
