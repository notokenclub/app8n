import { z } from "zod";
import type { GoogleContext } from "@/lib/google/clients";
import type { GoogleService } from "@/lib/google/scopes";
import * as gmail from "@/lib/google/services/gmailService";
import * as calendar from "@/lib/google/services/calendarService";
import * as sheets from "@/lib/google/services/sheetsService";
import * as docs from "@/lib/google/services/docsService";
import * as tasks from "@/lib/google/services/tasksService";
import {
  deleteWorkflow,
  describeWorkflow,
  listWorkflows,
  saveWorkflow,
  setWorkflowStatus,
} from "@/lib/workflows/authoring";
import { TRIGGER_TYPES, WORKFLOW_STATUSES } from "@/lib/db/schema";

/**
 * `read`     — no side effects.
 * `write`    — changes state the user owns privately.
 * `external` — visible to other people (sends mail, invites attendees).
 */
export type ToolImpact = "read" | "write" | "external";

export interface AgentTool {
  name: string;
  description: string;
  service: GoogleService | "core";
  impact: ToolImpact;
  /** When true the runtime pauses and raises an ApprovalRequest first. */
  requiresApproval: boolean;
  parameters: z.ZodType;
  execute: (rawArgs: unknown, ctx: GoogleContext) => Promise<unknown>;
}

function defineTool<S extends z.ZodType>(config: {
  name: string;
  description: string;
  service: GoogleService | "core";
  impact: ToolImpact;
  requiresApproval?: boolean;
  parameters: S;
  run: (args: z.infer<S>, ctx: GoogleContext) => Promise<unknown>;
}): AgentTool {
  return {
    name: config.name,
    description: config.description,
    service: config.service,
    impact: config.impact,
    requiresApproval: config.requiresApproval ?? config.impact === "external",
    parameters: config.parameters,
    // Model output is untrusted, so arguments are validated before they reach
    // a connector rather than being passed through on faith. `async` matters:
    // it turns a validation failure into a rejected promise so every caller
    // handles bad arguments and connector errors on the same path.
    execute: async (rawArgs, ctx) =>
      config.run(config.parameters.parse(rawArgs), ctx),
  };
}

const emailField = z.string().min(3).describe("Email address");

export const AGENT_TOOLS: AgentTool[] = [
  defineTool({
    name: "gmail_search_messages",
    description:
      "Search Gmail using Gmail query syntax (e.g. 'is:unread from:boss@corp.com newer_than:7d'). Returns message summaries without bodies.",
    service: "gmail",
    impact: "read",
    parameters: z.object({
      query: z.string().optional().describe("Gmail search query"),
      maxResults: z.number().int().min(1).max(50).optional(),
    }),
    run: (args, ctx) => gmail.searchMessages({ ...ctx, ...args }),
  }),

  defineTool({
    name: "gmail_get_message",
    description:
      "Fetch one Gmail message including its full plain-text body. Use after gmail_search_messages.",
    service: "gmail",
    impact: "read",
    parameters: z.object({ messageId: z.string() }),
    run: (args, ctx) => gmail.getMessage({ ...ctx, ...args }),
  }),

  defineTool({
    name: "gmail_draft_email",
    description:
      "Create a Gmail draft. Nothing is sent, so this is the safe way to prepare a reply for the user to review.",
    service: "gmail",
    impact: "write",
    parameters: z.object({
      to: emailField,
      subject: z.string(),
      body: z.string(),
      cc: z.string().optional(),
      threadId: z.string().optional(),
    }),
    run: (args, ctx) => gmail.draftEmail({ ...ctx, ...args }),
  }),

  defineTool({
    name: "gmail_send_email",
    description:
      "Send an email from the user's Gmail account. This is irreversible and visible to the recipient.",
    service: "gmail",
    impact: "external",
    parameters: z.object({
      to: emailField,
      subject: z.string(),
      body: z.string(),
      cc: z.string().optional(),
      threadId: z.string().optional(),
    }),
    run: (args, ctx) => gmail.sendEmail({ ...ctx, ...args }),
  }),

  defineTool({
    name: "gmail_mark_read",
    description: "Remove the UNREAD label from a message.",
    service: "gmail",
    impact: "write",
    parameters: z.object({ messageId: z.string() }),
    run: (args, ctx) => gmail.markAsRead({ ...ctx, ...args }),
  }),

  defineTool({
    name: "gmail_archive_message",
    description: "Archive a message by removing it from the inbox.",
    service: "gmail",
    impact: "write",
    parameters: z.object({ messageId: z.string() }),
    run: (args, ctx) => gmail.archiveMessage({ ...ctx, ...args }),
  }),

  defineTool({
    name: "calendar_list_events",
    description:
      "List calendar events in a time range. Times are ISO 8601 strings.",
    service: "calendar",
    impact: "read",
    parameters: z.object({
      timeMin: z.string().optional(),
      timeMax: z.string().optional(),
      query: z.string().optional(),
      maxResults: z.number().int().min(1).max(250).optional(),
      calendarId: z.string().optional(),
    }),
    run: (args, ctx) => calendar.listEvents({ ...ctx, ...args }),
  }),

  defineTool({
    name: "calendar_find_conflicts",
    description:
      "Return events overlapping a proposed time window. Call before creating an event.",
    service: "calendar",
    impact: "read",
    parameters: z.object({ start: z.string(), end: z.string() }),
    run: (args, ctx) => calendar.findConflicts({ ...ctx, ...args }),
  }),

  defineTool({
    name: "calendar_create_event",
    description:
      "Create a calendar event. Invites attendees, so it is externally visible.",
    service: "calendar",
    impact: "external",
    parameters: z.object({
      summary: z.string(),
      start: z.string().describe("ISO 8601 start time"),
      end: z.string().describe("ISO 8601 end time"),
      description: z.string().optional(),
      location: z.string().optional(),
      attendees: z.array(emailField).optional(),
    }),
    run: (args, ctx) => calendar.createEvent({ ...ctx, ...args }),
  }),

  defineTool({
    name: "calendar_delete_event",
    description: "Delete a calendar event. Irreversible.",
    service: "calendar",
    impact: "external",
    parameters: z.object({ eventId: z.string() }),
    run: (args, ctx) => calendar.deleteEvent({ ...ctx, ...args }),
  }),

  defineTool({
    name: "calendar_attendance_metrics",
    description:
      "Compute attendance percentage and debar risk from class counts. Returns how many classes can still be missed.",
    service: "core",
    impact: "read",
    parameters: z.object({
      heldClasses: z.number().int().min(0),
      attendedClasses: z.number().int().min(0),
      remainingClasses: z.number().int().min(0).optional(),
      threshold: z.number().min(0).max(1).optional(),
    }),
    run: async (args) => calendar.calculateAttendanceMetrics(args),
  }),

  defineTool({
    name: "sheets_read_range",
    description: "Read a range of cells from a spreadsheet as a 2-D array.",
    service: "sheets",
    impact: "read",
    parameters: z.object({
      spreadsheetId: z.string(),
      range: z.string().optional(),
    }),
    run: (args, ctx) => sheets.readRange({ ...ctx, ...args }),
  }),

  defineTool({
    name: "sheets_find_rows",
    description:
      "Read rows as objects keyed by the header row, optionally filtered by exact column matches.",
    service: "sheets",
    impact: "read",
    parameters: z.object({
      spreadsheetId: z.string(),
      range: z.string().optional(),
      match: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    run: (args, ctx) => sheets.findRows({ ...ctx, ...args }),
  }),

  defineTool({
    name: "sheets_append_row",
    description: "Append a single row to the end of a spreadsheet.",
    service: "sheets",
    impact: "write",
    parameters: z.object({
      spreadsheetId: z.string(),
      values: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
      range: z.string().optional(),
    }),
    run: (args, ctx) => sheets.appendRow({ ...ctx, ...args }),
  }),

  defineTool({
    name: "sheets_create_spreadsheet",
    description: "Create a new spreadsheet, optionally with a header row.",
    service: "sheets",
    impact: "write",
    parameters: z.object({
      title: z.string(),
      headers: z.array(z.string()).optional(),
    }),
    run: (args, ctx) => sheets.createSpreadsheet({ ...ctx, ...args }),
  }),

  defineTool({
    name: "docs_create",
    description: "Create a Google Doc, optionally with initial body text.",
    service: "docs",
    impact: "write",
    parameters: z.object({ title: z.string(), body: z.string().optional() }),
    run: (args, ctx) => docs.createDoc({ ...ctx, ...args }),
  }),

  defineTool({
    name: "docs_append_text",
    description:
      "Append text to an existing Google Doc. Modifies a document the user already owns.",
    service: "docs",
    impact: "write",
    requiresApproval: true,
    parameters: z.object({ documentId: z.string(), text: z.string() }),
    run: (args, ctx) => docs.appendText({ ...ctx, ...args }),
  }),

  defineTool({
    name: "docs_read",
    description: "Read a Google Doc's title and plain-text content.",
    service: "docs",
    impact: "read",
    parameters: z.object({ documentId: z.string() }),
    run: (args, ctx) => docs.readDoc({ ...ctx, ...args }),
  }),

  defineTool({
    name: "drive_search",
    description: "Full-text search across the user's Google Drive files.",
    service: "drive",
    impact: "read",
    parameters: z.object({
      query: z.string(),
      maxResults: z.number().int().min(1).max(50).optional(),
    }),
    run: (args, ctx) => docs.searchDrive({ ...ctx, ...args }),
  }),

  defineTool({
    name: "tasks_list",
    description: "List tasks from a Google Tasks list.",
    service: "tasks",
    impact: "read",
    parameters: z.object({
      taskListId: z.string().optional(),
      includeCompleted: z.boolean().optional(),
    }),
    run: (args, ctx) => tasks.listTasks({ ...ctx, ...args }),
  }),

  defineTool({
    name: "tasks_create",
    description: "Create a task, optionally with notes and a due date.",
    service: "tasks",
    impact: "write",
    parameters: z.object({
      title: z.string(),
      notes: z.string().optional(),
      due: z.string().optional().describe("ISO 8601 due date"),
      taskListId: z.string().optional(),
    }),
    run: (args, ctx) => tasks.createTask({ ...ctx, ...args }),
  }),

  defineTool({
    name: "tasks_complete",
    description: "Mark a task as completed.",
    service: "tasks",
    impact: "write",
    parameters: z.object({
      taskId: z.string(),
      taskListId: z.string().optional(),
    }),
    run: (args, ctx) => tasks.completeTask({ ...ctx, ...args }),
  }),

  // ---------------------------------------------------------------------
  // Core tools. These act on app8n itself rather than on Google, which is
  // what turns "make that a daily thing" into a real automation instead of a
  // promise the agent cannot keep. `service: "core"` means they are always in
  // the toolset, even before a Google account is connected.
  // ---------------------------------------------------------------------

  defineTool({
    name: "workflow_save",
    description:
      "Save the current request as a repeatable automation (a blueprint), or update one by id. Use this when the user asks for something to happen on a schedule, when new mail arrives, or to be saved for later. Steps are the plan; a step with no tool is a judgement call the agent makes at run time.",
    service: "core",
    impact: "write",
    // Creating something that will act unattended, on a schedule, is exactly
    // the kind of decision the gate exists for — and the approval card lets
    // the user correct the schedule before it is saved.
    requiresApproval: true,
    parameters: z.object({
      id: z
        .string()
        .optional()
        .describe("Existing workflow id, when editing rather than creating"),
      title: z.string().describe("Short name, sentence case"),
      description: z
        .string()
        .optional()
        .describe("What the automation should do, in the user's own terms"),
      triggerType: z
        .enum(TRIGGER_TYPES)
        .describe(
          "'cron' for a schedule, 'gmail_poll' for new mail, 'webhook' for an external call, 'manual' to run on demand",
        ),
      cronExpression: z
        .string()
        .optional()
        .describe("Five-field cron, required when triggerType is 'cron'"),
      steps: z
        .array(
          z.object({
            label: z.string(),
            tool: z
              .string()
              .optional()
              .describe("Registry tool name, when the step maps onto one"),
            description: z.string().optional(),
          }),
        )
        .optional(),
      isAgentic: z
        .boolean()
        .optional()
        .describe(
          "True when the agent should adapt the plan; false to run the steps literally",
        ),
    }),
    run: async (args, ctx) => {
      const saved = await saveWorkflow({ ...args, userId: ctx.userId });
      return {
        id: saved.id,
        title: saved.title,
        status: saved.status,
        triggerType: saved.triggerType,
        cronExpression: saved.cronExpression,
        steps: saved.nodesJson.length,
      };
    },
  }),

  defineTool({
    name: "workflow_list",
    description:
      "List the user's saved automations with their id, status and schedule. Call this before editing, pausing or deleting one so the right id is used.",
    service: "core",
    impact: "read",
    parameters: z.object({}),
    run: async (_args, ctx) => {
      const rows = await listWorkflows(ctx.userId);
      return {
        workflows: rows.map((row) => ({
          id: row.id,
          summary: describeWorkflow(row),
          status: row.status,
          triggerType: row.triggerType,
          cronExpression: row.cronExpression,
          lastRunAt: row.lastRunAt?.toISOString() ?? null,
        })),
      };
    },
  }),

  defineTool({
    name: "workflow_set_status",
    description:
      "Pause, resume, archive or draft a saved automation. Reversible, so it runs without an approval gate.",
    service: "core",
    impact: "write",
    parameters: z.object({
      id: z.string(),
      status: z.enum(WORKFLOW_STATUSES),
    }),
    run: async (args, ctx) => {
      const updated = await setWorkflowStatus(ctx.userId, args.id, args.status);
      return { id: updated.id, title: updated.title, status: updated.status };
    },
  }),

  defineTool({
    name: "workflow_delete",
    description:
      "Delete a saved automation permanently, along with its run history. Prefer pausing unless the user asks for it to be removed.",
    service: "core",
    impact: "write",
    // Unlike pausing, this cannot be undone, so it goes through the gate.
    requiresApproval: true,
    parameters: z.object({ id: z.string() }),
    run: async (args, ctx) => {
      const removed = await deleteWorkflow(ctx.userId, args.id);
      if (!removed) throw new Error("No such workflow.");
      return { id: args.id, deleted: true };
    },
  }),
];

export const TOOLS_BY_NAME: Record<string, AgentTool> = Object.fromEntries(
  AGENT_TOOLS.map((tool) => [tool.name, tool]),
);

export function getTool(name: string): AgentTool {
  const tool = TOOLS_BY_NAME[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool;
}

export function requiresApproval(name: string): boolean {
  return TOOLS_BY_NAME[name]?.requiresApproval ?? true;
}

/** Tools reachable with the services a user has actually granted. */
export function toolsForServices(services: readonly GoogleService[]): AgentTool[] {
  const granted = new Set<string>([...services, "core"]);
  return AGENT_TOOLS.filter((tool) => granted.has(tool.service));
}

/** JSON Schema form for MCP servers and non-AI-SDK function-calling clients. */
export function toJsonSchemaTools(tools: AgentTool[] = AGENT_TOOLS) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.parameters),
    annotations: {
      readOnlyHint: tool.impact === "read",
      destructiveHint: tool.impact === "external",
      requiresApproval: tool.requiresApproval,
    },
  }));
}
