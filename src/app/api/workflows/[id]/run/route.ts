import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { runWorkflow } from "@/lib/scheduler/worker";
import { notifyApprovalRequired } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Run a saved automation now.
 *
 * Same code path as the scheduler — `runWorkflow` — rather than a parallel
 * implementation, so "run now" cannot drift from what the cron tick does at
 * 7am. The run is awaited: these finish in seconds, and the caller wants to
 * know whether it worked rather than being told "started" and left to poll.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getCurrentUserId();

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
    .limit(1);

  if (!workflow) {
    return NextResponse.json(
      { error: "not_found", message: "No such workflow." },
      { status: 404 },
    );
  }

  if (workflow.status === "archived") {
    return NextResponse.json(
      {
        error: "invalid_state",
        message: "This automation is archived. Restore it before running it.",
      },
      { status: 409 },
    );
  }

  try {
    await runWorkflow(workflow, {
      onApprovalRequired: (event) => void notifyApprovalRequired(event),
    });
    return NextResponse.json({ id, started: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "run_failed", message },
      { status: 500 },
    );
  }
}
