import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { appUrl } from "@/lib/config";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import {
  ensureWebhookSecret,
  revokeWebhookSecret,
} from "@/lib/workflows/webhooks";

export const dynamic = "force-dynamic";

/**
 * Reveal (creating on first use) the URL and secret for a webhook automation.
 *
 * POST rather than GET because the first call mints a secret, and because a
 * credential should not end up in a browser history entry or a proxy log line.
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

  if (workflow.triggerType !== "webhook") {
    return NextResponse.json(
      {
        error: "invalid_state",
        message: "This automation is not triggered by a webhook.",
      },
      { status: 409 },
    );
  }

  const secret = await ensureWebhookSecret(userId, workflow.id);

  return NextResponse.json({
    url: `${appUrl()}/api/hooks/${workflow.id}`,
    header: "x-app8n-webhook-secret",
    secret,
  });
}

/** Rotate by revoking; the next reveal mints a fresh secret. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  await revokeWebhookSecret(userId, id);
  return NextResponse.json({ id, revoked: true });
}
