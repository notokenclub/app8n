import { Cron } from "croner";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflows, type Workflow } from "@/lib/db/schema";

/** Triggers the worker owns. `manual`, `chat` and `webhook` are request-driven. */
export const SCHEDULED_TRIGGERS = ["cron", "gmail_poll"] as const;

/** How often a gmail_poll workflow checks for new mail. */
export const GMAIL_POLL_INTERVAL_MS = 5 * 60 * 1000;

export async function loadScheduledWorkflows(): Promise<Workflow[]> {
  return db
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.status, "active"),
        inArray(workflows.triggerType, [...SCHEDULED_TRIGGERS]),
      ),
    );
}

export function isValidCron(expression: string): boolean {
  try {
    new Cron(expression).stop();
    return true;
  } catch {
    return false;
  }
}

export function nextRunAt(workflow: Workflow, from = new Date()): Date | null {
  if (workflow.triggerType === "gmail_poll") {
    const last = workflow.lastRunAt?.getTime() ?? 0;
    return new Date(Math.max(from.getTime(), last + GMAIL_POLL_INTERVAL_MS));
  }

  if (!workflow.cronExpression) return null;
  try {
    return new Cron(workflow.cronExpression).nextRun(from) ?? null;
  } catch {
    return null;
  }
}

/**
 * Workflows whose next run has come due. The worker asks for this on a fixed
 * tick rather than holding a timer per workflow, so schedule edits take effect
 * on the next tick and a restart cannot lose a job.
 */
export function selectDueWorkflows(
  candidates: Workflow[],
  now = new Date(),
): Workflow[] {
  return candidates.filter((workflow) => {
    if (workflow.triggerType === "gmail_poll") {
      const last = workflow.lastRunAt?.getTime() ?? 0;
      return now.getTime() - last >= GMAIL_POLL_INTERVAL_MS;
    }

    if (!workflow.cronExpression || !isValidCron(workflow.cronExpression)) {
      return false;
    }

    // Due when the schedule fired at some point between the last run and now.
    const cron = new Cron(workflow.cronExpression);
    const since = workflow.lastRunAt ?? workflow.createdAt;
    const fired = cron.nextRun(since);
    return fired !== null && fired.getTime() <= now.getTime();
  });
}

export async function markWorkflowRun(
  workflowId: string,
  at = new Date(),
): Promise<void> {
  await db
    .update(workflows)
    .set({ lastRunAt: at })
    .where(eq(workflows.id, workflowId));
}
