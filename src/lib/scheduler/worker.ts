import { resolveAgentContext } from "@/lib/agent/context";
import { expireStaleApprovals } from "@/lib/agent/approvals";
import { isAgentConfigured } from "@/lib/agent/model";
import { runAgent, type ApprovalRequiredEvent } from "@/lib/agent/orchestrator";
import type { Workflow } from "@/lib/db/schema";
import {
  loadScheduledWorkflows,
  markWorkflowRun,
  selectDueWorkflows,
} from "./jobs";

/** How often the worker looks for due work. */
export const TICK_INTERVAL_MS = 30_000;

export interface WorkerHooks {
  /** Called when a background run parks on an approval gate — the hook a push
   * notification is wired to, so the user can approve from their phone. */
  onApprovalRequired?: (event: ApprovalRequiredEvent) => void;
  onError?: (error: unknown, workflow?: Workflow) => void;
  log?: (message: string) => void;
}

function instructionFor(workflow: Workflow): string {
  const base = workflow.description?.trim() || workflow.title;
  if (workflow.triggerType === "gmail_poll") {
    return `${base}\n\nCheck for relevant new Gmail messages since the last run and act on them. If there is nothing new, say so and stop.`;
  }
  return base;
}

export async function runWorkflow(
  workflow: Workflow,
  hooks: WorkerHooks = {},
): Promise<void> {
  const ctx = await resolveAgentContext(workflow.userId);

  // Claim the slot before running so a long job is not started twice by the
  // next tick.
  await markWorkflowRun(workflow.id);

  const result = await runAgent({
    userId: workflow.userId,
    trigger: workflow.triggerType,
    workflowId: workflow.id,
    messages: [{ role: "user", content: instructionFor(workflow) }],
    services: ctx.services,
    accountId: ctx.accountId,
    email: ctx.email,
    onApprovalRequired: hooks.onApprovalRequired,
  });

  hooks.log?.(
    `workflow ${workflow.title} -> ${result.status}` +
      (result.error ? ` (${result.error})` : ""),
  );
}

/** One pass of the scheduler. Exposed separately so it can be tested directly. */
export async function tick(
  hooks: WorkerHooks = {},
  now = new Date(),
): Promise<Workflow[]> {
  await expireStaleApprovals(now);

  const due = selectDueWorkflows(await loadScheduledWorkflows(), now);

  for (const workflow of due) {
    try {
      await runWorkflow(workflow, hooks);
    } catch (error) {
      // One bad workflow must not take down the tick for the others.
      hooks.onError?.(error, workflow);
    }
  }

  return due;
}

export interface WorkerHandle {
  stop: () => void;
}

/**
 * Starts the polling loop. This is deliberately a plain interval owned by
 * whatever process calls it, not a Next.js primitive: the mobile client talks
 * to a backend that must keep running schedules whether or not any request is
 * in flight, and serverless request lifecycles cannot promise that.
 */
export function startWorker(hooks: WorkerHooks = {}): WorkerHandle {
  if (!isAgentConfigured()) {
    hooks.log?.(
      "ANTHROPIC_API_KEY is not set — scheduler is idle until it is configured.",
    );
  }

  let running = false;
  const runTick = async () => {
    if (running) return; // Skip rather than overlap if a tick runs long.
    running = true;
    try {
      await tick(hooks);
    } catch (error) {
      hooks.onError?.(error);
    } finally {
      running = false;
    }
  };

  void runTick();
  const timer = setInterval(runTick, TICK_INTERVAL_MS);

  return {
    stop: () => clearInterval(timer),
  };
}
