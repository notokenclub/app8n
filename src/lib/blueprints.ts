import type { TriggerType, WorkflowStatus } from "@/lib/db/schema";

/**
 * One step of a starter blueprint.
 *
 * `tool` is the name of a registered agent tool. It is optional because a step
 * can be a judgement the agent makes rather than a call it places — "decide
 * whether this is a lead" has no tool behind it — but when present it must
 * name a real tool, which `agent-selftest` asserts.
 */
export interface BlueprintNode {
  id: string;
  label: string;
  tool?: string;
  description?: string;
}

export interface BlueprintEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
}

export interface Blueprint {
  /** Stable identity across re-seeds. Never reuse a key for a different automation. */
  key: string;
  title: string;
  description: string;
  triggerType: TriggerType;
  cronExpression?: string;
  status: WorkflowStatus;
  /**
   * Whether the steps are a plan the agent may adapt (`true`) or a fixed
   * sequence it must follow in order (`false`). Read by the scheduler when it
   * composes the run instruction — see `lib/scheduler/worker.ts`.
   */
  isAgentic: boolean;
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
}

/** Chains steps in the order they are listed. */
function chain(nodes: BlueprintNode[]): BlueprintEdge[] {
  return nodes.slice(0, -1).map((node, index) => ({
    id: `${node.id}-${nodes[index + 1]!.id}`,
    source: node.id,
    target: nodes[index + 1]!.id,
  }));
}

const collegeNodes: BlueprintNode[] = [
  {
    id: "classes",
    label: "Pull this term's classes",
    tool: "calendar_list_events",
    description:
      "Read the timetable calendar so attendance is measured against sessions that were actually scheduled, not a guess at how many there should have been.",
  },
  {
    id: "metrics",
    label: "Compute attendance per course",
    tool: "calendar_attendance_metrics",
    description:
      "Attended over held, per course, with the percentage and the margin to the 75% threshold.",
  },
  {
    id: "triage",
    label: "Find courses at risk",
    description:
      "A course below the threshold is already a problem; one within a couple of sessions of it is the one worth acting on while acting still helps.",
  },
  {
    id: "task",
    label: "Raise a task for each at-risk course",
    tool: "tasks_create",
    description:
      "So the warning survives the notification and lands somewhere the student will see it again.",
  },
  {
    id: "appeal",
    label: "Draft the appeal with the real figures",
    tool: "gmail_draft_email",
    description:
      "Quote the counts and dates from the metrics step. An appeal with a wrong number is worse than none.",
  },
  {
    id: "send",
    label: "Send it to the faculty",
    tool: "gmail_send_email",
    description:
      "Gated: this leaves the machine and is addressed to a real person, so it waits for approval.",
  },
];

const leadNodes: BlueprintNode[] = [
  {
    id: "scan",
    label: "Scan new mail for enquiries",
    tool: "gmail_search_messages",
    description:
      "Only messages that arrived since the last run, so a poll does not re-import the whole inbox.",
  },
  {
    id: "read",
    label: "Read the message",
    tool: "gmail_get_message",
    description: "Full body and headers, not just the snippet the list returns.",
  },
  {
    id: "extract",
    label: "Extract the contact details",
    description:
      "Name, email, company, and what they actually asked for. If it is not a genuine enquiry, stop here rather than filing noise.",
  },
  {
    id: "dedupe",
    label: "Check the sheet for a duplicate",
    tool: "sheets_find_rows",
    description:
      "Polling means the same thread can be seen twice. Matching on the sender's address before writing is what keeps the sheet clean.",
  },
  {
    id: "append",
    label: "Append the lead",
    tool: "sheets_append_row",
    description: "One row per lead, in the sheet's existing column order.",
  },
  {
    id: "mark",
    label: "Mark the message read",
    tool: "gmail_mark_read",
    description: "The signal to the next run that this one is already handled.",
  },
];

const briefingNodes: BlueprintNode[] = [
  {
    id: "events",
    label: "List today's meetings",
    tool: "calendar_list_events",
    description: "Everything on the calendar between now and midnight.",
  },
  {
    id: "conflicts",
    label: "Spot double-bookings",
    tool: "calendar_find_conflicts",
    description:
      "A clash is worth knowing about at 7am and useless to discover at 2pm.",
  },
  {
    id: "docs",
    label: "Find the documents attached to them",
    tool: "drive_search",
    description:
      "Agendas and decks referenced by today's events, so the brief links to the prep rather than describing it.",
  },
  {
    id: "mail",
    label: "Scan overnight mail",
    tool: "gmail_search_messages",
    description: "Unread since yesterday evening, summarised rather than listed.",
  },
  {
    id: "write",
    label: "Write the briefing doc",
    tool: "docs_create",
    description:
      "A doc rather than a chat message: it survives the day and can be shared.",
  },
];

/**
 * The blueprints app8n ships with.
 *
 * These are the answer to "what is this thing for" for a user who has just
 * connected an account and has no automations of their own yet — an empty
 * `/workflows` screen makes the product look like a toy. They are seeded, not
 * hard-coded into the runtime, so a user can edit or delete any of them.
 *
 * All three are agentic. Each one has a step that cannot be expressed as a
 * fixed call — deciding which course is at risk, deciding whether an email is
 * really a lead — and pretending otherwise would produce a workflow that runs
 * reliably and answers the wrong question.
 */
export const STARTER_BLUEPRINTS: Blueprint[] = [
  {
    key: "college-debar-assistant",
    title: "College debar and schedule assistant",
    description:
      "Track attendance against the 75% debar threshold for every course on my timetable. Compute attended-over-held per course, flag any course that is below the threshold or within two sessions of falling below it, raise a task for each one, and draft an appeal to the faculty quoting the exact session counts and dates. Send it only after I approve.",
    triggerType: "cron",
    // Weekday evenings: the day's classes have happened, and there is still a
    // night to act on a warning before the next session.
    cronExpression: "0 18 * * 1-5",
    status: "active",
    isAgentic: true,
    nodes: collegeNodes,
    edges: chain(collegeNodes),
  },
  {
    key: "gmail-lead-pipeline",
    title: "Gmail lead to Google Sheets pipeline",
    description:
      "When a new enquiry arrives in Gmail, read it, pull out the sender's name, email, company and what they are asking for, check the leads sheet so the same person is not filed twice, append a row, and mark the message read. Skip anything that is not a genuine enquiry.",
    triggerType: "gmail_poll",
    status: "active",
    isAgentic: true,
    nodes: leadNodes,
    edges: chain(leadNodes),
  },
  {
    key: "daily-briefing",
    title: "Daily calendar and Drive briefing",
    description:
      "Every weekday morning, write me a briefing doc covering today's meetings, any double-bookings, the Drive documents attached to those meetings, and a short summary of mail that arrived overnight.",
    triggerType: "cron",
    cronExpression: "0 7 * * 1-5",
    status: "active",
    isAgentic: true,
    nodes: briefingNodes,
    edges: chain(briefingNodes),
  },
];

export function blueprintByKey(key: string): Blueprint | undefined {
  return STARTER_BLUEPRINTS.find((blueprint) => blueprint.key === key);
}
