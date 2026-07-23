import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SessionContext } from "../../middleware/auth";
import type { CreateFeedbackResult } from "../../services/feedback";
import type { User } from "../../services/users";
import { createBunRequest } from "../../test-utils/bun-request";

// View controller test (see CLAUDE.md): mock the service layer, assert on the
// rendered HTML and on the Response (status / Location).

const guestContext: SessionContext = {
  sessionId: "guest-session",
  sessionHash: null,
  sessionType: "guest",
  user: null,
  isGuest: true,
  isAuthenticated: false,
  requiresSetCookie: false,
};

const testUser: User = {
  id: "user-1",
  email: "user@example.com",
} as User;

const authContext: SessionContext = {
  ...guestContext,
  sessionType: "authenticated",
  user: testUser,
  isGuest: false,
  isAuthenticated: true,
};

let mockContext: SessionContext = guestContext;
let mockCreateResult: CreateFeedbackResult = {
  ok: true,
  feedback: {
    id: "fb-1",
    userId: null,
    sessionId: "guest-session",
    message: "Great app",
    email: "guest@example.com",
    pageUrl: "http://localhost:3000/",
    userAgent: "test-agent",
    createdAt: new Date(),
  },
};
let mockCsrfResponse: Response | null = null;
let createFeedbackCalls: unknown[] = [];
let sendFeedbackCalls: unknown[] = [];
let sendShouldThrow = false;

mock.module("../../middleware/auth", () => ({
  getSessionContext: async () => mockContext,
}));
mock.module("../../services/sessions", () => ({
  setSessionCookie: () => {},
}));
mock.module("../../services/csrf", () => ({
  createCsrfToken: async () => "test-csrf-token",
}));
mock.module("../../middleware/csrf", () => ({
  csrfProtection: async () => mockCsrfResponse,
}));
mock.module("../../middleware/rate-limit", () => ({
  rateLimit: () => null,
}));
mock.module("../../services/feedback", () => ({
  createFeedback: async (input: unknown) => {
    createFeedbackCalls.push(input);
    return mockCreateResult;
  },
}));
mock.module("../../services/email", () => ({
  getEmailService: () => ({
    sendFeedbackNotification: async (data: unknown) => {
      sendFeedbackCalls.push(data);
      if (sendShouldThrow) throw new Error("mail down");
    },
  }),
}));

import { feedback } from "./feedback";

const post = (body: Record<string, string>) => {
  const params = new URLSearchParams(body);
  return createBunRequest("http://localhost:3000/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "test-agent",
    },
    body: params.toString(),
  });
};

describe("feedback.index", () => {
  beforeEach(() => {
    mockContext = guestContext;
  });
  afterAll(() => mock.restore());

  test("renders the form with a CSRF field for a guest, including the email field", async () => {
    const req = createBunRequest("http://localhost:3000/feedback", {
      headers: { referer: "http://localhost:3000/l/abcdefghijk" },
    });
    const res = await feedback.index(req);
    const html = await res.text();

    expect(res.headers.get("content-type")).toBe("text/html");
    expect(html).toContain('name="_csrf"');
    expect(html).toContain("test-csrf-token");
    expect(html).toContain('name="message"');
    // Guest sees the optional email field.
    expect(html).toContain('name="email"');
    // Same-origin referer is captured into the hidden page_url field.
    expect(html).toContain("http://localhost:3000/l/abcdefghijk");
  });

  test("omits the email field for a logged-in user", async () => {
    mockContext = authContext;
    const req = createBunRequest("http://localhost:3000/feedback");
    const html = await (await feedback.index(req)).text();
    expect(html).toContain('name="message"');
    expect(html).not.toContain('name="email"');
  });

  test("ignores a cross-origin referer", async () => {
    const req = createBunRequest("http://localhost:3000/feedback", {
      headers: { referer: "https://evil.example.com/phish" },
    });
    const html = await (await feedback.index(req)).text();
    expect(html).not.toContain("evil.example.com");
  });
});

describe("feedback.submit", () => {
  beforeEach(() => {
    mockContext = guestContext;
    mockCsrfResponse = null;
    sendShouldThrow = false;
    createFeedbackCalls = [];
    sendFeedbackCalls = [];
    mockCreateResult = {
      ok: true,
      feedback: {
        id: "fb-1",
        userId: null,
        sessionId: "guest-session",
        message: "Great app",
        email: "guest@example.com",
        pageUrl: "http://localhost:3000/",
        userAgent: "test-agent",
        createdAt: new Date(),
      },
    };
  });
  afterAll(() => mock.restore());

  test("saves feedback, sends the notification, and redirects", async () => {
    const req = post({
      message: "Great app",
      email: "guest@example.com",
      page_url: "http://localhost:3000/",
      _csrf: "test-csrf-token",
    });
    const res = await feedback.submit(req);

    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/feedback");
    expect(createFeedbackCalls).toHaveLength(1);
    expect(sendFeedbackCalls).toHaveLength(1);
  });

  test("still succeeds when the notification email fails", async () => {
    sendShouldThrow = true;
    const req = post({ message: "Great app", _csrf: "test-csrf-token" });
    const res = await feedback.submit(req);

    // Feedback was saved; a mail failure must not surface as an error.
    expect(createFeedbackCalls).toHaveLength(1);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/feedback");
  });

  test("returns the CSRF failure response and never touches the service", async () => {
    mockCsrfResponse = new Response("Invalid CSRF token", { status: 403 });
    const req = post({ message: "Great app" });
    const res = await feedback.submit(req);

    expect(res.status).toBe(403);
    expect(createFeedbackCalls).toHaveLength(0);
  });

  test("redirects back on a validation error and sends no email", async () => {
    mockCreateResult = { ok: false, error: "Add a message before sending." };
    const req = post({ message: "  ", _csrf: "test-csrf-token" });
    const res = await feedback.submit(req);

    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/feedback");
    expect(sendFeedbackCalls).toHaveLength(0);
  });
});
