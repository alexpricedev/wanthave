/**
 * Claim tokens for anonymous lists.
 *
 * Anonymous lists are adopted into an account on the owner's next login. That
 * used to hang off a cookie holding one slug, so a guest who built several
 * lists kept only the newest and orphaned the rest. Each anonymous list now
 * records the HMAC of a per-device claim token instead, and logging in claims
 * every list carrying that token.
 *
 * Nulled out when the list is claimed — the token has no job once the list has
 * an owner. The index is partial for the same reason: only unclaimed rows are
 * ever looked up by token.
 */
import type { SQL } from "bun";

export const up = async (db: SQL): Promise<void> => {
  await db`ALTER TABLE trade_list ADD COLUMN claim_token_hash TEXT`;

  await db`
    CREATE INDEX idx_trade_list_claim ON trade_list(claim_token_hash)
    WHERE user_id IS NULL
  `;
};

export const down = async (db: SQL): Promise<void> => {
  await db`DROP INDEX IF EXISTS idx_trade_list_claim`;
  await db`ALTER TABLE trade_list DROP COLUMN IF EXISTS claim_token_hash`;
};
