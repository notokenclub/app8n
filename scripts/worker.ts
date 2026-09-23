/**
 * Standalone scheduler process: `npm run worker`.
 *
 * Runs beside `next start` rather than inside it. Keeping the two separate
 * means schedules keep firing when no one has the app open, and the backend can
 * be deployed somewhere the phone reaches over the network.
 */
import { startWorker, TICK_INTERVAL_MS } from "../src/lib/scheduler/worker";
import { isNotifyConfigured, notifyApprovalRequired } from "../src/lib/notify";
import { runMigrations } from "../src/lib/db/migrate";

function main() {
  if (process.loadEnvFile) {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      // No .env.local — fall back to the ambient environment.
    }
  }

  const stamp = () => new Date().toISOString();

  // The worker can be the first process to reach an empty volume, so it
  // migrates too rather than failing on a missing table.
  try {
    runMigrations();
  } catch (error) {
    console.error(`[${stamp()}] could not migrate the database:`, error);
    process.exit(1);
  }

  const handle = startWorker({
    log: (message) => console.log(`[${stamp()}] ${message}`),
    onError: (error, workflow) => {
      const label = workflow ? `workflow ${workflow.title}` : "scheduler";
      console.error(`[${stamp()}] ${label} failed:`, error);
    },
    onApprovalRequired: (event) => {
      console.log(
        `[${stamp()}] awaiting approval: ${event.summary} (id ${event.approvalRequestId})`,
      );
      // A gate raised at 7am is only useful if it leaves the machine.
      void notifyApprovalRequired(event).then((sent) => {
        if (!sent && isNotifyConfigured()) {
          console.warn(`[${stamp()}] notification webhook did not accept the approval alert`);
        }
      });
    },
  });

  console.log(
    `[${stamp()}] app8n worker started, ticking every ${TICK_INTERVAL_MS / 1000}s`,
  );
  if (!isNotifyConfigured()) {
    console.log(
      `[${stamp()}] APP8N_NOTIFY_WEBHOOK_URL is not set — approval gates will only be visible in the app`,
    );
  }

  const shutdown = (signal: string) => {
    console.log(`[${stamp()}] ${signal} received, stopping worker`);
    handle.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
