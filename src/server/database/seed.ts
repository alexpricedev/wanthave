#!/usr/bin/env bun
import { db } from "../services/database";
import { log } from "../services/logger";

export const seedIfEmpty = async (): Promise<void> => {
  const [{ count: userCount }] =
    await db`SELECT count(*)::int AS count FROM users`;

  if (userCount > 0) return;

  log.info("seed", "Empty database detected — seeding an admin user");

  // A single admin so the /admin dashboard is reachable on a fresh install.
  // The card catalogue is static data loaded from JSON (see services/cards.ts),
  // so there's nothing else to seed — trade lists are created by users.
  await db`
    INSERT INTO users (email, role) VALUES
      ('admin@example.com', 'admin')
    ON CONFLICT (email) DO NOTHING
  `;

  log.info("seed", "Seeded admin user");
};

// Allow running directly via `bun run seed`
if (import.meta.main) {
  seedIfEmpty()
    .catch((error) => {
      console.error("Seeding failed:", error);
      process.exit(1);
    })
    .finally(() => {
      process.exit(0);
    });
}
