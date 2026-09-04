import {
  ApprovalError,
  getApprovalForUser,
  resolveApproval,
} from "@/lib/agent/approvals";
import {
  cancelRejectedExecution,
  executeApprovedAction,
} from "@/lib/agent/execute-approved";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

interface ResolveBody {
  approved: boolean;
  /** Present when the user took the "Edit Parameters" path on the card. */
  parameters?: Record<string, unknown>;
  /** Skip running the action here; the chat client will resume it instead. */
  deferExecution?: boolean;
}

const ERROR_STATUS: Record<ApprovalError["code"], number> = {
  not_found: 404,
  already_resolved: 409,
  expired: 410,
  invalid_parameters: 422,
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getCurrentUserId();

  // Scope the lookup to the caller before touching state, so an approval id
  // cannot be used to probe or resolve another user's pending action.
  const owned = await getApprovalForUser(id, userId);
  if (!owned) {
    return Response.json(
      { error: "not_found", message: "No such approval request." },
      { status: 404 },
    );
  }

  const body = (await request.json()) as ResolveBody;
  if (typeof body.approved !== "boolean") {
    return Response.json(
      { error: "invalid_request", message: "approved must be a boolean." },
      { status: 400 },
    );
  }

  let resolved;
  try {
    resolved = await resolveApproval({
      approvalId: id,
      approved: body.approved,
      parameters: body.parameters,
    });
  } catch (error) {
    if (error instanceof ApprovalError) {
      return Response.json(
        { error: error.code, message: error.message },
        { status: ERROR_STATUS[error.code] },
      );
    }
    throw error;
  }

  if (!body.approved) {
    await cancelRejectedExecution(resolved);
    return Response.json({ status: "REJECTED", id: resolved.id });
  }

  if (body.deferExecution) {
    return Response.json({
      status: "APPROVED",
      id: resolved.id,
      toolCallId: resolved.toolCallId,
      parameters: resolved.resolvedParametersJson,
      executed: false,
    });
  }

  const result = await executeApprovedAction(resolved);

  return Response.json(
    {
      status: "APPROVED",
      id: resolved.id,
      toolCallId: resolved.toolCallId,
      executed: result.executed,
      output: result.output,
      error: result.error,
    },
    { status: result.executed ? 200 : 500 },
  );
}
