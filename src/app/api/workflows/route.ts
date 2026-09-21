import { and, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { workflows, WORKFLOW_STATUSES } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  const rows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.userId, userId))
    .orderBy(desc(workflows.updatedAt));

  return NextResponse.json({
    workflows: rows.map((row) => ({
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
    })),
  });
}

interface PatchBody {
  id?: string;
  status?: (typeof WORKFLOW_STATUSES)[number];
}

/**
 * Pause and resume from the blueprint list.
 *
 * Ownership is part of the WHERE clause rather than a separate check: a
 * workflow belonging to someone else matches nothing and updates nothing,
 * which is the same outcome without a window between the check and the write.
 */
export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId();
  const body = (await request.json()) as PatchBody;

  if (!body.id || !body.status) {
    return NextResponse.json(
      { error: "invalid_request", message: "id and status are required." },
      { status: 400 },
    );
  }

  if (!WORKFLOW_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: "invalid_request", message: "Unknown status." },
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
