import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { runWorkflow } from "@/lib/scheduler/worker";
import { notifyApprovalRequired } from "@/lib/notify";
import { getWebhookSecret, webhookSecretMatches } from "@/lib/workflows/webhooks";

export const dynamic = "force-dynamic";

/**
 * The entry point for `webhook`-triggered automations.
 *
 * Unlike the rest of the API this is called by something outside the app, so
 * it authenticates on its own terms: the workflow's vault-stored secret, sent
 * as `x-app8n-webhook-secret`, compared in constant time. It deliberately does
 * not use the session helper — there is no session — and it answers 404 rather
 * than 401 for a bad secret so the endpoint cannot be used to discover which
 * workflow ids exist.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, id))
    .limit(1);

  const notFound = NextResponse.json(
    { error: "not_found", message: "No such webhook." },
    { status: 404 },
  );

  if (!workflow || workflow.triggerType !== "webhook") return notFound;

  const expected = await getWebhookSecret(workflow.userId, workflow.id);
  if (!expected) return notFound;

  const presented = request.headers.get("x-app8n-webhook-secret");
  if (!webhookSecretMatches(presented, expected)) return notFound;

  if (workflow.status !== "active") {
    return NextResponse.json(
      {
        error: "inactive",
        message: "This automation is not active.",
        status: workflow.status,
      },
      { status: 409 },
    );
  }

  // The body is context for the run, not instructions to obey: it reaches the
  // model as data inside the workflow's own prompt, and every gated tool still
  // stops at the approval card.
  let payload: unknown = null;
  try {
    const text = await request.text();
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  try {
    await runWorkflow(workflow, {
      payload,
      onApprovalRequired: (event) => void notifyApprovalRequired(event),
    });
    return NextResponse.json({ id: workflow.id, ran: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "run_failed", message }, { status: 500 });
  }
}
