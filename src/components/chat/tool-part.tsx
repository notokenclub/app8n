"use client";

import * as React from "react";
import { cn } from "cn";
import { Badge, Divider, Icon, LogConsole } from "@/ds";
import { toolDisplay } from "@/lib/tool-display";
import { summariseResult } from "@/lib/tool-result";

export interface ToolPartView {
  toolCallId: string;
  toolName: string;
  state:
    | "input-streaming"
    | "input-available"
    | "approval-requested"
    | "approval-responded"
    | "output-available"
    | "output-error"
    | "output-denied";
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

/**
 * A short trailing detail on the pill — the search query, the recipient — so
 * three consecutive "Searched Gmail" pills are distinguishable at a glance.
 */
function inputHint(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const record = input as Record<string, unknown>;
  for (const key of ["query", "to", "summary", "title", "text", "messageId"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.length > 42 ? `${value.slice(0, 42)}…` : value;
    }
  }
  return undefined;
}

/**
 * One tool call in the transcript, as a design-system badge.
 *
 * In flight it is just a badge — the point is to show the agent is working
 * without shoving the conversation off screen on a phone. Once output lands
 * the badge grows a preview of what came back, collapsed by default so a
 * fifty-message search does not bury the agent's actual answer.
 */
export function ToolPart({ part }: { part: ToolPartView }) {
  const display = toolDisplay(part.toolName);
  const [open, setOpen] = React.useState(false);
  const hint = inputHint(part.input);

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <span className="inline-flex max-w-full items-center gap-space-xs">
        <Badge tone="primary">
          <span className="inline-flex items-center gap-space-xxs">
            <Icon name="Clock" size={16} />
            {display.active}
          </span>
        </Badge>
        {hint && <span className="truncate text-caption text-muted">{hint}</span>}
      </span>
    );
  }

  if (
    part.state === "approval-requested" ||
    part.state === "approval-responded"
  ) {
    // The actionable card is rendered from the persisted `data-approval` part,
    // which carries the database id needed by /api/approvals/[id]. This badge
    // only marks the place in the transcript where the run stopped.
    return (
      <Badge tone="primary">
        <span className="inline-flex items-center gap-space-xxs">
          <Icon name="LockLocked" size={16} />
          Waiting for your approval
        </span>
      </Badge>
    );
  }

  if (part.state === "output-denied") {
    // The user rejected the gate. Shown, not hidden: the transcript has to
    // record that the agent asked and was told no, or the conversation reads
    // as if the action simply never happened.
    return (
      <Badge tone="neutral">
        <span className="inline-flex items-center gap-space-xxs">
          <Icon name="Cross" size={16} />
          {display.done} — rejected
        </span>
      </Badge>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="space-y-space-xxs">
        <Badge tone="danger">
          <span className="inline-flex items-center gap-space-xxs">
            <Icon name="CrossCircle" size={16} />
            {display.done} failed
          </span>
        </Badge>
        {part.errorText && (
          <p className="pl-space-xxs text-caption text-destructive">
            {part.errorText}
          </p>
        )}
      </div>
    );
  }

  const summary = summariseResult(part.output);
  const expandable = summary.kind === "rows" || summary.kind === "raw";
  const detail =
    summary.count != null
      ? `${summary.count} result${summary.count === 1 ? "" : "s"}`
      : summary.kind === "empty"
        ? "nothing found"
        : (summary.note ?? hint);

  return (
    <div className="min-w-0 space-y-space-xs">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex max-w-full items-center gap-space-xs text-left disabled:cursor-default"
      >
        <Badge tone="neutral">
          <span className="inline-flex items-center gap-space-xxs">
            <Icon name={display.icon} size={16} />
            {display.done}
          </span>
        </Badge>
        {detail && <span className="truncate text-caption text-muted">{detail}</span>}
        {expandable && (
          <span
            className={cn(
              "inline-flex text-muted transition-transform",
              open && "rotate-180",
            )}
          >
            <Icon name="ChevronDown" size={16} />
          </span>
        )}
      </button>

      {open && summary.kind === "rows" && (
        <ul className="rounded-md border border-border bg-background p-space-xs">
          {summary.rows.map((row, index) => (
            <li key={row.key} className="min-w-0 px-space-xxs py-space-xxs text-caption">
              {index > 0 && <Divider tone="hairline" />}
              <div className="flex items-baseline gap-space-xs pt-space-xxs">
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {row.title}
                </span>
                {row.meta && (
                  <span className="shrink-0 text-legal text-muted tabular-nums">
                    {row.meta}
                  </span>
                )}
                {row.href && (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open in a new tab"
                    className="shrink-0 text-muted hover:text-primary"
                  >
                    <Icon name="LinkExternal" size={16} />
                  </a>
                )}
              </div>
              {row.subtitle && (
                <p className="truncate text-muted">{row.subtitle}</p>
              )}
            </li>
          ))}
          {summary.count != null && summary.count > summary.rows.length && (
            <li className="px-space-xxs text-legal text-muted">
              +{summary.count - summary.rows.length} more
            </li>
          )}
        </ul>
      )}

      {/* Raw output is machine text, so it goes in the system's log console
          rather than a styled <pre>. */}
      {open && summary.kind === "raw" && summary.raw && (
        <div className="scroll-region max-h-48 overflow-auto">
          <LogConsole
            lines={summary.raw
              .split("\n")
              .map((text) => ({ time: "", text, level: "info" as const }))}
          />
        </div>
      )}
    </div>
  );
}
