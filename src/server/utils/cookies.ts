/**
 * Cookie names shared across modules that must agree on them but shouldn't
 * depend on each other. The session cookie's name lives here rather than in the
 * session service so read-only consumers — analytics, for one — can resolve it
 * without importing the module that mints and destroys sessions.
 */
export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME ?? "session_id";
