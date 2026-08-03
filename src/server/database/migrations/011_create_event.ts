/**
 * Product analytics events.
 *
 * One append-only table behind three questions we currently cannot answer:
 * who actually visits (people vs crawlers, and from where), whether a list's
 * OG image ever gets unfurled and on which platform, and how many visits to
 * the builder end in a saved list.
 *
 * `session_hash` matches sessions.id_hash — the HMAC, never the raw cookie —
 * so events join to a session without this table becoming a place session
 * tokens leak from. No foreign key: sessions expire and lists get deleted, and
 * an analytics row outliving its subject is the point.
 *
 * `slug` is likewise a plain column rather than a trade_list FK, so deleting a
 * list doesn't erase the record of it having been shared.
 *
 * Everything else lives in `props` — this table should never need a migration
 * to record one more field about an event we already track.
 */
import type { SQL } from "bun";

export const up = async (db: SQL): Promise<void> => {
  await db`
    CREATE TABLE event (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      session_hash TEXT,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      slug TEXT,
      is_bot BOOLEAN NOT NULL DEFAULT FALSE,
      props JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Every question starts "for event X, over time window Y".
  await db`CREATE INDEX idx_event_name_created ON event(name, created_at DESC)`;

  // ...and almost every one of them then discards the bots, which are expected
  // to be the bulk of the rows. Partial index so the human-only reads stay cheap.
  await db`
    CREATE INDEX idx_event_human ON event(name, created_at DESC)
    WHERE is_bot = FALSE
  `;

  // Per-list reads: how often one list's OG was fetched, and by which platform.
  await db`CREATE INDEX idx_event_slug ON event(slug) WHERE slug IS NOT NULL`;
};

export const down = async (db: SQL): Promise<void> => {
  await db`DROP TABLE IF EXISTS event`;
};
