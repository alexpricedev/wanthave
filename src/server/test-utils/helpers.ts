import type { SQL } from "bun";

/**
 * Clean up test data between tests
 * Truncates all tables to provide test isolation
 *
 * @param db - The database connection to use (should be the mocked testDb from each test file)
 */
export const cleanupTestData = async (db: SQL): Promise<void> => {
  // trade_list is truncated explicitly: truncating users only cascades to
  // account-owned lists, not anonymous ones (user_id NULL).
  await db`TRUNCATE TABLE trade_list CASCADE`;
  // feedback FKs users with ON DELETE SET NULL, so truncating users won't clear
  // it — truncate explicitly for isolation.
  await db`TRUNCATE TABLE feedback CASCADE`;
  // event has no FKs to lists or sessions on purpose (analytics rows outlive
  // their subject), so nothing cascades into it — truncate explicitly.
  await db`TRUNCATE TABLE event CASCADE`;
  await db`TRUNCATE TABLE user_tokens CASCADE`;
  await db`TRUNCATE TABLE sessions CASCADE`;
  await db`TRUNCATE TABLE users CASCADE`;
};

/**
 * Generate a random email address for testing
 * Uses timestamp and random string to ensure uniqueness
 *
 * @param domain - Optional domain, defaults to "example.com"
 * @returns A unique email address for testing
 */
export const randomEmail = (domain = "example.com"): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `test-${timestamp}-${random}@${domain}`;
};
