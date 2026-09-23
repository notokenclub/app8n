import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  workflows,
  type Workflow,
  type WorkflowStatus,
} from "@/lib/db/schema";
import { isValidCron } from "@/lib/scheduler/jobs";

/**
 * Authoring a workflow, shared by the agent tool and the REST endpoint.
 *
 * Both paths validate through this module rather than each doing their own
 * checks: a blueprint saved from chat and one saved from the UI must be the
 * same kind of object, or the canvas and the scheduler start disagreeing about
 * what a workflow is.
 */

/** Triggers the *agent* may author. `chat` is assigned by the runtime, and a
 * `webhook` opens an externally callable door, which is a decision for a
 * person rather than something a model should reach for mid-conversation. */
export const AUTHORABLE_TRIGGERS = ["manual", "cron", "gmail_poll"] as const;

/** Triggers a person may author over HTTP or from the UI. Webhooks are
 * offered here because `src/lib/workflows/webhooks.ts` now issues and stores
 * the secret that makes one safe to expose. */
export const API_AUTHORABLE_TRIGGERS = [
  ...AUTHORABLE_TRIGGERS,
  "webhook",
] as const;

export const workflowStepSchema = z.object({
  label: z
    .string()
    .min(1)
    .describe("Short human-readable name for this step"),
  tool: z
    .string()
    .optional()
    .describe(
      "Registered tool this step calls. Omit for a step that is the agent's own judgement.",
    ),
  description: z
    .string()
    .optional()
    .describe("What this step should achieve"),
});

export const workflowDraftSchema = z.object({
  title: z.string().min(1).max(120),
  description: z
    .string()
    .min(1)
    .describe("What the automation does, in one or two sentences"),
  triggerType: z.enum(API_AUTHORABLE_TRIGGERS),
  cronExpression: z
    .string()
    .optional()
    .describe("Five-field cron expression. Required when triggerType is cron."),
  steps: z.array(workflowStepSchema).max(20).default([]),
  isAgentic: z
    .boolean()
    .default(true)
    .describe(
      "True when the steps are a plan the agent may adapt; false when they must run exactly in order.",
    ),
  status: z.enum(["draft", "active", "paused"]).default("active"),
});

export type WorkflowDraft = z.infer<typeof workflowDraftSchema>;
export type WorkflowStepInput = z.infer<typeof workflowStepSchema>;

export class WorkflowAuthoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowAuthoringError";
  }
}

/**
 * Rejects a draft the runtime could not honour.
 *
 * Unknown tool names fail closed for the same reason the approval lookup does:
 * a step naming a tool that does not exist would sit in the canvas looking
 * real and silently do nothing on every run.
 *
 * The registry is injected rather than imported. The `workflow_save` tool
 * lives in that registry, so importing it here would make the two modules
 * mutually dependent for no gain.
 */
export function validateDraft(
  draft: WorkflowDraft,
  knownTools: ReadonlySet<string>,
): void {
  if (draft.triggerType === "cron") {
    if (!draft.cronExpression) {
      throw new WorkflowAuthoringError(
        "A cron trigger needs a cronExpression, e.g. '0 7 * * 1-5' for 7am on weekdays.",
      );
    }
    if (!isValidCron(draft.cronExpression)) {
      throw new WorkflowAuthoringError(
        `'${draft.cronExpression}' is not a valid cron expression.`,
      );
    }
  }

  const unknown = draft.steps
    .map((step) => step.tool)
    .filter((tool): tool is string => Boolean(tool))
    .filter((tool) => !knownTools.has(tool));

  if (unknown.length > 0) {
    throw new WorkflowAuthoringError(
      `Unknown tool${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.`,
    );
  }
}

/**
 * Steps become the canvas nodes *and* the plan the worker reads back into the
 * run instruction, so authoring writes one structure that both consume.
 */
export function toNodes(steps: WorkflowStepInput[]): unknown[] {
  return steps.map((step, index) => ({
    id: `step-${index + 1}`,
    label: step.label,
    ...(step.tool ? { tool: step.tool } : {}),
    ...(step.description ? { description: step.description } : {}),
    position: { x: 0, y: index * 110 },
  }));
}

export function toEdges(steps: WorkflowStepInput[]): unknown[] {
  return steps.slice(0, -1).map((_, index) => ({
    id: `edge-${index + 1}`,
    source: `step-${index + 1}`,
    target: `step-${index + 2}`,
  }));
}

export interface SaveWorkflowInput {
  userId: string;
  draft: WorkflowDraft;
  /** Names the steps may reference. See {@link validateDraft}. */
  knownTools: ReadonlySet<string>;
  /** Present when editing; absent creates a new blueprint. */
  workflowId?: string;
}

export async function saveWorkflow(
  params: SaveWorkflowInput,
): Promise<Workflow> {
  const { draft, userId } = params;
  validateDraft(draft, params.knownTools);

  const values = {
    title: draft.title,
    description: draft.description,
    triggerType: draft.triggerType,
    // Cleared rather than left behind when the trigger changes away from cron,
    // so a stale expression cannot resurrect an old schedule.
    cronExpression:
      draft.triggerType === "cron" ? (draft.cronExpression ?? null) : null,
    nodesJson: toNodes(draft.steps),
    edgesJson: toEdges(draft.steps),
    isAgentic: draft.isAgentic,
    status: draft.status as WorkflowStatus,
    updatedAt: new Date(),
  };

  if (params.workflowId) {
    const [updated] = await db
      .update(workflows)
      .set(values)
      .where(
        and(
          eq(workflows.id, params.workflowId),
          eq(workflows.userId, userId),
        ),
      )
      .returning();

    if (!updated) {
      throw new WorkflowAuthoringError("No such workflow to update.");
    }
    return updated;
  }

  const [created] = await db
    .insert(workflows)
    .values({ ...values, userId })
    .returning();

  return created;
}

export async function deleteWorkflow(
  userId: string,
  workflowId: string,
): Promise<boolean> {
  const removed = await db
    .delete(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.userId, userId)))
    .returning({ id: workflows.id });

  return removed.length > 0;
}

/**
 * Pause, resume or archive. Ownership is part of the WHERE clause rather than
 * a separate read: someone else's workflow matches nothing and updates
 * nothing, which is the same outcome without a window between check and write.
 */
export async function setWorkflowStatus(
  userId: string,
  workflowId: string,
  status: WorkflowStatus,
): Promise<Workflow> {
  const [updated] = await db
    .update(workflows)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(workflows.id, workflowId), eq(workflows.userId, userId)))
    .returning();

  if (!updated) throw new WorkflowAuthoringError("No such workflow.");
  return updated;
}

export async function listWorkflows(userId: string): Promise<Workflow[]> {
  return db.select().from(workflows).where(eq(workflows.userId, userId));
}

/** One line per workflow, for the agent's `workflow_list` tool. */
export function describeWorkflow(workflow: Workflow): string {
  const schedule =
    workflow.triggerType === "cron"
      ? `cron ${workflow.cronExpression}`
      : workflow.triggerType;
  return `${workflow.title} [${workflow.status}, ${schedule}]`;
}
