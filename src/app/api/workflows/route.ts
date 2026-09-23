import { and, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { agentToolNames } from "@/lib/agent/tools";
import { getCurrentUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { workflows, WORKFLOW_STATUSES } from "@/lib/db/schema";
import {
  deleteWorkflow,
  saveWorkflow,
  workflowDraftSchema,
  WorkflowAuthoringError,
} from "@/lib/workflows/authoring";

export const dynamic = "force-dynamic";

function serialise(row: typeof workflows.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    triggerType: row.triggerType,
    cronExpression: row.cronExpression,
    isAgentic: row.isAgentic,
    blueprintKey: row.blueprintKey,
    nodes: row.nodesJson,
    edges: row.edgesJson,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

export async function GET() {
  const userId = await getCurrentUserId();
  const rows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.userId, userId))
    .orderBy(desc(workflows.updatedAt));

  return NextResponse.json({ workflows: rows.map(serialise) });
}

/**
 * Authors a blueprint from the UI.
 *
 * Shares {@link saveWorkflow} with the agent's `workflow_save` tool, so a
 * blueprint created here and one created from chat are validated identically
 * and produce the same node structure the scheduler reads back.
 */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  const body: unknown = await request.json();

  const parsed = workflowDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.error.message },
      { status: 422 },
    );
  }

  try {
    const workflow = await saveWorkflow({
      userId,
      draft: parsed.data,
      knownTools: agentToolNames(),
    });
    return NextResponse.json(serialise(workflow), { status: 201 });
  } catch (error) {
    if (error instanceof WorkflowAuthoringError) {
      return NextResponse.json(
        { error: "invalid_request", message: error.message },
        { status: 422 },
      );
    }
    throw error;
  }
}

interface PatchBody {
  id?: string;
  status?: (typeof WORKFLOW_STATUSES)[number];
  draft?: unknown;
}

/**
 * Pause, resume, or edit a blueprint.
 *
 * Ownership is part of the WHERE clause rather than a separate check: a
 * workflow belonging to someone else matches nothing and updates nothing,
 * which is the same outcome without a window between the check and the write.
 */
export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId();
  const body = (await request.json()) as PatchBody;

  if (!body.id) {
    return NextResponse.json(
      { error: "invalid_request", message: "id is required." },
      { status: 400 },
    );
  }

  if (body.draft !== undefined) {
    const parsed = workflowDraftSchema.safeParse(body.draft);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", message: parsed.error.message },
        { status: 422 },
      );
    }

    try {
      const workflow = await saveWorkflow({
        userId,
        draft: parsed.data,
        knownTools: agentToolNames(),
        workflowId: body.id,
      });
      return NextResponse.json(serialise(workflow));
    } catch (error) {
      if (error instanceof WorkflowAuthoringError) {
        return NextResponse.json(
          { error: "not_found", message: error.message },
          { status: 404 },
        );
      }
      throw error;
    }
  }

  if (!body.status || !WORKFLOW_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: "invalid_request", message: "A valid status is required." },
      { status: 400 },
    );
  }

  const updated = await db
    .update(workflows)
    .set({ status: body.status, updatedAt: new Date() })
    .where(and(eq(workflows.id, body.id), eq(workflows.userId, userId)))
    .returning({ id: workflows.id });

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "not_found", message: "No such workflow." },
      { status: 404 },
    );
  }

  return NextResponse.json({ id: body.id, status: body.status });
}

export async function DELETE(request: NextRequest) {
  const userId = await getCurrentUserId();
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "invalid_request", message: "id is required." },
      { status: 400 },
    );
  }

  if (!(await deleteWorkflow(userId, id))) {
    return NextResponse.json(
      { error: "not_found", message: "No such workflow." },
      { status: 404 },
    );
  }

  return NextResponse.json({ id, deleted: true });
}
