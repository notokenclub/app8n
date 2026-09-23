import type { NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  EXECUTIONS_PAGE_SIZE,
  listExecutions,
  toExecutionSummary,
} from "@/lib/agent/execution";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  const params = request.nextUrl.searchParams;

  const requested = Number(params.get("limit"));
  const limit =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, EXECUTIONS_PAGE_SIZE)
      : EXECUTIONS_PAGE_SIZE;

  const rows = await listExecutions(userId, {
    workflowId: params.get("workflowId") ?? undefined,
    limit,
  });

  return Response.json({ executions: rows.map(toExecutionSummary) });
}
