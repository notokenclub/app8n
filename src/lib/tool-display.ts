import type { IconName } from "@/ds";

export interface ToolDisplay {
  /** Shown while the call is in flight, e.g. "Searching Gmail…". */
  active: string;
  /** Shown once the result is back, e.g. "Searched Gmail". */
  done: string;
  /** A glyph name from the design system's curated utility set. */
  icon: IconName;
}

/**
 * Presentation metadata for the agent's tools.
 *
 * Deliberately a standalone table rather than something derived from
 * `@/lib/agent/tools`: that module pulls in `googleapis` and the connectors,
 * which must never reach the client bundle. `agent-selftest` asserts this map
 * covers every registered tool, so the duplication cannot silently drift.
 */
export const TOOL_DISPLAY: Record<string, ToolDisplay> = {
  gmail_search_messages: {
    active: "Searching Gmail",
    done: "Searched Gmail",
    icon: "Filter",
  },
  gmail_get_message: {
    active: "Opening message",
    done: "Read message",
    icon: "Inbox",
  },
  gmail_draft_email: {
    active: "Drafting email",
    done: "Drafted email",
    icon: "Edit",
  },
  gmail_send_email: {
    active: "Sending email",
    done: "Sent email",
    icon: "Email",
  },
  gmail_mark_read: {
    active: "Marking as read",
    done: "Marked as read",
    icon: "CheckCircle",
  },
  gmail_archive_message: {
    active: "Archiving message",
    done: "Archived message",
    icon: "FolderClosed",
  },
  calendar_list_events: {
    active: "Checking calendar",
    done: "Checked calendar",
    icon: "Calendar",
  },
  calendar_find_conflicts: {
    active: "Looking for conflicts",
    done: "Checked for conflicts",
    icon: "Clock",
  },
  calendar_create_event: {
    active: "Creating event",
    done: "Created event",
    icon: "Add",
  },
  calendar_delete_event: {
    active: "Deleting event",
    done: "Deleted event",
    icon: "Delete",
  },
  calendar_attendance_metrics: {
    active: "Calculating attendance",
    done: "Calculated attendance",
    icon: "ChartBar",
  },
  sheets_read_range: {
    active: "Reading spreadsheet",
    done: "Read spreadsheet",
    icon: "Grid",
  },
  sheets_find_rows: {
    active: "Searching spreadsheet",
    done: "Searched spreadsheet",
    icon: "Filter",
  },
  sheets_append_row: {
    active: "Adding a row",
    done: "Added a row",
    icon: "ListBulleted",
  },
  sheets_create_spreadsheet: {
    active: "Creating spreadsheet",
    done: "Created spreadsheet",
    icon: "Grid",
  },
  docs_create: {
    active: "Creating doc",
    done: "Created doc",
    icon: "File",
  },
  docs_append_text: {
    active: "Editing doc",
    done: "Edited doc",
    icon: "Edit",
  },
  docs_read: {
    active: "Reading doc",
    done: "Read doc",
    icon: "File",
  },
  drive_search: {
    active: "Searching Drive",
    done: "Searched Drive",
    icon: "FolderOpen",
  },
  tasks_list: {
    active: "Checking tasks",
    done: "Checked tasks",
    icon: "ListChecklist",
  },
  tasks_create: {
    active: "Creating task",
    done: "Created task",
    icon: "ListChecklist",
  },
  tasks_complete: {
    active: "Completing task",
    done: "Completed task",
    icon: "CheckCircle",
  },
  workflow_save: {
    active: "Saving automation",
    done: "Saved automation",
    icon: "DataFlow",
  },
  workflow_list: {
    active: "Checking automations",
    done: "Checked automations",
    icon: "ListBulleted",
  },
  workflow_set_status: {
    active: "Updating automation",
    done: "Updated automation",
    icon: "Edit",
  },
  workflow_delete: {
    active: "Deleting automation",
    done: "Deleted automation",
    icon: "Delete",
  },
};

const FALLBACK: ToolDisplay = {
  active: "Working",
  done: "Done",
  icon: "Automation",
};

/** Never throws on an unknown name, so a new tool degrades to a generic pill. */
export function toolDisplay(toolName: string): ToolDisplay {
  return TOOL_DISPLAY[toolName] ?? FALLBACK;
}

/** Which Workspace app a tool belongs to, for grouping and icons. */
export function toolService(toolName: string): string {
  return toolName.split("_")[0] ?? "";
}

export const SERVICE_ICONS: Record<string, IconName> = {
  gmail: "Email",
  calendar: "Calendar",
  sheets: "Grid",
  docs: "File",
  drive: "FolderOpen",
  tasks: "ListChecklist",
  workflow: "DataFlow",
};
