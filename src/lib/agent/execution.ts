import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  executionLogs,
  type ExecutionStatus,
  type ExecutionStep,
  type TriggerType,
} from "@/lib/db/schema";

export interface StartExecutionInput {
  userId: string;
  trigger: TriggerType;
  workflowId?: string;
  input?: unknown;
}

export async function startExecution(
  params: StartExecutionInput,
): Promise<string> {
  const [row] = await db
    .insert(executionLogs)
    .values({
      userId: params.userId,
      workflowId: params.workflowId ?? null,
      trigger: params.trigger,
      status: "running",
      inputPayload: params.input ?? null,
      startedAt: new Date(),
    })
    .returning({ id: executionLogs.id });

  return row.id;
}

/**
 * Appends to the step trace. Read-modify-write rather than a JSON patch because
 * SQLite is local and a single run is the only writer for its own row.
 */
export async function recordSteps(
  executionId: string,
  steps: ExecutionStep[],
): Promise<void> {
  if (!steps.length) return;

  const existing = await db.query.executionLogs.findFirst({
    where: eq(executionLogs.id, executionId),
    columns: { stepsJson: true },
  });

  await db
    .update(executionLogs)
    .set({ stepsJson: [...(existing?.stepsJson ?? []), ...steps] })
    .where(eq(executionLogs.id, executionId));
}

export interface FinishExecutionInput {
  executionId: string;
  status: ExecutionStatus;
  output?: unknown;
  error?: string;
  /** Conversation state, persisted so an approval-halted run can resume. */
  messages?: unknown[];
}

export async function finishExecution(
  params: FinishExecutionInput,
): Promise<void> {
  const existing = await db.query.executionLogs.findFirst({
    where: eq(executionLogs.id, params.executionId),
    columns: { startedAt: true },
  });

  const finishedAt = new Date();
  const startedAt = existing?.startedAt;

  await db
    .update(executionLogs)
    .set({
      status: params.status,
      outputPayload: params.output ?? null,
      errorTrace: params.error ?? null,
      messagesJson: params.messages ?? null,
      finishedAt,
      durationMs: startedAt
        ? finishedAt.getTime() - startedAt.getTime()
        : null,
    })
    .where(eq(executionLogs.id, params.executionId));
}

export async function getExecution(executionId: string) {
  return db.query.executionLogs.findFirst({
    where: eq(executionLogs.id, executionId),
  });
}

/**
 * How long a run may stay `running` before the scheduler calls it dead.
 *
 * A process killed mid-run cannot close its own row, so without this sweep a
 * crash leaves a run that claims to be in progress for ever — and a client
 * that polls it. Generous enough that a slow legitimate run is never caught:
 * the agent is capped at 12 steps.
 */
export const STALE_RUN_MS = 15 * 60 * 1000;

export async function failStaleExecutions(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_RUN_MS);

  const stale = await db
    .update(executionLogs)
    .set({
      status: "failed",
      errorTrace:
        "The run did not finish — the process that started it went away.",
      finishedAt: now,
    })
    .where(
      and(
        inArray(executionLogs.status, ["running"]),
        lt(executionLogs.startedAt, cutoff),
      ),
    )
    .returning({ id: executionLogs.id });

  return stale.length;
}
