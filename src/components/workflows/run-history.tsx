"use client";

import * as React from "react";
import { Badge, Divider, Icon, LogConsole, type IconName } from "@/ds";
import { Skeleton } from "@/components/ui/skeleton";
import { useExecutions, type ExecutionSummary } from "@/hooks/use-executions";
import { toolDisplay } from "@/lib/tool-display";
import type { ExecutionStatus, ExecutionStep } from "@/lib/db/schema";

const STATUS_TONES: Record<
  ExecutionStatus,
  "neutral" | "primary" | "success" | "danger"
> = {
  running: "primary",
  awaiting_approval: "primary",
  success: "success",
  failed: "danger",
  cancelled: "neutral",
};

const STATUS_LABELS: Record<ExecutionStatus, string> = {
  running: "Running",
  awaiting_approval: "Waiting for approval",
  success: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

const TRIGGER_ICONS: Record<string, IconName> = {
  manual: "CheckMark",
  chat: "ChatWidget",
  cron: "Clock",
  webhook: "Link",
  gmail_poll: "Email",
};

function duration(run: ExecutionSummary): string | null {
  if (run.durationMs == null) return null;
  if (run.durationMs < 1000) return `${run.durationMs} ms`;
  return `${(run.durationMs / 1000).toFixed(1)} s`;
}

function startedAt(run: ExecutionSummary): string {
  if (!run.startedAt) return "";
  return new Date(run.startedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** One step of the trace, as a line in the console view. */
function stepLine(step: ExecutionStep): {
  time: string;
  text: string;
  level: "info" | "warn" | "error";
} {
  const time = new Date(step.at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  switch (step.kind) {
    case "text":
      return { time, text: step.text, level: "info" };
    case "tool_call":
      return {
        time,
        text: `→ ${toolDisplay(step.toolName).active}  ${JSON.stringify(step.input).slice(0, 160)}`,
        level: "info",
      };
    case "tool_result":
      return {
        time,
        text: `← ${toolDisplay(step.toolName).done}  ${JSON.stringify(step.output).slice(0, 160)}`,
        level: "info",
      };
    case "approval_required":
      return {
        time,
        text: `paused for approval: ${toolDisplay(step.toolName).active}`,
        level: "warn",
      };
    case "error":
      return { time, text: step.message, level: "error" };
    default:
      return { time, text: JSON.stringify(step), level: "info" };
  }
}

function RunRow({ run }: { run: ExecutionSummary }) {
  const [open, setOpen] = React.useState(false);
  const lines = run.steps.map(stepLine);
  const took = duration(run);

  return (
    <li className="rounded-md border border-hairline bg-canvas p-space-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-start gap-space-sm text-left"
      >
        <span className="mt-space-xxs shrink-0 text-muted">
          <Icon name={TRIGGER_ICONS[run.trigger] ?? "Automation"} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-space-xs">
            <span className="min-w-0 flex-1 truncate text-body-md font-medium text-ink">
              {run.workflowTitle ?? "Chat run"}
            </span>
            <Badge tone={STATUS_TONES[run.status]}>
              {STATUS_LABELS[run.status]}
            </Badge>
          </span>
          {/* Built as a list so a run with no recorded start time does not
              render a leading separator with nothing before it. */}
          <span className="mt-space-xxs flex flex-wrap items-center gap-space-xs text-caption text-muted">
            {[
              startedAt(run),
              took,
              `${run.steps.length} step${run.steps.length === 1 ? "" : "s"}`,
            ]
              .filter(Boolean)
              .map((part, index) => (
                <React.Fragment key={part}>
                  {index > 0 && <span aria-hidden>·</span>}
                  {part}
                </React.Fragment>
              ))}
          </span>
        </span>
        <span
          className={`mt-space-xxs shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <Icon name="ChevronDown" size={16} />
        </span>
      </button>

      {run.error && (
        <p className="mt-space-xs text-caption text-danger">{run.error}</p>
      )}

      {open && (
        <div className="mt-space-sm space-y-space-xs">
          <Divider tone="hairline" />
          {lines.length > 0 ? (
            <div className="scroll-region max-h-80 overflow-auto">
              <LogConsole lines={lines} />
            </div>
          ) : (
            <p className="text-caption text-muted">
              This run recorded no steps.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The run history.
 *
 * `execution_logs.steps_json` has always captured a full trace — what the
 * agent said, every tool call and result, where it paused for approval — and
 * until now nothing rendered it, so a scheduled run that failed at 7am left no
 * account of itself anywhere in the product.
 */
export function RunHistory() {
  const { data, isLoading, isError, error } = useExecutions();

  if (isLoading) {
    return (
      <div className="space-y-space-sm">
        <Skeleton className="h-20 rounded-md" />
        <Skeleton className="h-20 rounded-md" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-body-md text-danger">
        {error instanceof Error ? error.message : "Could not load run history."}
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-body-md text-muted">
        No runs yet. Ask for something in chat, or run an automation from the
        blueprints tab.
      </p>
    );
  }

  return (
    <ul className="space-y-space-sm">
      {data.map((run) => (
        <RunRow key={run.id} run={run} />
      ))}
    </ul>
  );
}
