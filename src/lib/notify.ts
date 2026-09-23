import { appUrl } from "@/lib/config";
import type { ApprovalRequiredEvent } from "@/lib/agent/orchestrator";

/**
 * Where an approval gate goes when nobody is looking at the app.
 *
 * A gate opened by the 7am scheduler is useless if it only exists on a screen
 * the user is not holding, so every background run notifies. The transport is
 * a plain outbound webhook, configured with `APP8N_NOTIFY_WEBHOOK_URL`: it
 * takes one environment variable and works with ntfy, Slack, Discord, Home
 * Assistant or anything else that accepts a JSON POST, with no account, SDK or
 * push certificate involved.
 *
 * Native push (`@capacitor/push-notifications`) rides on the same hook once an
 * APNs/FCM project exists — see `docs/DEPLOYMENT.md`. It is not wired here
 * because it cannot be made to work without credentials this repository does
 * not have, and a stub that silently drops notifications is worse than an
 * absence.
 */

export interface NotificationPayload {
  kind: "approval_required";
  title: string;
  message: string;
  url: string;
  approvalRequestId: string;
  toolName: string;
  summary: string;
  at: string;
}

function webhookUrl(): string | undefined {
  const url = process.env.APP8N_NOTIFY_WEBHOOK_URL?.trim();
  return url || undefined;
}

export function isNotifyConfigured(): boolean {
  return webhookUrl() !== undefined;
}

/** Posts a payload to the configured webhook. Never throws. */
export async function sendNotification(
  payload: NotificationPayload,
): Promise<boolean> {
  const url = webhookUrl();
  if (!url) return false;

  try {
    // Timed out rather than left hanging: a notification is worth a couple of
    // seconds, never a stuck scheduler tick.
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // ntfy renders these; everything else ignores them.
        Title: payload.title,
        Tags: "warning",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    // A failed notification must not fail the run that raised it.
    return false;
  }
}

export async function notifyApprovalRequired(
  event: ApprovalRequiredEvent,
): Promise<boolean> {
  return sendNotification({
    kind: "approval_required",
    title: "app8n needs your approval",
    message: event.summary,
    url: `${appUrl()}/approvals`,
    approvalRequestId: event.approvalRequestId,
    toolName: event.toolName,
    summary: event.summary,
    at: new Date().toISOString(),
  });
}
