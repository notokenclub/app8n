import { desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { executionLogs, workflows } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Newest runs first, with the workflow they belong to. */
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  const limit = Math.min(
    Number(request.nextUrl.searchParams.get("limit") ?? 30) || 30,
    100,
  );

  const rows = await db
    .select({
      id: executionLogs.id,
      status: executionLogs.status,
      trigger: executionLogs.trigger,
      workflowId: executionLogs.workflowId,
      workflowTitle: workflows.title,
      error: executionLogs.errorTrace,
      durationMs: executionLogs.durationMs,
      startedAt: executionLogs.startedAt,
      finishedAt: executionLogs.finishedAt,
      steps: executionLogs.stepsJson,
    })
    .from(executionLogs)
    .leftJoin(workflows, eq(executionLogs.workflowId, workflows.id))
    .where(eq(executionLogs.userId, userId))
    .orderBy(desc(executionLogs.startedAt))
    .limit(limit);

  return NextResponse.json({
    executions: rows.map((row) => ({
      id: row.id,
      status: row.status,
      trigger: row.trigger,
      workflowId: row.workflowId,
      workflowTitle: row.workflowTitle,
      error: row.error,
      durationMs: row.durationMs,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      // The list carries the trace already: a run has a handful of steps, and
      // a second round trip per row to expand one is not worth saving bytes
      // on a local backend.
      steps: row.steps ?? [],
    })),
  });
}
