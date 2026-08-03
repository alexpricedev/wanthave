import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  setSystemTime,
  test,
} from "bun:test";
import { SQL } from "bun";
import { cleanupTestData } from "../test-utils/helpers";
import { findOrCreateUser } from "./auth";
import {
  CSRF_GRACE_WINDOWS,
  createCsrfToken,
  ensureCsrfSecret,
  inspectCsrfToken,
  TIME_WINDOW_MINUTES,
  validateOrigin,
  verifyCsrfToken,
} from "./csrf";
import { db } from "./database";
import { createAuthenticatedSession } from "./sessions";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for tests");
}
const connection = new SQL(process.env.DATABASE_URL);

mock.module("./database", () => ({
  get db() {
    return connection;
  },
}));

describe("CSRF Service", () => {
  beforeEach(async () => {
    await cleanupTestData(db);
  });

  afterAll(async () => {
    await connection.end();
    mock.restore();
  });
  const createTestSession = async (
    email = `test-${Date.now()}-${Math.random()}@example.com`,
  ) => {
    const user = await findOrCreateUser(email);
    return createAuthenticatedSession(user.id);
  };

  describe("ensureCsrfSecret", () => {
    test("generates new secret for new session", async () => {
      const sessionId = await createTestSession();

      const secret = await ensureCsrfSecret(sessionId);

      expect(secret).toBeTruthy();
      expect(secret.length).toBeGreaterThan(20);
    });

    test("returns existing secret for session with secret", async () => {
      const sessionId = await createTestSession();

      const secret1 = await ensureCsrfSecret(sessionId);
      const secret2 = await ensureCsrfSecret(sessionId);

      expect(secret1).toBe(secret2);
    });

    test("returns empty string for non-existent session", async () => {
      const fakeSessionId = "non-existent-session";

      const secret = await ensureCsrfSecret(fakeSessionId);

      expect(secret).toBe("");
    });

    test("returns empty string when session exists but UPDATE fails", async () => {
      const sessionId = await createTestSession();

      // Delete the session to simulate a race condition
      const { computeHMAC } = await import("../utils/crypto");
      const sessionIdHash = computeHMAC(sessionId);
      await import("./database").then(
        ({ db }) => db`DELETE FROM sessions WHERE id_hash = ${sessionIdHash}`,
      );

      const secret = await ensureCsrfSecret(sessionId);

      expect(secret).toBe("");
    });

    test("handles concurrent secret generation race condition", async () => {
      const sessionId = await createTestSession();

      // Simulate concurrent calls to ensureCsrfSecret
      const promise1 = ensureCsrfSecret(sessionId);
      const promise2 = ensureCsrfSecret(sessionId);
      const promise3 = ensureCsrfSecret(sessionId);

      const [secret1, secret2, secret3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);

      // All should return the same secret (first writer wins)
      expect(secret1).toBeTruthy();
      expect(secret2).toBeTruthy();
      expect(secret3).toBeTruthy();
      expect(secret1).toBe(secret2);
      expect(secret2).toBe(secret3);

      // Verify the secret is actually stored in database
      const { computeHMAC } = await import("../utils/crypto");
      const sessionIdHash = computeHMAC(sessionId);
      const { db } = await import("./database");
      const dbResult = await db`
        SELECT csrf_secret FROM sessions WHERE id_hash = ${sessionIdHash}
      `;

      expect(dbResult.length).toBe(1);
      expect(dbResult[0].csrf_secret).toBe(secret1);
    });

    test("tokens from concurrent requests remain valid", async () => {
      const sessionId = await createTestSession();

      // Generate tokens concurrently (this will trigger concurrent ensureCsrfSecret calls)
      const tokenPromises = [
        createCsrfToken(sessionId, "POST", "/test1"),
        createCsrfToken(sessionId, "POST", "/test2"),
        createCsrfToken(sessionId, "POST", "/test3"),
      ];

      const [token1, token2, token3] = await Promise.all(tokenPromises);

      // All tokens should be valid
      expect(token1).toBeTruthy();
      expect(token2).toBeTruthy();
      expect(token3).toBeTruthy();

      // Verify all tokens are valid for their respective paths
      const [valid1, valid2, valid3] = await Promise.all([
        verifyCsrfToken(sessionId, "POST", "/test1", token1),
        verifyCsrfToken(sessionId, "POST", "/test2", token2),
        verifyCsrfToken(sessionId, "POST", "/test3", token3),
      ]);

      expect(valid1).toBe(true);
      expect(valid2).toBe(true);
      expect(valid3).toBe(true);
    });
  });

  describe("createCsrfToken and verifyCsrfToken", () => {
    test("creates and verifies valid token", async () => {
      const sessionId = await createTestSession();
      const method = "POST";
      const path = "/examples";

      const token = await createCsrfToken(sessionId, method, path);
      const isValid = await verifyCsrfToken(sessionId, method, path, token);

      expect(token).toBeTruthy();
      expect(token).toContain(".");
      expect(isValid).toBe(true);
    });

    test("rejects token with wrong method", async () => {
      const sessionId = await createTestSession();
      const method = "POST";
      const path = "/examples";

      const token = await createCsrfToken(sessionId, method, path);
      const isValid = await verifyCsrfToken(sessionId, "PUT", path, token);

      expect(isValid).toBe(false);
    });

    test("rejects token with wrong path", async () => {
      const sessionId = await createTestSession();
      const method = "POST";
      const path = "/examples";

      const token = await createCsrfToken(sessionId, method, path);
      const isValid = await verifyCsrfToken(sessionId, method, "/other", token);

      expect(isValid).toBe(false);
    });

    test("rejects token with wrong session", async () => {
      const sessionId1 = await createTestSession();
      const sessionId2 = await createTestSession();
      const method = "POST";
      const path = "/examples";

      const token = await createCsrfToken(sessionId1, method, path);
      const isValid = await verifyCsrfToken(sessionId2, method, path, token);

      expect(isValid).toBe(false);
    });

    test("rejects malformed token", async () => {
      const sessionId = await createTestSession();
      const method = "POST";
      const path = "/examples";

      const isValid1 = await verifyCsrfToken(
        sessionId,
        method,
        path,
        "invalid",
      );
      const isValid2 = await verifyCsrfToken(
        sessionId,
        method,
        path,
        "too.many.parts.here",
      );
      const isValid3 = await verifyCsrfToken(sessionId, method, path, "");

      expect(isValid1).toBe(false);
      expect(isValid2).toBe(false);
      expect(isValid3).toBe(false);
    });

    test("rejects token for non-existent session", async () => {
      const fakeSessionId = "non-existent-session";
      const method = "POST";
      const path = "/examples";

      const isValid = await verifyCsrfToken(
        fakeSessionId,
        method,
        path,
        "fake.token",
      );

      expect(isValid).toBe(false);
    });

    test("tokens are method case insensitive", async () => {
      const sessionId = await createTestSession();
      const path = "/examples";

      const token = await createCsrfToken(sessionId, "post", path);
      const isValid = await verifyCsrfToken(sessionId, "POST", path, token);

      expect(isValid).toBe(true);
    });

    test("path normalization - token valid for same path with query params", async () => {
      const sessionId = await createTestSession();
      const basePath = "/examples";
      const pathWithQuery = "/examples?x=1&y=2";

      // Create token for base path
      const token = await createCsrfToken(sessionId, "POST", basePath);

      // Should be valid for path with query params
      const isValid = await verifyCsrfToken(
        sessionId,
        "POST",
        pathWithQuery,
        token,
      );

      expect(isValid).toBe(true);
    });

    test("path normalization - token valid for same path with fragments", async () => {
      const sessionId = await createTestSession();
      const basePath = "/examples";
      const pathWithFragment = "/examples#section";

      // Create token for base path
      const token = await createCsrfToken(sessionId, "POST", basePath);

      // Should be valid for path with fragment
      const isValid = await verifyCsrfToken(
        sessionId,
        "POST",
        pathWithFragment,
        token,
      );

      expect(isValid).toBe(true);
    });

    test("createCsrfToken throws error for non-existent session", async () => {
      const fakeSessionId = "non-existent-session";

      await expect(
        createCsrfToken(fakeSessionId, "POST", "/test"),
      ).rejects.toThrow("Cannot create CSRF token: session not found");
    });
  });

  describe("inspectCsrfToken", () => {
    // Aligned to a bucket boundary so an offset of N windows lands exactly N
    // buckets back — no boundary flakiness.
    const BASE = new Date("2026-01-01T12:00:00.000Z");
    const WINDOW_MS = TIME_WINDOW_MINUTES * 60 * 1000;

    // Mint a token as though the page had rendered `windowsAgo` buckets back,
    // then hand the clock back to BASE for the verification.
    const tokenFrom = async (
      sessionId: string,
      windowsAgo: number,
    ): Promise<string> => {
      setSystemTime(new Date(BASE.getTime() - windowsAgo * WINDOW_MS));
      const token = await createCsrfToken(sessionId, "POST", "/api/lists");
      setSystemTime(BASE);
      return token;
    };

    const inspect = (sessionId: string, token: string) =>
      inspectCsrfToken(sessionId, "POST", "/api/lists", token);

    // Sessions are written with a real-clock expiry, so hand the clock back
    // before each test creates one.
    beforeEach(() => {
      setSystemTime();
    });

    afterAll(() => {
      setSystemTime();
    });

    test("accepts the current and previous bucket as valid", async () => {
      const sessionId = await createTestSession();

      expect(await inspect(sessionId, await tokenFrom(sessionId, 0))).toBe(
        "valid",
      );
      expect(await inspect(sessionId, await tokenFrom(sessionId, 1))).toBe(
        "valid",
      );
    });

    test("reports an older but authentic token as expired", async () => {
      const sessionId = await createTestSession();

      expect(await inspect(sessionId, await tokenFrom(sessionId, 2))).toBe(
        "expired",
      );
      expect(
        await inspect(
          sessionId,
          await tokenFrom(sessionId, 1 + CSRF_GRACE_WINDOWS),
        ),
      ).toBe("expired");
    });

    test("a token past the grace range is invalid, not expired", async () => {
      const sessionId = await createTestSession();

      expect(
        await inspect(
          sessionId,
          await tokenFrom(sessionId, 2 + CSRF_GRACE_WINDOWS),
        ),
      ).toBe("invalid");
    });

    test("an expired token is never accepted for the action itself", async () => {
      const sessionId = await createTestSession();
      const stale = await tokenFrom(sessionId, 3);

      expect(
        await verifyCsrfToken(sessionId, "POST", "/api/lists", stale),
      ).toBe(false);
    });

    test("a stale token for a different path is invalid", async () => {
      const sessionId = await createTestSession();
      const stale = await tokenFrom(sessionId, 3);

      expect(
        await inspectCsrfToken(sessionId, "POST", "/api/other", stale),
      ).toBe("invalid");
    });

    test("a forged token is invalid", async () => {
      const sessionId = await createTestSession();
      await tokenFrom(sessionId, 0); // establish the session's secret

      expect(await inspect(sessionId, "nonce.forged")).toBe("invalid");
      expect(await inspect(sessionId, "no-dot-here")).toBe("invalid");
    });

    test("a token against a dead session is session-expired", async () => {
      const sessionId = await createTestSession();
      const token = await tokenFrom(sessionId, 0);
      await cleanupTestData(db);

      expect(await inspect(sessionId, token)).toBe("session-expired");
    });

    test("several stale tabs can't lock a user out of recovery", async () => {
      const sessionId = await createTestSession();
      const stale = await tokenFrom(sessionId, 3);

      // Well past MAX_FAILURES_PER_WINDOW — expired hits must not feed the
      // failure brake, or the recovery path would close on the honest user.
      for (let i = 0; i < 11; i++) {
        expect(await inspect(sessionId, stale)).toBe("expired");
      }

      // And a fresh token still works afterwards.
      expect(await inspect(sessionId, await tokenFrom(sessionId, 0))).toBe(
        "valid",
      );
    });

    test("replay of a captured stale token is still bounded", async () => {
      const sessionId = await createTestSession();
      const stale = await tokenFrom(sessionId, 3);

      for (let i = 0; i < 60; i++) {
        expect(await inspect(sessionId, stale)).toBe("expired");
      }

      expect(await inspect(sessionId, stale)).toBe("invalid");
    });
  });

  describe("validateOrigin", () => {
    test("accepts matching Origin header", () => {
      const req = new Request("http://example.com/test", {
        headers: { Origin: "http://example.com" },
      });

      const isValid = validateOrigin(req, "http://example.com");

      expect(isValid).toBe(true);
    });

    test("accepts matching Referer header when no Origin", () => {
      const req = new Request("http://example.com/test", {
        headers: { Referer: "http://example.com/page" },
      });

      const isValid = validateOrigin(req, "http://example.com");

      expect(isValid).toBe(true);
    });

    test("rejects mismatched Origin", () => {
      const req = new Request("http://example.com/test", {
        headers: { Origin: "http://evil.com" },
      });

      const isValid = validateOrigin(req, "http://example.com");

      expect(isValid).toBe(false);
    });

    test("rejects mismatched Referer", () => {
      const req = new Request("http://example.com/test", {
        headers: { Referer: "http://evil.com/page" },
      });

      const isValid = validateOrigin(req, "http://example.com");

      expect(isValid).toBe(false);
    });

    test("rejects request with no Origin or Referer", () => {
      const req = new Request("http://example.com/test");

      const isValid = validateOrigin(req, "http://example.com");

      expect(isValid).toBe(false);
    });

    test("uses APP_URL env var when no expected origin provided", () => {
      const originalAppUrl = process.env.APP_URL;
      process.env.APP_URL = "http://test.com";

      const req = new Request("http://example.com/test", {
        headers: { Origin: "http://test.com" },
      });

      const isValid = validateOrigin(req);

      expect(isValid).toBe(true);

      process.env.APP_URL = originalAppUrl;
    });
  });
});
