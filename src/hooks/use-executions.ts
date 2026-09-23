"use client";

import { useQuery } from "@tanstack/react-query";
import type { ExecutionStep, ExecutionStatus, TriggerType } from "@/lib/db/schema";
import { apiFetch } from "@/lib/client-api";

export interface ExecutionSummary {
  id: string;
  status: ExecutionStatus;
  trigger: TriggerType;
  workflowId: string | null;
  workflowTitle: string | null;
  error: string | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  steps: ExecutionStep[];
}

export const EXECUTIONS_KEY = ["executions"] as const;

/**
 * Run history. Polled while something is in flight so a run that pauses on an
 * approval gate, or finishes in the background, updates without a reload.
 */
export function useExecutions() {
  return useQuery({
    queryKey: EXECUTIONS_KEY,
    queryFn: () =>
      apiFetch<{ executions: ExecutionSummary[] }>("/api/executions").then(
        (data) => data.executions,
      ),
    refetchInterval: (query) =>
      query.state.data?.some(
        (run) => run.status === "running" || run.status === "awaiting_approval",
      )
        ? 5_000
        : false,
  });
}
