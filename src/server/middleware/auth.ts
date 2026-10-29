import type { BunRequest } from "bun";
import {
  createGuestSession,
  getSessionContextFromDB,
  getSessionIdFromRequest,
  renewSession,
  type SessionContext,
} from "../services/sessions";

export type { SessionContext };

const EMPTY_CONTEXT: SessionContext = {
  sessionId: null,
  sessionHash: null,
  sessionType: null,
  user: null,
  isGuest: false,
  isAuthenticated: false,
  requiresSetCookie: false,
};

const createGuestContext = async (): Promise<SessionContext> => {
  try {
    const sessionId = await createGuestSession();
    return {
      sessionId,
      sessionHash: null,
      sessionType: "guest",
      user: null,
      isGuest: true,
      isAuthenticated: false,
      requiresSetCookie: true,
    };
  } catch {
    return EMPTY_CONTEXT;
  }
};

export const getSessionContext = async <R extends string>(
  req: BunRequest<R>,
): Promise<SessionContext> => {
  try {
    const sessionId = getSessionIdFromRequest(req);

    if (!sessionId) {
      return createGuestContext();
    }

    const ctx = await getSessionContextFromDB(sessionId);

    if (!ctx) {
      return createGuestContext();
    }

    if (ctx.isAuthenticated) {
      await renewSession(sessionId);
    }

    return ctx;
  } catch {
    return createGuestContext();
  }
};

export const requireAuth = async <R extends string>(
  req: BunRequest<R>,
): Promise<Response | null> => {
  const ctx = await getSessionContext(req);

  if (!ctx.isAuthenticated) {
    return new Response("", {
      status: 303,
      headers: { Location: "/login" },
    });
  }

  return null;
};

export const redirectIfAuthenticated = async <R extends string>(
  req: BunRequest<R>,
): Promise<Response | null> => {
  const ctx = await getSessionContext(req);

  if (ctx.isAuthenticated) {
    return new Response("", {
      status: 303,
      headers: { Location: "/" },
    });
  }

  return null;
};
