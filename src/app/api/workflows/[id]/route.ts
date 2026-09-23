import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { workflows, TRIGGER_TYPES } from "@/lib/db/schema";
import {
  deleteWorkflow,
  saveWorkflow,
  WorkflowValidationError,
} from "@/lib/workflows/authoring";

export const dynamic = "force-dynamic";

/** One workflow, with its steps — what the detail view and the canvas read. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getCurrentUserId();

  const [row] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
    .limit(1);

  if (!row) {
    return NextResponse.json(
      { error: "not_found", message: "No such workflow." },
      { status: 404 },
    );
  }

  return NextResponse.json({ workflow: row });
}

interface PutBody {
  title?: string;
  description?: string;
  triggerType?: string;
  cronExpression?: string;
  steps?: { label: string; tool?: string; description?: string }[];
  isAgentic?: boolean;
}

/** Edit a saved automation. Same validation path as the agent's own tool. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  const body = (await request.json()) as PutBody;

  const triggerType = body.triggerType;
  if (
    triggerType !== undefined &&
    !TRIGGER_TYPES.includes(triggerType as (typeof TRIGGER_TYPES)[number])
  ) {
    return NextResponse.json(
      { error: "invalid_request", message: "Unknown trigger type." },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      { error: "not_found", message: "No such workflow." },
      { status: 404 },
    );
  }

  try {
    const saved = await saveWorkflow({
      userId,
      id,
      title: body.title ?? existing.title,
      description: body.description ?? existing.description ?? undefined,
      triggerType:
        (triggerType as (typeof TRIGGER_TYPES)[number]) ??
        existing.triggerType,
      cronExpression:
        body.cronExpression ?? existing.cronExpression ?? undefined,
      // Steps are replaced wholesale when supplied, and left alone otherwise,
      // so a partial edit cannot silently erase the plan.
      steps:
        body.steps ??
        (existing.nodesJson as { label: string; tool?: string }[] | undefined),
      isAgentic: body.isAgentic,
    });
    return NextResponse.json({ workflow: saved });
  } catch (error) {
    if (error instanceof WorkflowValidationError) {
      return NextResponse.json(
        { error: "invalid_request", message: error.message },
        { status: 422 },
      );
    }
    throw error;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getCurrentUserId();

  const removed = await deleteWorkflow(userId, id);
  if (!removed) {
    return NextResponse.json(
      { error: "not_found", message: "No such workflow." },
      { status: 404 },
    );
  }

  return NextResponse.json({ id, deleted: true });
}
