/**
 * Trade lists — the core product artifact.
 *
 * A trade_list is one shareable link: a set of want/have cards, an optional
 * friend ID, and a lazily-rendered OG image. Anonymous lists carry an
 * expires_at (90 days) and no user_id; account-owned lists have a user_id and
 * a null expires_at (they never expire). users.friend_id remembers the owner's
 * code so it can prefill future lists.
 */
import type { SQL } from "bun";

export const up = async (db: SQL): Promise<void> => {
  await db`ALTER TABLE users ADD COLUMN friend_id VARCHAR(16)`;

  await db`
    CREATE TABLE trade_list (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      friend_id VARCHAR(16),
      og_image BYTEA,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMPTZ
    )
  `;

  await db`
    CREATE TABLE trade_list_card (
      id SERIAL PRIMARY KEY,
      list_id UUID NOT NULL REFERENCES trade_list(id) ON DELETE CASCADE,
      card_id TEXT NOT NULL,
      kind VARCHAR(4) NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      position INT NOT NULL DEFAULT 0,
      UNIQUE (list_id, card_id)
    )
  `;

  await db`CREATE INDEX idx_trade_list_user ON trade_list(user_id)`;
  await db`CREATE INDEX idx_trade_list_expires ON trade_list(expires_at)`;
  await db`CREATE INDEX idx_trade_list_card_list ON trade_list_card(list_id)`;
};

export const down = async (db: SQL): Promise<void> => {
  await db`DROP TABLE IF EXISTS trade_list_card`;
  await db`DROP TABLE IF EXISTS trade_list`;
  await db`ALTER TABLE users DROP COLUMN IF EXISTS friend_id`;
};
