import { toolDisplay } from "@/lib/tool-display";

export interface ActionField {
  key: string;
  label: string;
  value: string;
  /** `body` renders as a multi-line preview; `inline` as a single line. */
  kind: "inline" | "body";
}

export interface ActionDescription {
  title: string;
  /** One-line restatement of what will happen, for the card header. */
  headline: string;
  fields: ActionField[];
}

/** Labels for the parameters a user actually needs to see before approving. */
const FIELD_LABELS: Record<string, string> = {
  to: "To",
  cc: "Cc",
  subject: "Subject",
  body: "Message",
  summary: "Title",
  description: "Description",
  location: "Location",
  start: "Starts",
  end: "Ends",
  attendees: "Attendees",
  eventId: "Event",
  documentId: "Document",
  text: "Text to append",
  spreadsheetId: "Spreadsheet",
  values: "Row values",
  title: "Title",
  messageId: "Message",
  threadId: "Thread",
};

/** Parameters rendered as a multi-line block rather than a single line. */
const LONG_FIELDS = new Set(["body", "text", "description"]);

/**
 * Fields shown first, so the two things that decide whether an email is safe to
 * send — who receives it and what it says — are never below the fold on a
 * phone. Anything not listed keeps its natural order after these.
 */
const FIELD_ORDER = [
  "to",
  "cc",
  "subject",
  "summary",
  "start",
  "end",
  "attendees",
  "location",
  "body",
  "text",
  "description",
];

export function formatValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function labelFor(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  // camelCase / snake_case -> "Sentence case"
  const spaced = key.replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Turns a pending tool call into something a human can check at a glance.
 *
 * Driven by the parameters actually present rather than a per-tool template:
 * a tool gaining a field then shows up in the card automatically instead of
 * being silently hidden from the person approving it.
 */
export function describeAction(
  toolName: string,
  parameters: Record<string, unknown>,
): ActionDescription {
  const display = toolDisplay(toolName);

  const keys = Object.keys(parameters).sort((a, b) => {
    const ai = FIELD_ORDER.indexOf(a);
    const bi = FIELD_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const fields = keys
    .map((key) => ({
      key,
      label: labelFor(key),
      value: formatValue(parameters[key]),
      kind: LONG_FIELDS.has(key) ? ("body" as const) : ("inline" as const),
    }))
    .filter((field) => field.value !== "");

  const target =
    formatValue(parameters.to) ||
    formatValue(parameters.attendees) ||
    formatValue(parameters.summary) ||
    formatValue(parameters.title) ||
    "";

  return {
    title: display.done.replace(/^\w/, (c) => c.toUpperCase()),
    headline: target ? `${display.active} → ${target}` : display.active,
    fields,
  };
}

/**
 * Re-assembles edited form values into a parameter object shaped like the
 * original, so the server's Zod check sees the types it expects rather than
 * strings for everything.
 *
 * This is a convenience, not a security boundary: `resolveApproval` re-parses
 * the result against the tool's own schema, so a bad guess here is rejected
 * rather than executed.
 */
export function parseEditedValue(original: unknown, edited: string): unknown {
  if (Array.isArray(original)) {
    const parts = edited
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.map((part) => {
      const asNumber = Number(part);
      return original.some((item) => typeof item === "number") &&
        !Number.isNaN(asNumber)
        ? asNumber
        : part;
    });
  }

  if (typeof original === "number") {
    const asNumber = Number(edited);
    return Number.isNaN(asNumber) ? edited : asNumber;
  }

  if (typeof original === "boolean") return edited === "true";

  if (original !== null && typeof original === "object") {
    try {
      return JSON.parse(edited);
    } catch {
      // Hand the raw string over and let server-side validation explain why.
      return edited;
    }
  }

  return edited;
}
