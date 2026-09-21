"use client";

import * as React from "react";
import {
  AlertCircle,
  ChevronDown,
  CircleCheckBig,
  MessageSquareText,
  ShieldAlert,
} from "lucide-react";
import { cn } from "cn";
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
  icon: Icon,
  tone,
  title,
  detail,
  at,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: "error" | "warning";
  title: string;
  detail?: string;
  at: number;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {/* The rail is drawn per row rather than as one absolute element so the
          list stays correct when a row wraps to two lines. */}
      <span
        aria-hidden
        className="absolute top-7 bottom-0 left-[0.6875rem] w-px bg-border"
      />
      <span
        className={cn(
          "relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card",
          tone === "error"
            ? "border-destructive/40 text-destructive"
            : tone === "warning"
              ? "border-amber-500/40 text-amber-400"
              : "border-border text-muted-foreground",
        )}
      >
        <Icon className="size-3" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium">{title}</p>
          <span className="shrink-0 text-[0.625rem] tabular-nums text-muted-foreground">
            {timeOf(at)}
          </span>
        </div>
        {detail && (
          <p className="mt-0.5 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
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
    return <p className="mt-1 text-xs text-muted-foreground">No results.</p>;
  }

  if (summary.kind === "note") {
    return (
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {summary.note}
      </p>
    );
  }

  if (summary.kind === "raw") {
    return (
      <div className="mt-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn("size-3 transition-transform", open && "rotate-180")}
          />
          {open ? "Hide" : "Show"} raw result
        </button>
        {open && (
          <pre className="mt-1 max-h-56 overflow-auto rounded-lg border border-border bg-muted/40 p-2 text-[0.625rem] leading-relaxed">
            {summary.raw}
          </pre>
        )}
      </div>
    );
  }

  return (
    <ul className="mt-1 space-y-1">
      {summary.rows.map((row) => (
        <li
          key={row.key}
          className="rounded-lg border border-border bg-muted/30 px-2 py-1.5"
        >
          <p className="truncate text-xs font-medium">{row.title}</p>
          {row.subtitle && (
            <p className="truncate text-[0.625rem] text-muted-foreground">
              {row.subtitle}
            </p>
          )}
        </li>
      ))}
      {summary.count !== undefined && summary.count > summary.rows.length && (
        <li className="text-[0.625rem] text-muted-foreground">
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
      <p className="px-1 py-6 text-center text-xs text-muted-foreground">
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
              icon={MessageSquareText}
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
              icon={CircleCheckBig}
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
              icon={ShieldAlert}
              tone="warning"
              title="Paused for approval"
              detail={toolDisplay(step.toolName).done}
              at={step.at}
            />
          );
        }

        return (
          <StepRow
            key={key}
            icon={AlertCircle}
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
