"use client";

import * as React from "react";
import { cn } from "cn";
import { Icon, LogConsole, TextBadge, type IconName } from "@/ds";
import type { ExecutionStep } from "@/lib/db/schema";
import { toolDisplay } from "@/lib/tool-display";
import { summariseResult } from "@/lib/tool-result";

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function StepRow({
  icon,
  tone,
  title,
  detail,
  at,
  children,
}: {
  icon: IconName;
  tone?: "error" | "warning";
  title: string;
  detail?: string;
  at: number;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-space-sm pb-space-md last:pb-0">
      {/* The rail is drawn per row rather than as one absolute element so the
          list stays correct when a row wraps to two lines. */}
      <span
        aria-hidden
        className="absolute top-7 bottom-0 left-[0.6875rem] w-px bg-hairline"
      />
      <span
        className={cn(
          "relative z-10 mt-space-xxs flex size-6 shrink-0 items-center justify-center rounded-full border bg-canvas",
          tone === "error"
            ? "border-danger text-danger"
            : tone === "warning"
              ? "border-primary text-primary"
              : "border-hairline text-muted",
        )}
      >
        <Icon name={icon} size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-space-xs">
          <p className="min-w-0 flex-1 text-body-md font-medium text-ink">
            {title}
          </p>
          <span className="shrink-0 text-legal tabular-nums text-muted">
            {timeOf(at)}
          </span>
        </div>
        {detail && (
          <p className="mt-space-xxs text-caption leading-relaxed whitespace-pre-wrap text-body">
            {detail}
          </p>
        )}
        {children}
      </div>
    </li>
  );
}

function ResultPreview({ output }: { output: unknown }) {
  const [open, setOpen] = React.useState(false);
  const summary = summariseResult(output);

  if (summary.kind === "empty") {
    return <p className="mt-space-xxs text-caption text-muted">No results.</p>;
  }

  if (summary.kind === "note") {
    return (
      <p className="mt-space-xxs text-caption leading-relaxed text-muted">
        {summary.note}
      </p>
    );
  }

  if (summary.kind === "raw") {
    return (
      <div className="mt-space-xxs">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-space-xxs text-caption text-muted hover:text-foreground"
        >
          <span className={cn("inline-flex transition-transform", open && "rotate-180")}>
            <Icon name="ChevronDown" size={16} />
          </span>
          {open ? "Hide" : "Show"} raw result
        </button>
        {/* Machine output goes in the system's log console rather than a
            styled <pre>: same face, same surface as the worker's own logs. */}
        {open && (
          <div className="scroll-region mt-space-xxs max-h-56 overflow-auto">
            <LogConsole
              lines={(summary.raw ?? "")
                .split("\n")
                .map((text) => ({ time: "", text, level: "info" as const }))}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <ul className="mt-space-xxs space-y-space-xxs">
      {summary.rows.map((row) => (
        <li
          key={row.key}
          className="rounded-sm border border-hairline bg-surface-soft px-space-xs py-space-xxs"
        >
          <p className="truncate text-caption font-medium text-ink">
            {row.title}
          </p>
          {row.subtitle && (
            <p className="truncate text-legal text-muted">{row.subtitle}</p>
          )}
        </li>
      ))}
      {summary.count !== undefined && summary.count > summary.rows.length && (
        <li className="text-legal text-muted">
          +{summary.count - summary.rows.length} more
        </li>
      )}
    </ul>
  );
}

/**
 * Renders `execution_logs.steps_json`.
 *
 * The trace was captured from the first run onwards and never shown anywhere,
 * which made every failed overnight job a dead end — the status said "failed"
 * and the reason lived in a column no screen read. This is that screen.
 */
export function RunTrace({ steps }: { steps: ExecutionStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="px-space-xxs py-space-lg text-center text-caption text-muted">
        This run recorded no steps.
      </p>
    );
  }

  return (
    <ol className="space-y-0">
      {steps.map((step, index) => {
        const key = `${index}-${step.at}`;

        if (step.kind === "text") {
          return (
            <StepRow
              key={key}
              icon="Comment"
              title="Agent said"
              detail={step.text}
              at={step.at}
            />
          );
        }

        if (step.kind === "tool_call") {
          return (
            <StepRow
              key={key}
              icon={toolDisplay(step.toolName).icon}
              title={toolDisplay(step.toolName).active}
              at={step.at}
            />
          );
        }

        if (step.kind === "tool_result") {
          return (
            <StepRow
              key={key}
              icon="CheckCircle"
              title={toolDisplay(step.toolName).done}
              at={step.at}
            >
              <ResultPreview output={step.output} />
            </StepRow>
          );
        }

        if (step.kind === "approval_required") {
          return (
            <StepRow
              key={key}
              icon="LockLocked"
              tone="warning"
              title="Paused for approval"
              detail={toolDisplay(step.toolName).done}
              at={step.at}
            >
              <span className="mt-space-xxs inline-flex">
                <TextBadge tone="primary">human decision</TextBadge>
              </span>
            </StepRow>
          );
        }

        return (
          <StepRow
            key={key}
            icon="Alert"
            tone="error"
            title="Error"
            detail={step.message}
            at={step.at}
          />
        );
      })}
    </ol>
  );
}
