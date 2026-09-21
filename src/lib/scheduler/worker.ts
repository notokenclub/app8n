import { resolveAgentContext } from "@/lib/agent/context";
import { expireStaleApprovals } from "@/lib/agent/approvals";
import { isAgentConfiguredInEnv } from "@/lib/agent/model";
import { runAgent, type ApprovalRequiredEvent } from "@/lib/agent/orchestrator";
import type { Workflow } from "@/lib/db/schema";
import { notifyApprovalRequired } from "@/lib/push/dispatch";
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

/**
 * Renders `nodes_json` as a numbered list the model can read.
 *
 * Tolerant of anything in the column: the steps are advisory context, so a
 * malformed node should cost us that one line, not the whole run.
 */
function planOf(workflow: Workflow): string[] {
  return workflow.nodesJson.flatMap((node) => {
    if (typeof node !== "object" || node === null) return [];
    const { label, tool, description } = node as Record<string, unknown>;
    const name = typeof label === "string" ? label : undefined;
    const toolName = typeof tool === "string" ? tool : undefined;
    const head = name ?? toolName;
    if (!head) return [];
    const suffix = toolName && name ? ` (${toolName})` : "";
    const detail =
      typeof description === "string" && description ? ` — ${description}` : "";
    return [`${head}${suffix}${detail}`];
  });
}

/**
 * The instruction a scheduled run receives, worded by `isAgentic`.
 *
 * Exported so a test can assert that a workflow's stored plan actually reaches
 * the model — the canvas showing steps the run never saw is the specific bug
 * this wording exists to prevent.
 */
export function buildRunInstruction(workflow: Workflow): string {
  const parts = [workflow.description?.trim() || workflow.title];

  // Without this the canvas would be a lie: `/workflows` draws the steps as
  // what the automation does, while the run only ever saw the description.
  const plan = planOf(workflow);
  if (plan.length > 0) {
    parts.push(
      workflow.isAgentic
        ? "This is the plan it usually takes. Follow it where it fits and deviate where the situation calls for it:"
        : "Carry out these steps in order. Do not add steps or skip one unless it genuinely cannot be completed:",
      plan.map((step, index) => `${index + 1}. ${step}`).join("\n"),
    );
  }

  if (workflow.triggerType === "gmail_poll") {
    parts.push(
      "Only consider Gmail messages that arrived since the last run. If there is nothing new, say so and stop.",
    );
  }

  return parts.join("\n\n");
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
    messages: [{ role: "user", content: buildRunInstruction(workflow) }],
    services: ctx.services,
    accountId: ctx.accountId,
    email: ctx.email,
    onApprovalRequired: hooks.onApprovalRequired,
  });

  // Dispatched after the run rather than from inside the gate callback: the
  // run parks as soon as a gate opens, so nothing is delayed by waiting, and
  // a rejected push surfaces here instead of becoming an unhandled rejection.
  for (const approval of result.approvals) {
    const report = await notifyApprovalRequired(workflow.userId, approval);
    if (report.skipped === "not_configured") continue;
    hooks.log?.(
      `push for ${approval.approvalRequestId}: ${report.delivered} delivered` +
        (report.failed ? `, ${report.failed} failed` : "") +
        (report.skipped === "no_devices" ? " (no registered devices)" : ""),
    );
  }

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
  if (!isAgentConfiguredInEnv()) {
    // Advisory only. Each run resolves its own user's vault key, which may
    // exist even with nothing in the environment, so this cannot be a refusal
    // to start — the worker has no user to check at boot time.
    hooks.log?.(
      "No model API key in the environment — runs will rely on a key saved in the vault.",
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
