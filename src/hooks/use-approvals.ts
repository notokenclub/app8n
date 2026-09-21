"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client-api";

export interface PendingApproval {
  id: string;
  executionId: string;
  workflowId: string | null;
  toolCallId: string | null;
  action: string;
  summary: string | null;
  parameters: Record<string, unknown>;
  createdAt: string;
  expiresAt: string | null;
}

export const APPROVALS_KEY = ["approvals"] as const;

/**
 * Pending approval gates for the current user.
 *
 * Polled rather than pushed: a gate can be opened by the background scheduler
 * while no chat stream is attached, so the UI cannot rely on the chat socket
 * to learn about it. The interval is short because this list is the thing
 * standing between the user and a blocked automation.
 */
export function usePendingApprovals() {
  return useQuery({
    queryKey: APPROVALS_KEY,
    queryFn: () =>
      apiFetch<{ approvals: PendingApproval[] }>("/api/approvals").then(
        (data) => data.approvals,
      ),
    refetchInterval: 15_000,
  });
}

export interface ResolveApprovalInput {
  id: string;
  approved: boolean;
  /** Set when the user took the "Edit parameters" path on the card. */
  parameters?: Record<string, unknown>;
}

export interface ResolveApprovalResult {
  status: "APPROVED" | "REJECTED";
  id: string;
  toolCallId: string | null;
  executed?: boolean;
  output?: unknown;
  error?: string;
}

export function useResolveApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, approved, parameters }: ResolveApprovalInput) =>
      apiFetch<ResolveApprovalResult>(`/api/approvals/${id}`, {
        method: "POST",
        body: JSON.stringify({ approved, parameters }),
      }),
    // Refetch on failure too: a 409 means another device resolved this gate,
    // so the stale card must disappear rather than sit there offering buttons
    // that can no longer do anything.
    onSettled: () => queryClient.invalidateQueries({ queryKey: APPROVALS_KEY }),
  });
}
