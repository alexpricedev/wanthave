import { normalizeFriendId } from "../utils/friend-id";
import type { User } from "./auth";
import { db } from "./database";

export type { User };

export const getUsers = async (): Promise<User[]> => {
  const results = await db`
    SELECT id, email, role, friend_id, created_at
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
