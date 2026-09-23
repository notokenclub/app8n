"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  ExecutionStatus,
  ExecutionStep,
  TriggerType,
} from "@/lib/db/schema";
import { apiFetch } from "@/lib/client-api";

export interface ExecutionSummary {
  id: string;
  workflowId: string | null;
  workflowTitle: string | null;
  status: ExecutionStatus;
  trigger: TriggerType;
  error: string | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface ExecutionDetail extends ExecutionSummary {
  steps: ExecutionStep[];
  output: unknown;
}

export const EXECUTIONS_KEY = ["executions"] as const;

/**
 * Run history, newest first.
 *
 * Polled on the same cadence as approvals because the two move together: a run
 * that parks on a gate changes status the moment someone approves it from
 * another device, and a history that needs a manual refresh to show that is a
 * history nobody trusts.
 */
export function useExecutions(workflowId?: string) {
  return useQuery({
    queryKey: [...EXECUTIONS_KEY, workflowId ?? null],
    queryFn: () =>
      apiFetch<{ executions: ExecutionSummary[] }>(
        workflowId
          ? `/api/executions?workflowId=${encodeURIComponent(workflowId)}`
          : "/api/executions",
      ).then((data) => data.executions),
    refetchInterval: 15_000,
  });
}

export function useExecution(id: string | null) {
  return useQuery({
    queryKey: [...EXECUTIONS_KEY, "detail", id],
    queryFn: () => apiFetch<ExecutionDetail>(`/api/executions/${id}`),
    enabled: id !== null,
    refetchInterval: 15_000,
  });
}
