/**
 * Standalone scheduler process: `npm run worker`.
 *
 * Runs beside `next start` rather than inside it. Keeping the two separate
 * means schedules keep firing when no one has the app open, and the backend can
 * be deployed somewhere the phone reaches over the network.
 */
import { startWorker, TICK_INTERVAL_MS } from "../src/lib/scheduler/worker";

function main() {
  if (process.loadEnvFile) {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      // No .env.local — fall back to the ambient environment.
    }
  }

  const stamp = () => new Date().toISOString();

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
    },
  });

  console.log(
    `[${stamp()}] app8n worker started, ticking every ${TICK_INTERVAL_MS / 1000}s`,
  );

  const shutdown = (signal: string) => {
    console.log(`[${stamp()}] ${signal} received, stopping worker`);
    handle.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
