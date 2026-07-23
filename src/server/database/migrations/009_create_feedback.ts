/**
 * Feedback — free-text notes from users (guests or account holders).
 *
 * One row per submission from the /feedback page. user_id is nullable so guests
 * can leave feedback (set null on account deletion, unlike trade_list which
 * cascades — we want to keep the message even if the account goes away). We also
 * capture the originating page URL and user-agent for triage, plus an optional
 * reply email for guests who leave one.
 */
import type { SQL } from "bun";

export const up = async (db: SQL): Promise<void> => {
  await db`
    CREATE TABLE feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      session_id TEXT,
      message TEXT NOT NULL,
      email TEXT,
      page_url TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await db`CREATE INDEX idx_feedback_created ON feedback(created_at DESC)`;
};

export const down = async (db: SQL): Promise<void> => {
  await db`DROP TABLE IF EXISTS feedback`;
};
