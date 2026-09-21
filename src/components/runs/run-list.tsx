"use client";

import {
  CalendarClock,
  CircleCheckBig,
  CircleDot,
  CircleSlash,
  Hand,
  Loader2,
  Mail,
  MessagesSquare,
  ShieldAlert,
  TriangleAlert,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { ExecutionStatus, TriggerType } from "@/lib/db/schema";
import type { ExecutionSummary } from "@/hooks/use-executions";

const TRIGGER_ICONS: Record<TriggerType, LucideIcon> = {
  manual: Hand,
  chat: MessagesSquare,
  cron: CalendarClock,
  webhook: Webhook,
  gmail_poll: Mail,
};

const STATUS_META: Record<
  ExecutionStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  running: {
    label: "running",
    icon: Loader2,
    className: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  awaiting_approval: {
    label: "awaiting approval",
    icon: ShieldAlert,
    className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  success: {
    label: "success",
    icon: CircleCheckBig,
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  failed: {
    label: "failed",
    icon: TriangleAlert,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  cancelled: {
    label: "cancelled",
    icon: CircleSlash,
    className: "border-border bg-muted/50 text-muted-foreground",
  },
};

function duration(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RunList({
  runs,
  selectedId,
  onSelect,
}: {
  runs: ExecutionSummary[];
  selectedId?: string | null;
  onSelect: (run: ExecutionSummary) => void;
}) {
  return (
    <ul className="space-y-2">
      {runs.map((run) => {
        const status = STATUS_META[run.status];
        const TriggerIcon = TRIGGER_ICONS[run.trigger] ?? CircleDot;
        const took = duration(run.durationMs);
        const selected = selectedId === run.id;

        return (
          <li key={run.id}>
            <button
              type="button"
              onClick={() => onSelect(run)}
              className={cn(
                "w-full rounded-2xl border bg-card p-3.5 text-left transition-colors hover:border-primary/30",
                selected ? "border-primary/50" : "border-border",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <TriggerIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {/* A chat run has no workflow, and calling that "Untitled"
                        would imply something was meant to be there. */}
                    {run.workflowTitle ?? "Chat session"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {when(run.createdAt)}
                    {took && ` · ${took}`}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn("shrink-0 gap-1", status.className)}
                >
                  <status.icon
                    className={cn(
                      "size-3",
                      run.status === "running" && "animate-spin",
                    )}
                  />
                  {status.label}
                </Badge>
              </div>

              {run.error && (
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-destructive">
                  {run.error}
                </p>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
