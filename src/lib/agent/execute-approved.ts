import { eq } from "drizzle-orm";
import type { LanguageModel, ModelMessage } from "ai";
import { db } from "@/lib/db";
import { executionLogs, type ApprovalRequest } from "@/lib/db/schema";
import type { GoogleContext } from "@/lib/google/credentials";
import { resolveAgentContext } from "./context";
import { isAgentConfiguredFor } from "./model";
import { runAgent } from "./orchestrator";
import { findTool } from "./tools";
import { finishExecution, recordSteps } from "./execution";

interface ParkedExecution {
  userId: string;
  trigger: "manual" | "chat" | "cron" | "webhook" | "gmail_poll";
  workflowId: string | null;
  messagesJson: unknown[] | null;
}

/**
 * Continues a run that halted on an approval gate.
 *
 * `messagesJson` is the conversation as of the moment the run parked, which is
 * the whole reason it is stored: a scheduled job can stop at 7am, wait for a
 * decision at lunchtime, and pick up its remaining steps from exactly where it
 * left off. Without this the approved call would fire and the rest of the plan
 * would be silently abandoned.
 *
 * The model is handed the tool *result*, never the parameters it proposed, so
 * what the human actually approved is what the rest of the run builds on. Any
 * further gated call it makes opens a new gate as usual.
 *
 * Returns true when it has taken responsibility for finishing the execution.
 */
async function resumeParkedRun(
  execution: ParkedExecution,
  approval: ApprovalRequest,
  output: unknown,
  model?: LanguageModel,
): Promise<boolean> {
  const parked = execution.messagesJson as ModelMessage[] | null;
  if (!parked?.length) return false;

  // Resuming needs the model. Without a key the approved action has still run,
  // so the execution is closed as the success it was rather than as a failure.
  if (!model && !(await isAgentConfiguredFor(execution.userId))) return false;

  const ctx = await resolveAgentContext(execution.userId);

  const messages: ModelMessage[] = [
    ...parked,
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: approval.toolCallId ?? approval.id,
          toolName: approval.actionName,
          output: { type: "json", value: output as never },
        },
      ],
    },
  ];

  await runAgent({
    model,
    userId: execution.userId,
    trigger: execution.trigger,
    workflowId: execution.workflowId ?? undefined,
    // The same row is reused, so the trace stays one continuous run rather
    // than splitting into a stub and an orphan.
    executionId: approval.executionId,
    messages,
    services: ctx.services,
    accountId: ctx.accountId,
    email: ctx.email,
  });

  return true;
}

export interface ApprovedActionResult {
  executed: boolean;
  output?: unknown;
  error?: string;
}

/**
 * Runs an action that a human approved. The model is not in this path at all:
 * the approved parameters go straight from the database to the connector, so a
 * later prompt injection cannot alter what was authorised.
 */
export async function executeApprovedAction(
  approval: ApprovalRequest,
  /** Overrides the model the resumed run uses. The runtime resolves the
   * user's own key; this exists so a test can drive resumption deterministically,
   * mirroring the same option on {@link runAgent}. */
  options: { model?: LanguageModel } = {},
): Promise<ApprovedActionResult> {
  if (approval.status !== "APPROVED") {
    return { executed: false, error: "Approval is not in an approved state." };
  }

  const toolDef = findTool(approval.actionName);
  if (!toolDef) {
    return { executed: false, error: `Unknown action ${approval.actionName}.` };
  }

  const execution = await db.query.executionLogs.findFirst({
    where: eq(executionLogs.id, approval.executionId),
    columns: {
      userId: true,
      trigger: true,
      workflowId: true,
      messagesJson: true,
    },
  });
  if (!execution) {
    return { executed: false, error: "Execution record is missing." };
  }

  const ctx: GoogleContext = { userId: execution.userId };
  const parameters =
    approval.resolvedParametersJson ?? approval.parametersJson;

  try {
    const output = await toolDef.execute(parameters, ctx);

    await recordSteps(approval.executionId, [
      {
        kind: "tool_result",
        toolName: approval.actionName,
        toolCallId: approval.toolCallId ?? approval.id,
        output,
        at: Date.now(),
      },
    ]);

    // A run that parked mid-plan has more to do than the one gated call, so
    // it is handed back its own conversation rather than being closed here.
    const resumed = await resumeParkedRun(
      execution,
      approval,
      output,
      options.model,
    );
    if (!resumed) {
      await finishExecution({
        executionId: approval.executionId,
        status: "success",
        output: { approvedAction: approval.actionName, result: output },
      });
    }

    return { executed: true, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordSteps(approval.executionId, [
      { kind: "error", message, at: Date.now() },
    ]);
    await finishExecution({
      executionId: approval.executionId,
      status: "failed",
      error: message,
    });

    return { executed: false, error: message };
  }
}

/** Marks a run closed after the user rejected its gated action. */
export async function cancelRejectedExecution(
  approval: ApprovalRequest,
): Promise<void> {
  await recordSteps(approval.executionId, [
    {
      kind: "error",
      message: `User rejected ${approval.actionName}.`,
      at: Date.now(),
    },
  ]);
  await finishExecution({
    executionId: approval.executionId,
    status: "cancelled",
    error: `User rejected ${approval.actionName}.`,
  });
}
