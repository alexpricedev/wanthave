import { db } from "./database";

// Guardrail so a single submission can't be used to flood storage / the email
// notification. Roughly a few paragraphs of prose.
export const MAX_MESSAGE_LENGTH = 4000;

export interface FeedbackRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  message: string;
  email: string | null;
  page_url: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Feedback {
  id: string;
  userId: string | null;
  sessionId: string | null;
  message: string;
  email: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface CreateFeedbackInput {
  userId: string | null;
  sessionId: string | null;
  message: string;
  email: string | null;
  pageUrl: string | null;
  userAgent: string | null;
}

export type CreateFeedbackResult =
  | { ok: true; feedback: Feedback }
  | { ok: false; error: string };

const hydrate = (row: FeedbackRow): Feedback => ({
  id: row.id,
  userId: row.user_id,
  sessionId: row.session_id,
  message: row.message,
  email: row.email,
  pageUrl: row.page_url,
  userAgent: row.user_agent,
  createdAt: new Date(row.created_at),
});

const clean = (value: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const createFeedback = async (
  input: CreateFeedbackInput,
): Promise<CreateFeedbackResult> => {
  const message = input.message.trim();
  if (message.length === 0) {
    return { ok: false, error: "Add a message before sending." };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Keep it under ${MAX_MESSAGE_LENGTH} characters.`,
    };
  }

  const [row] = (await db`
    INSERT INTO feedback (user_id, session_id, message, email, page_url, user_agent)
    VALUES (
      ${input.userId},
      ${input.sessionId},
      ${message},
      ${clean(input.email)},
      ${clean(input.pageUrl)},
      ${clean(input.userAgent)}
    )
    RETURNING id, user_id, session_id, message, email, page_url, user_agent, created_at
  `) as FeedbackRow[];

  return { ok: true, feedback: hydrate(row) };
};
