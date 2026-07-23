import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { SQL } from "bun";
import { cleanupTestData, randomEmail } from "../test-utils/helpers";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for tests");
}
const connection = new SQL(process.env.DATABASE_URL);

mock.module("./database", () => ({
  get db() {
    return connection;
  },
}));

import { findOrCreateUser } from "./auth";
import { createFeedback, MAX_MESSAGE_LENGTH } from "./feedback";

describe("createFeedback", () => {
  beforeEach(async () => {
    await cleanupTestData(connection);
  });

  test("stores a guest submission with a null user_id", async () => {
    const result = await createFeedback({
      userId: null,
      sessionId: "guest-session",
      message: "  Love the app!  ",
      email: "guest@example.com",
      pageUrl: "http://localhost:3000/",
      userAgent: "Mozilla/5.0",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feedback.userId).toBeNull();
    expect(result.feedback.sessionId).toBe("guest-session");
    // Message is trimmed.
    expect(result.feedback.message).toBe("Love the app!");
    expect(result.feedback.email).toBe("guest@example.com");
    expect(result.feedback.pageUrl).toBe("http://localhost:3000/");
    expect(result.feedback.createdAt).toBeInstanceOf(Date);
  });

  test("links to a user when a userId is given", async () => {
    const user = await findOrCreateUser(randomEmail());
    const result = await createFeedback({
      userId: user.id,
      sessionId: "auth-session",
      message: "Feature request",
      email: user.email,
      pageUrl: null,
      userAgent: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feedback.userId).toBe(user.id);
    // Empty optional fields normalize to null.
    expect(result.feedback.pageUrl).toBeNull();
    expect(result.feedback.userAgent).toBeNull();
  });

  test("normalizes blank optional fields to null", async () => {
    const result = await createFeedback({
      userId: null,
      sessionId: null,
      message: "hi",
      email: "   ",
      pageUrl: "",
      userAgent: "  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feedback.email).toBeNull();
    expect(result.feedback.pageUrl).toBeNull();
    expect(result.feedback.userAgent).toBeNull();
  });

  test("rejects an empty message", async () => {
    const result = await createFeedback({
      userId: null,
      sessionId: null,
      message: "   ",
      email: null,
      pageUrl: null,
      userAgent: null,
    });
    expect(result.ok).toBe(false);
  });

  test("rejects a message over the max length", async () => {
    const result = await createFeedback({
      userId: null,
      sessionId: null,
      message: "x".repeat(MAX_MESSAGE_LENGTH + 1),
      email: null,
      pageUrl: null,
      userAgent: null,
    });
    expect(result.ok).toBe(false);
  });
});

afterAll(async () => {
  await connection.end();
  mock.restore();
});
