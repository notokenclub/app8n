import { expireStaleApprovals, listPendingApprovals } from "@/lib/agent/approvals";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  await expireStaleApprovals();

  const pending = await listPendingApprovals(userId);

  return Response.json({
    approvals: pending.map((a) => ({
      id: a.id,
      executionId: a.executionId,
      workflowId: a.workflowId,
      toolCallId: a.toolCallId,
      action: a.actionName,
      summary: a.summary,
      parameters: a.parametersJson,
      createdAt: a.createdAt,
      expiresAt: a.expiresAt,
    })),
  });
}
