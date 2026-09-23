import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  workflows,
  type Workflow,
  type WorkflowStatus,
  type TriggerType,
} from "@/lib/db/schema";
import { isValidCron } from "@/lib/scheduler/jobs";

/**
 * Turning a conversation into a saved automation.
 *
 * This is the one write path for workflows that did not come from the shipped
 * blueprints, and it is shared by the agent tool ("make that a daily thing")
 * and the HTTP API. Validation lives here rather than in either caller so a
 * workflow the model proposes and one a client POSTs cannot diverge in what
 * they are allowed to be.
 */

export interface AuthoredStep {
  label: string;
  /** A registry tool name, when the step maps onto one. Judgement steps omit it. */
  tool?: string;
  description?: string;
}

export interface SaveWorkflowInput {
  userId: string;
  /** Present when editing; absent when creating. */
  id?: string;
  title: string;
  description?: string;
  triggerType: TriggerType;
  cronExpression?: string;
  steps?: AuthoredStep[];
  isAgentic?: boolean;
  status?: WorkflowStatus;
}

export class WorkflowValidationError extends Error {}

/** Node/edge shape the canvas and the worker's plan renderer both read. */
function toGraph(steps: AuthoredStep[]) {
  const nodes = steps.map((step, index) => ({
    id: `step-${index + 1}`,
    label: step.label,
    ...(step.tool ? { tool: step.tool } : {}),
    ...(step.description ? { description: step.description } : {}),
    position: { x: 0, y: index * 110 },
  }));

  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `edge-${index + 1}`,
    source: node.id,
    target: nodes[index + 1].id,
  }));

  return { nodes, edges };
}

async function validate(input: SaveWorkflowInput): Promise<void> {
  if (!input.title.trim()) {
    throw new WorkflowValidationError("A workflow needs a title.");
  }

  // A cron workflow without a valid expression would be saved as active and
  // then never run — a silent failure that looks like a working automation.
  if (input.triggerType === "cron") {
    if (!input.cronExpression) {
      throw new WorkflowValidationError(
        "A scheduled workflow needs a cron expression, e.g. '0 8 * * 1-5' for weekdays at 8am.",
      );
    }
    if (!isValidCron(input.cronExpression)) {
      throw new WorkflowValidationError(
        `'${input.cronExpression}' is not a valid cron expression.`,
      );
    }
  }

  // Imported here rather than at module scope: the agent's tool registry
  // imports this module, and a static edge back would close the cycle.
  const { TOOLS_BY_NAME } = await import("@/lib/agent/tools");
  for (const step of input.steps ?? []) {
    if (step.tool && !TOOLS_BY_NAME[step.tool]) {
      throw new WorkflowValidationError(
        `Step '${step.label}' names an unknown tool '${step.tool}'.`,
      );
    }
  }
}

export async function saveWorkflow(
  input: SaveWorkflowInput,
): Promise<Workflow> {
  await validate(input);

  const { nodes, edges } = toGraph(input.steps ?? []);
  const cronExpression =
    input.triggerType === "cron" ? (input.cronExpression ?? null) : null;

  if (input.id) {
    // Ownership is in the WHERE clause, so someone else's workflow simply
    // matches nothing rather than being checked and then raced.
    const [updated] = await db
      .update(workflows)
      .set({
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        triggerType: input.triggerType,
        cronExpression,
        nodesJson: nodes,
        edgesJson: edges,
        ...(input.isAgentic === undefined ? {} : { isAgentic: input.isAgentic }),
        ...(input.status ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(workflows.id, input.id), eq(workflows.userId, input.userId)),
      )
      .returning();

    if (!updated) {
      throw new WorkflowValidationError("No such workflow.");
    }
    return updated;
  }

  const [created] = await db
    .insert(workflows)
    .values({
      userId: input.userId,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      triggerType: input.triggerType,
      cronExpression,
      nodesJson: nodes,
      edgesJson: edges,
      isAgentic: input.isAgentic ?? true,
      // Saved automations start active: the user asked for this to happen, and
      // a draft that never fires is indistinguishable from a broken save.
      status: input.status ?? "active",
    })
    .returning();

  return created;
}

export async function setWorkflowStatus(
  userId: string,
  id: string,
  status: WorkflowStatus,
): Promise<Workflow> {
  const [updated] = await db
    .update(workflows)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
    .returning();

  if (!updated) throw new WorkflowValidationError("No such workflow.");
  return updated;
}

export async function deleteWorkflow(
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await db
    .delete(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
    .returning({ id: workflows.id });

  return deleted.length > 0;
}

export async function listWorkflows(userId: string): Promise<Workflow[]> {
  return db.select().from(workflows).where(eq(workflows.userId, userId));
}

/** One-line summary per workflow, for the agent's `workflow_list` tool. */
export function describeWorkflow(workflow: Workflow): string {
  const schedule =
    workflow.triggerType === "cron"
      ? `cron ${workflow.cronExpression}`
      : workflow.triggerType;
  return `${workflow.title} [${workflow.status}, ${schedule}]`;
}
