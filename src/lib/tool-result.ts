/**
 * Turns a connector's return value into something renderable without knowing
 * which connector produced it.
 *
 * The alternative — a bespoke preview component per tool — means every new
 * tool ships as a raw JSON blob in the chat until someone remembers to write
 * its renderer. Google's APIs are consistent enough about field naming
 * (`subject`, `summary`, `snippet`, `start`) that picking fields by name
 * covers every current tool and degrades to a readable list for the next one.
 */

export interface ResultRow {
  key: string;
  title: string;
  subtitle?: string;
  meta?: string;
  href?: string;
}

export interface ResultSummary {
  /** `rows` renders as a list, `note` as one line, `raw` as collapsed JSON. */
  kind: "rows" | "note" | "raw" | "empty";
  /** Total items found, which may exceed `rows.length` when truncated. */
  count?: number;
  rows: ResultRow[];
  note?: string;
  raw?: string;
}

const TITLE_KEYS = ["subject", "summary", "title", "name", "displayName"];
const SUBTITLE_KEYS = ["snippet", "description", "from", "location", "notes"];
const META_KEYS = ["date", "start", "due", "updated", "when"];
const LINK_KEYS = ["htmlLink", "webViewLink", "url", "link", "spreadsheetUrl"];

const MAX_ROWS = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

/** ISO timestamps are unreadable in a chat bubble; anything else passes through. */
function humanise(value: string | undefined): string | undefined {
  if (!value) return value;
  const time = Date.parse(value);
  if (Number.isNaN(time) || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: value.includes("T") ? "numeric" : undefined,
    minute: value.includes("T") ? "2-digit" : undefined,
  });
}

function toRow(value: unknown, index: number): ResultRow {
  if (!isRecord(value)) {
    return { key: String(index), title: String(value) };
  }
  const title =
    pick(value, TITLE_KEYS) ??
    pick(value, ["id", "messageId", "eventId"]) ??
    `Item ${index + 1}`;
  return {
    key: typeof value.id === "string" ? value.id : String(index),
    title,
    subtitle: pick(value, SUBTITLE_KEYS),
    meta: humanise(pick(value, META_KEYS)),
    href: pick(value, LINK_KEYS),
  };
}

/** Unwraps the one-key envelopes connectors return, e.g. `{ messages: [...] }`. */
function unwrap(output: unknown): unknown {
  if (!isRecord(output)) return output;
  const keys = Object.keys(output);
  if (keys.length === 1 && Array.isArray(output[keys[0]!])) {
    return output[keys[0]!];
  }
  return output;
}

export function summariseResult(output: unknown): ResultSummary {
  const value = unwrap(output);

  if (value == null) return { kind: "empty", rows: [] };

  if (typeof value === "string") {
    return { kind: "note", rows: [], note: value };
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return { kind: "note", rows: [], note: String(value) };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: "empty", rows: [] };
    // Sheets returns a grid of primitives; a "row list" of cell values is
    // noise, so it falls through to the raw view instead.
    if (value.every((item) => Array.isArray(item))) {
      return {
        kind: "raw",
        rows: [],
        count: value.length,
        raw: JSON.stringify(value, null, 2),
      };
    }
    return {
      kind: "rows",
      count: value.length,
      rows: value.slice(0, MAX_ROWS).map(toRow),
    };
  }

  if (isRecord(value)) {
    const row = toRow(value, 0);
    // A bare `{ id: "..." }` acknowledgement has nothing worth a card.
    const hasContent = row.subtitle || row.meta || pick(value, TITLE_KEYS);
    if (!hasContent) {
      return {
        kind: "raw",
        rows: [],
        raw: JSON.stringify(value, null, 2),
      };
    }
    return { kind: "rows", count: 1, rows: [row] };
  }

  return { kind: "raw", rows: [], raw: JSON.stringify(value, null, 2) };
}
