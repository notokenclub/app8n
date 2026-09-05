"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TriggerType, WorkflowStatus } from "@/lib/db/schema";
import { apiFetch } from "@/lib/client-api";

/** One step of a blueprint, as stored in `workflows.nodes_json`. */
export interface WorkflowNode {
  id: string;
  type?: string;
  label?: string;
  tool?: string;
  description?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
}

export interface WorkflowEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowSummary {
  id: string;
  title: string;
  description: string | null;
  status: WorkflowStatus;
  triggerType: TriggerType;
  cronExpression: string | null;
  isAgentic: boolean;
  blueprintKey: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  lastRunAt: string | null;
  updatedAt: string | null;
}

export const WORKFLOWS_KEY = ["workflows"] as const;

export function useWorkflows() {
  return useQuery({
    queryKey: WORKFLOWS_KEY,
    queryFn: () =>
      apiFetch<{ workflows: WorkflowSummary[] }>("/api/workflows").then(
        (data) => data.workflows,
      ),
  });
}

export function useSetWorkflowStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status: WorkflowStatus }) =>
      apiFetch<{ id: string; status: WorkflowStatus }>("/api/workflows", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKFLOWS_KEY }),
  });
}
