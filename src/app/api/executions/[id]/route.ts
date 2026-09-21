import { getCurrentUserId } from "@/lib/auth/session";
import { getExecutionForUser, toExecutionSummary } from "@/lib/agent/execution";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getCurrentUserId();

  const row = await getExecutionForUser(id, userId);
  if (!row) {
    return Response.json(
      { error: "not_found", message: "No such run." },
      { status: 404 },
    );
  }

  return Response.json({
    ...toExecutionSummary(row),
    // The trace is the reason this route exists; the list omits it on purpose.
    steps: row.execution.stepsJson,
    output: row.execution.outputPayload,
  });
}
