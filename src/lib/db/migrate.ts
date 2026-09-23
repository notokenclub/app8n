import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index";

/**
 * Applies pending migrations at boot.
 *
 * A container starts with an empty volume, so something has to create the
 * schema before the first request; making that the app's own job means
 * `docker compose up` is the whole deployment procedure rather than a step
 * someone can forget. Drizzle records what it has applied, so this is a no-op
 * on every subsequent start.
 *
 * Set `APP8N_AUTO_MIGRATE=0` where migrations are run by a separate release
 * step, which is what you want once more than one instance can start at once.
 */
export function runMigrations(): { applied: boolean; reason?: string } {
  if (process.env.APP8N_AUTO_MIGRATE === "0") {
    return { applied: false, reason: "disabled" };
  }

  const folder = resolve(process.cwd(), "drizzle");
  if (!existsSync(folder)) {
    return { applied: false, reason: "no migrations folder" };
  }

  migrate(db, { migrationsFolder: folder });
  return { applied: true };
}
