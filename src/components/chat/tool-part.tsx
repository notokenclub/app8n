"use client";

import * as React from "react";
import {
  AlertCircle,
  Ban,
  ChevronDown,
  ExternalLink,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { cn } from "cn";
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

function Pill({
  tone,
  icon,
  label,
  hint,
}: {
  tone: "running" | "done" | "error" | "waiting";
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        tone === "running" && "border-primary/30 bg-primary/10 text-primary",
        tone === "done" && "border-border bg-muted/60 text-muted-foreground",
        tone === "error" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
        tone === "waiting" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-300",
      )}
    >
      {icon}
      <span className="shrink-0">{label}</span>
      {hint && (
        <span className="min-w-0 truncate font-normal opacity-70">{hint}</span>
      )}
    </span>
  );
}

/**
 * One tool call in the transcript.
 *
 * In flight it is just a pill — the point is to show the agent is working
 * without shoving the conversation off screen on a phone. Once output lands
 * the pill grows a preview of what came back, collapsed by default so a
 * fifty-message search does not bury the agent's actual answer.
 */
export function ToolPart({ part }: { part: ToolPartView }) {
  const display = toolDisplay(part.toolName);
  const Icon = display.icon;
  const [open, setOpen] = React.useState(false);
  const hint = inputHint(part.input);

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <Pill
        tone="running"
        icon={<Loader2 className="size-3 animate-spin" />}
        label={`${display.active}…`}
        hint={hint}
      />
    );
  }

  if (
    part.state === "approval-requested" ||
    part.state === "approval-responded"
  ) {
    // The actionable card is rendered from the persisted `data-approval` part,
    // which carries the database id needed by /api/approvals/[id]. This pill
    // only marks the place in the transcript where the run stopped.
    return (
      <Pill
        tone="waiting"
        icon={<ShieldAlert className="size-3" />}
        label="Waiting for your approval"
        hint={hint}
      />
    );
  }

  if (part.state === "output-denied") {
    // The user rejected the gate. Shown, not hidden: the transcript has to
    // record that the agent asked and was told no, or the conversation reads
    // as if the action simply never happened.
    return (
      <Pill
        tone="done"
        icon={<Ban className="size-3" />}
        label={`${display.done} — rejected`}
        hint={hint}
      />
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="space-y-1">
        <Pill
          tone="error"
          icon={<AlertCircle className="size-3" />}
          label={`${display.done} failed`}
          hint={hint}
        />
        {part.errorText && (
          <p className="pl-1 text-xs text-destructive/80">{part.errorText}</p>
        )}
      </div>
    );
  }

  const summary = summariseResult(part.output);
  const expandable = summary.kind === "rows" || summary.kind === "raw";

  return (
    <div className="min-w-0 space-y-1.5">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((prev) => !prev)}
        className="max-w-full text-left disabled:cursor-default"
      >
        <Pill
          tone="done"
          icon={<Icon className="size-3" />}
          label={display.done}
          hint={
            summary.count != null
              ? `${summary.count} result${summary.count === 1 ? "" : "s"}`
              : summary.kind === "empty"
                ? "nothing found"
                : (summary.note ?? hint)
          }
        />
        {expandable && (
          <ChevronDown
            className={cn(
              "ml-1 inline size-3 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </button>

      {open && summary.kind === "rows" && (
        <ul className="space-y-1 rounded-xl border border-border bg-card/60 p-2">
          {summary.rows.map((row) => (
            <li key={row.key} className="min-w-0 px-1.5 py-1 text-xs">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {row.title}
                </span>
                {row.meta && (
                  <span className="shrink-0 text-[0.625rem] text-muted-foreground tabular-nums">
                    {row.meta}
                  </span>
                )}
                {row.href && (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              {row.subtitle && (
                <p className="truncate text-muted-foreground">{row.subtitle}</p>
              )}
            </li>
          ))}
          {summary.count != null && summary.count > summary.rows.length && (
            <li className="px-1.5 text-[0.625rem] text-muted-foreground">
              +{summary.count - summary.rows.length} more
            </li>
          )}
        </ul>
      )}

      {open && summary.kind === "raw" && summary.raw && (
        <pre className="scroll-region max-h-48 overflow-auto rounded-xl border border-border bg-card/60 p-2.5 font-mono text-[0.6875rem] leading-relaxed text-muted-foreground">
          {summary.raw}
        </pre>
      )}
    </div>
  );
}
