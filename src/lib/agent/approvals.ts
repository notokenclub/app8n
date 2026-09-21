import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { deriveSubkey } from "@/lib/crypto/vault";
import { db } from "@/lib/db";
import {
  approvalRequests,
  executionLogs,
  type ApprovalRequest,
} from "@/lib/db/schema";
import { findTool, requiresApproval } from "./tools";

/** How long an unanswered approval stays actionable. */
export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Secret used by the AI SDK to HMAC-sign approval IDs. Without it a client
 * could craft a `tool-approval-response` for a tool call it was never offered
 * and walk straight through the safety gate.
 */
export function approvalSigningSecret(): Uint8Array {
  return deriveSubkey("tool-approval");
}

export class ApprovalError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "already_resolved"
      | "expired"
      | "invalid_parameters",
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}

/**
 * A one-line, human-readable rendering of what the agent wants to do. This is
 * the text on the approval card, so it has to be specific enough that a user
 * tapping "Approve" on a phone knows exactly what they are authorising.
 */
export function summariseAction(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const str = (key: string): string | undefined =>
    typeof input[key] === "string" ? (input[key] as string) : undefined;

  switch (toolName) {
    case "gmail_send_email": {
      const to = Array.isArray(input.to) ? input.to.join(", ") : str("to");
      return `Send an email to ${to ?? "an unknown recipient"} — "${str("subject") ?? "(no subject)"}"`;
    }
    case "calendar_create_event":
      return `Create the calendar event "${str("summary") ?? "(untitled)"}"${
        str("start") ? ` starting ${str("start")}` : ""
      }`;
    case "calendar_delete_event":
      return `Delete calendar event ${str("eventId") ?? "(unknown)"}`;
    case "docs_append_text":
      return `Append text to document ${str("documentId") ?? "(unknown)"}`;
    default:
      return `Run ${toolName}`;
  }
}

export interface CreateApprovalInput {
  executionId: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export async function createApprovalRequest(
  params: CreateApprovalInput,
): Promise<ApprovalRequest> {
  const [row] = await db
    .insert(approvalRequests)
    .values({
      executionId: params.executionId,
      toolCallId: params.toolCallId,
      actionName: params.toolName,
      summary: summariseAction(params.toolName, params.input),
      parametersJson: params.input,
      status: "PENDING",
      expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
    })
    .returning();

  return row;
}

export async function getApproval(id: string): Promise<ApprovalRequest | undefined> {
  return db.query.approvalRequests.findFirst({
    where: eq(approvalRequests.id, id),
  });
}

export async function listPendingApprovals(
  userId: string,
): Promise<(ApprovalRequest & { workflowId: string | null })[]> {
  const rows = await db
    .select({
      approval: approvalRequests,
      workflowId: executionLogs.workflowId,
    })
    .from(approvalRequests)
    .innerJoin(executionLogs, eq(approvalRequests.executionId, executionLogs.id))
    .where(
      and(
        eq(executionLogs.userId, userId),
        eq(approvalRequests.status, "PENDING"),
      ),
    )
    .orderBy(desc(approvalRequests.createdAt));

  return rows.map((r) => ({ ...r.approval, workflowId: r.workflowId }));
}

/** Sweeps stale gates so a forgotten approval can never be executed later. */
export async function expireStaleApprovals(now = new Date()): Promise<number> {
  const stale = await db
    .update(approvalRequests)
    .set({ status: "EXPIRED", resolvedAt: now })
    .where(
      and(
        eq(approvalRequests.status, "PENDING"),
        lt(approvalRequests.expiresAt, now),
      ),
    )
    .returning({ id: approvalRequests.id });

  if (stale.length) {
    await db
      .update(executionLogs)
      .set({ status: "cancelled", finishedAt: now })
      .where(
        and(
          eq(executionLogs.status, "awaiting_approval"),
          inArray(
            executionLogs.id,
            db
              .select({ id: approvalRequests.executionId })
              .from(approvalRequests)
              .where(
                inArray(
                  approvalRequests.id,
                  stale.map((s) => s.id),
                ),
              ),
          ),
        ),
      );
  }

  return stale.length;
}

export interface ResolveApprovalInput {
  approvalId: string;
  approved: boolean;
  /** Edited parameters from the "Edit Parameters" path on the approval card. */
  parameters?: Record<string, unknown>;
  now?: Date;
}

/**
 * Records the human decision. Edited parameters are re-validated against the
 * tool's own schema — the approval UI is as untrusted an input as the model is,
 * and this payload is what actually gets executed.
 */
export async function resolveApproval(
  params: ResolveApprovalInput,
): Promise<ApprovalRequest> {
  const now = params.now ?? new Date();
  const existing = await getApproval(params.approvalId);

  if (!existing) {
    throw new ApprovalError("No such approval request.", "not_found");
  }
  if (existing.status !== "PENDING") {
    throw new ApprovalError(
      `Approval was already ${existing.status.toLowerCase()}.`,
      "already_resolved",
    );
  }
  if (existing.expiresAt && existing.expiresAt.getTime() < now.getTime()) {
    await db
      .update(approvalRequests)
      .set({ status: "EXPIRED", resolvedAt: now })
      .where(eq(approvalRequests.id, params.approvalId));
    throw new ApprovalError("Approval request has expired.", "expired");
  }

  let resolvedParameters = existing.parametersJson;
  if (params.approved && params.parameters) {
    const toolDef = findTool(existing.actionName);
    if (!toolDef) {
      throw new ApprovalError(
        `Unknown action ${existing.actionName}.`,
        "invalid_parameters",
      );
    }
    const parsed = toolDef.parameters.safeParse(params.parameters);
    if (!parsed.success) {
      throw new ApprovalError(
        `Edited parameters are invalid: ${parsed.error.message}`,
        "invalid_parameters",
      );
    }
    resolvedParameters = parsed.data as Record<string, unknown>;
  }

  // Compare-and-swap on PENDING. Two approvers can race here — the chat client
  // and a phone acting on a push notification — and only one may win, or the
  // gated action would run twice.
  const [row] = await db
    .update(approvalRequests)
    .set({
      status: params.approved ? "APPROVED" : "REJECTED",
      resolvedParametersJson: params.approved ? resolvedParameters : null,
      resolvedAt: now,
    })
    .where(
      and(
        eq(approvalRequests.id, params.approvalId),
        eq(approvalRequests.status, "PENDING"),
      ),
    )
    .returning();

  if (!row) {
    throw new ApprovalError(
      "Approval was already resolved by someone else.",
      "already_resolved",
    );
  }

  return row;
}

/** Approvals are scoped through their execution, which owns the user id. */
export async function getApprovalForUser(
  approvalId: string,
  userId: string,
): Promise<ApprovalRequest | undefined> {
  const [row] = await db
    .select({ approval: approvalRequests })
    .from(approvalRequests)
    .innerJoin(executionLogs, eq(approvalRequests.executionId, executionLogs.id))
    .where(
      and(
        eq(approvalRequests.id, approvalId),
        eq(executionLogs.userId, userId),
      ),
    );

  return row?.approval;
}

/** True when the registry says this tool is gated. Fails closed. */
export function toolNeedsApproval(toolName: string): boolean {
  return requiresApproval(toolName);
}
