import type { SQL } from "bun";

export const up = async (db: SQL): Promise<void> => {
  await db`DROP TABLE IF EXISTS project`;
};

export const down = async (db: SQL): Promise<void> => {
  await db`
    CREATE TABLE project (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      created_by TEXT
    )
  `;
};
