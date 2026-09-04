import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { executionLogs, type ApprovalRequest } from "@/lib/db/schema";
import type { GoogleContext } from "@/lib/google/credentials";
import { getTool } from "./tools";
import { finishExecution, recordSteps } from "./execution";

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
): Promise<ApprovedActionResult> {
  if (approval.status !== "APPROVED") {
    return { executed: false, error: "Approval is not in an approved state." };
  }

  const toolDef = getTool(approval.actionName);
  if (!toolDef) {
    return { executed: false, error: `Unknown action ${approval.actionName}.` };
  }

  const execution = await db.query.executionLogs.findFirst({
    where: eq(executionLogs.id, approval.executionId),
    columns: { userId: true },
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
    await finishExecution({
      executionId: approval.executionId,
      status: "success",
      output: { approvedAction: approval.actionName, result: output },
    });

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
