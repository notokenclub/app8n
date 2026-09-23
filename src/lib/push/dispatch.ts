import type { ApprovalRequiredEvent } from "@/lib/agent/orchestrator";
import { forgetToken, listDevices } from "./devices";
import {
  PushTransportError,
  readServiceAccount,
  sendFcmMessage,
  type ServiceAccount,
} from "./fcm";

export interface PushDeliveryReport {
  delivered: number;
  failed: number;
  /** Set when nothing was attempted, so a caller can say why it was quiet. */
  skipped?: "not_configured" | "no_devices";
  errors: string[];
}

/** True when a push provider is configured. Read by the settings surface. */
export function isPushConfigured(): boolean {
  try {
    return readServiceAccount() !== null;
  } catch {
    // A malformed service account is a configuration error, not a missing one;
    // sending will surface the real message rather than silently doing nothing.
    return true;
  }
}

function accountOrNull(): ServiceAccount | null {
  try {
    return readServiceAccount();
  } catch (error) {
    if (error instanceof PushTransportError) return null;
    throw error;
  }
}

/**
 * Notifies every device this user has registered.
 *
 * Delivery is best-effort by design: a failed push must never fail the run that
 * raised the gate. The approval is already durable in the database and the
 * `/approvals` tab polls for it, so push is an accelerant, not the channel of
 * record.
 */
export async function notifyApprovalRequired(
  userId: string,
  event: ApprovalRequiredEvent,
): Promise<PushDeliveryReport> {
  const account = accountOrNull();
  if (!account) {
    return { delivered: 0, failed: 0, skipped: "not_configured", errors: [] };
  }

  const devices = await listDevices(userId);
  if (devices.length === 0) {
    return { delivered: 0, failed: 0, skipped: "no_devices", errors: [] };
  }

  const report: PushDeliveryReport = { delivered: 0, failed: 0, errors: [] };

  for (const device of devices) {
    const result = await sendFcmMessage(account, {
      token: device.token,
      title: "Approval needed",
      body: event.summary,
      // Identifiers only. The card is re-fetched from the backend on open, so
      // the notification payload never has to carry the parameters themselves.
      data: {
        kind: "approval_required",
        approvalId: event.approvalRequestId,
        executionId: event.executionId,
        toolName: event.toolName,
      },
    });

    if (result.ok) {
      report.delivered += 1;
      continue;
    }

    report.failed += 1;
    report.errors.push(result.error);
    if (result.unregistered) await forgetToken(device.token);
  }

  return report;
}
