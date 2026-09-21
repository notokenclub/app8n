import { eq } from "drizzle-orm";
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
