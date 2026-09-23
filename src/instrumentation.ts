/**
 * Boot-time hook. Next calls this once per server process, before the first
 * request, which is the only place a misconfigured deployment can be caught
 * early enough to be useful.
 */
export async function register() {
  // Guarded so the edge runtime, which has no access to most of this, does not
  // evaluate it.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertEnvironment } = await import("@/lib/env");
  try {
    assertEnvironment();
  } catch (error) {
    // Throwing alone leaves Next running but unable to serve, which reads as a
    // hung container. Exiting non-zero is what an orchestrator understands.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // The schema has to exist before the first request. Drizzle skips anything
  // already applied, so this costs a few milliseconds on a warm database.
  const { runMigrations } = await import("@/lib/db/migrate");
  try {
    const result = runMigrations();
    if (result.applied) console.log("app8n: database schema is up to date");
  } catch (error) {
    // A server that cannot migrate cannot serve, so this is fatal in
    // production and merely loud in development.
    const message = error instanceof Error ? error.message : String(error);
    if (process.env.NODE_ENV === "production") {
      throw new Error(`app8n could not migrate the database: ${message}`);
    }
    console.warn(`app8n could not migrate the database: ${message}`);
  }
}
