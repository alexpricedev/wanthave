import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { SQL } from "bun";
import { cleanupTestData } from "../test-utils/helpers";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for tests");
}
const connection = new SQL(process.env.DATABASE_URL);

mock.module("./database", () => ({
  get db() {
    return connection;
  },
}));

import { db } from "./database";
import { getUsers, saveUserFriendId } from "./users";

const createUser = async (email: string): Promise<string> => {
  const id = randomUUID();
  await db`INSERT INTO users (id, email) VALUES (${id}, ${email})`;
  return id;
};

const friendIdOf = async (id: string): Promise<string | null> => {
  const rows = (await db`SELECT friend_id FROM users WHERE id = ${id}`) as {
    friend_id: string | null;
  }[];
  return rows[0].friend_id;
};

beforeEach(async () => {
  await cleanupTestData(db);
});

afterAll(async () => {
  await connection.end();
  mock.restore();
});

describe("Users Service", () => {
  test("returns empty array when no users exist", async () => {
    const result = await getUsers();
    expect(result).toEqual([]);
  });

  test("returns all users with expected fields", async () => {
    const userId1 = randomUUID();
    const userId2 = randomUUID();
    await db`INSERT INTO users (id, email, role) VALUES (${userId1}, 'alice@test.com', 'admin')`;
    await db`INSERT INTO users (id, email, role) VALUES (${userId2}, 'bob@test.com', 'user')`;

    const result = await getUsers();

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("email");
    expect(result[0]).toHaveProperty("role");
    expect(result[0]).toHaveProperty("created_at");
  });

  test("returns users ordered by created_at descending (newest first)", async () => {
    const userId1 = randomUUID();
    const userId2 = randomUUID();
    await db`INSERT INTO users (id, email, role, created_at) VALUES (${userId1}, 'first@test.com', 'user', '2026-01-01')`;
    await db`INSERT INTO users (id, email, role, created_at) VALUES (${userId2}, 'second@test.com', 'admin', '2026-03-01')`;

    const result = await getUsers();

    expect(result[0].email).toBe("second@test.com");
    expect(result[1].email).toBe("first@test.com");
  });
});

describe("saveUserFriendId", () => {
  test("stores the bare digits of a valid friend ID", async () => {
    const userId = await createUser("prefill@test.com");

    const saved = await saveUserFriendId(userId, "1234 5678 9012 3456");

    expect(saved).toBe("1234567890123456");
    expect(await friendIdOf(userId)).toBe("1234567890123456");
  });

  test("keeps the saved ID when a list omits one", async () => {
    const userId = await createUser("keep@test.com");
    await saveUserFriendId(userId, "1234567890123456");

    expect(await saveUserFriendId(userId, "")).toBeNull();
    expect(await saveUserFriendId(userId, null)).toBeNull();

    expect(await friendIdOf(userId)).toBe("1234567890123456");
  });

  test("ignores an ID that isn't 16 digits", async () => {
    const userId = await createUser("invalid@test.com");

    expect(await saveUserFriendId(userId, "12345")).toBeNull();
    expect(await friendIdOf(userId)).toBeNull();
  });

  test("overwrites a previously saved ID", async () => {
    const userId = await createUser("update@test.com");
    await saveUserFriendId(userId, "1111222233334444");

    await saveUserFriendId(userId, "5555666677778888");

    expect(await friendIdOf(userId)).toBe("5555666677778888");
  });
});
