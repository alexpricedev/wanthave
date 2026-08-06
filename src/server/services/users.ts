import {
  MAX_DISPLAY_NAME_LENGTH,
  normalizeDisplayName,
} from "../utils/display-name";
import { normalizeFriendId } from "../utils/friend-id";
import type { User } from "./auth";
import { db } from "./database";

export type { User };

export const getUsers = async (): Promise<User[]> => {
  const results = await db`
    SELECT id, email, role, friend_id, display_name, created_at
    FROM users
    ORDER BY created_at DESC
  `;
  return results as User[];
};

// Remember the friend ID a signed-in user put on a list so it prefills the next
// one they build. Only a valid 16-digit ID is stored — leaving it off a single
// list shouldn't wipe the one saved on the account. Returns the stored digits,
// or null if there was nothing worth saving.
export const saveUserFriendId = async (
  userId: string,
  rawFriendId: string | null | undefined,
): Promise<string | null> => {
  const friendId = normalizeFriendId(rawFriendId);
  if (!friendId) return null;

  await db`
    UPDATE users SET friend_id = ${friendId} WHERE id = ${userId}
  `;
  return friendId;
};

// The name shown on this user's shared lists. Unlike the friend ID, a blank is
// meaningful here: the account form is an explicit edit, so clearing the field
// removes the name. Callers that have a form to talk back to should run
// validateDisplayName first for the message; the clamp here is what guarantees
// an over-long name can never reach the column. Returns what was stored.
export const saveUserDisplayName = async (
  userId: string,
  rawName: string | null | undefined,
): Promise<string | null> => {
  const normalized = normalizeDisplayName(rawName);
  const displayName = normalized
    ? [...normalized].slice(0, MAX_DISPLAY_NAME_LENGTH).join("")
    : null;

  await db`
    UPDATE users SET display_name = ${displayName} WHERE id = ${userId}
  `;
  return displayName;
};

// The account form's counterpart to saveUserFriendId: there a missing ID means
// "this list didn't carry one", here it means "remove the one I stored", so the
// caller passes exactly what should end up on the row.
export const setUserFriendId = async (
  userId: string,
  friendId: string | null,
): Promise<void> => {
  await db`
    UPDATE users SET friend_id = ${friendId} WHERE id = ${userId}
  `;
};

// Same, but only fills a blank. Claiming anonymous lists at login carries their
// friend ID onto the account, and a list built months ago shouldn't overwrite an
// ID the user has since set on purpose. The guard lives in the WHERE clause so
// there's no read-then-write race.
export const backfillUserFriendId = async (
  userId: string,
  rawFriendId: string | null | undefined,
): Promise<string | null> => {
  const friendId = normalizeFriendId(rawFriendId);
  if (!friendId) return null;

  await db`
    UPDATE users SET friend_id = ${friendId}
    WHERE id = ${userId} AND friend_id IS NULL
  `;
  return friendId;
};
