import {
  Archive,
  CalendarClock,
  CalendarPlus,
  CalendarRange,
  CalendarX2,
  ChartColumn,
  CircleCheckBig,
  FilePen,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderSearch,
  ListTodo,
  Mail,
  MailCheck,
  MailOpen,
  PenLine,
  Rows3,
  Search,
  Send,
  Table2,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface ToolDisplay {
  /** Shown while the call is in flight, e.g. "Searching Gmail…". */
  active: string;
  /** Shown once the result is back, e.g. "Searched Gmail". */
  done: string;
  icon: LucideIcon;
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
    icon: Search,
  },
  gmail_get_message: {
    active: "Opening message",
    done: "Read message",
    icon: MailOpen,
  },
  gmail_draft_email: {
    active: "Drafting email",
    done: "Drafted email",
    icon: PenLine,
  },
  gmail_send_email: {
    active: "Sending email",
    done: "Sent email",
    icon: Send,
  },
  gmail_mark_read: {
    active: "Marking as read",
    done: "Marked as read",
    icon: MailCheck,
  },
  gmail_archive_message: {
    active: "Archiving message",
    done: "Archived message",
    icon: Archive,
  },
  calendar_list_events: {
    active: "Checking calendar",
    done: "Checked calendar",
    icon: CalendarRange,
  },
  calendar_find_conflicts: {
    active: "Looking for conflicts",
    done: "Checked for conflicts",
    icon: CalendarClock,
  },
  calendar_create_event: {
    active: "Creating event",
    done: "Created event",
    icon: CalendarPlus,
  },
  calendar_delete_event: {
    active: "Deleting event",
    done: "Deleted event",
    icon: CalendarX2,
  },
  calendar_attendance_metrics: {
    active: "Calculating attendance",
    done: "Calculated attendance",
    icon: ChartColumn,
  },
  sheets_read_range: {
    active: "Reading spreadsheet",
    done: "Read spreadsheet",
    icon: Table2,
  },
  sheets_find_rows: {
    active: "Searching spreadsheet",
    done: "Searched spreadsheet",
    icon: Search,
  },
  sheets_append_row: {
    active: "Adding a row",
    done: "Added a row",
    icon: Rows3,
  },
  sheets_create_spreadsheet: {
    active: "Creating spreadsheet",
    done: "Created spreadsheet",
    icon: FileSpreadsheet,
  },
  docs_create: {
    active: "Creating doc",
    done: "Created doc",
    icon: FilePlus2,
  },
  docs_append_text: {
    active: "Editing doc",
    done: "Edited doc",
    icon: FilePen,
  },
  docs_read: {
    active: "Reading doc",
    done: "Read doc",
    icon: FileText,
  },
  drive_search: {
    active: "Searching Drive",
    done: "Searched Drive",
    icon: FolderSearch,
  },
  tasks_list: {
    active: "Checking tasks",
    done: "Checked tasks",
    icon: ListTodo,
  },
  tasks_create: {
    active: "Creating task",
    done: "Created task",
    icon: ListTodo,
  },
  tasks_complete: {
    active: "Completing task",
    done: "Completed task",
    icon: CircleCheckBig,
  },
};

const FALLBACK: ToolDisplay = {
  active: "Working",
  done: "Done",
  icon: Wrench,
};

/** Never throws on an unknown name, so a new tool degrades to a generic pill. */
export function toolDisplay(toolName: string): ToolDisplay {
  return TOOL_DISPLAY[toolName] ?? FALLBACK;
}

/** Which Workspace app a tool belongs to, for grouping and icons. */
export function toolService(toolName: string): string {
  return toolName.split("_")[0] ?? "";
}

export const SERVICE_ICONS: Record<string, LucideIcon> = {
  gmail: Mail,
  calendar: CalendarRange,
  sheets: FileSpreadsheet,
  docs: FileText,
  drive: FolderSearch,
  tasks: ListTodo,
};
