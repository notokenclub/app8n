import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export const DATABASE_PATH = resolve(
  process.cwd(),
  process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./data/app8n.db",
);

function createClient() {
  mkdirSync(dirname(DATABASE_PATH), { recursive: true });
  const sqlite = new Database(DATABASE_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

// Next.js hot-reloads modules in dev; without this the process accumulates
// SQLite handles until it hits the open-file limit.
const globalForDb = globalThis as unknown as {
  app8nDb?: ReturnType<typeof createClient>;
};

export const db = globalForDb.app8nDb ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.app8nDb = db;
}

export { schema };
