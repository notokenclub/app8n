"use client";

import { cn } from "cn";
import { Badge, Icon, IconTile, type IconName } from "@/ds";
import type { ExecutionStatus, TriggerType } from "@/lib/db/schema";
import type { ExecutionSummary } from "@/hooks/use-executions";

const TRIGGER_ICONS: Record<TriggerType, IconName> = {
  manual: "CheckMark",
  chat: "ChatWidget",
  cron: "Clock",
  webhook: "Link",
  gmail_poll: "Email",
};

/** Status maps onto the four badge tones the system defines, and nothing else. */
const STATUS_META: Record<
  ExecutionStatus,
  {
    label: string;
    icon: IconName;
    tone: "neutral" | "primary" | "success" | "danger";
  }
> = {
  running: { label: "running", icon: "Clock", tone: "primary" },
  awaiting_approval: {
    label: "awaiting approval",
    icon: "LockLocked",
    tone: "primary",
  },
  success: { label: "succeeded", icon: "CheckCircle", tone: "success" },
  failed: { label: "failed", icon: "Alert", tone: "danger" },
  cancelled: { label: "cancelled", icon: "Cross", tone: "neutral" },
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
    <ul className="space-y-space-xs">
      {runs.map((run) => {
        const status = STATUS_META[run.status];
        const took = duration(run.durationMs);
        const selected = selectedId === run.id;

        return (
          <li key={run.id}>
            <button
              type="button"
              onClick={() => onSelect(run)}
              className={cn(
                "w-full rounded-md border bg-canvas p-space-sm text-left transition-colors hover:border-border-strong",
                selected ? "border-primary" : "border-hairline",
              )}
            >
              <div className="flex items-start gap-space-sm">
                <IconTile
                  appearance="neutral"
                  size={32}
                  icon={
                    <Icon
                      name={TRIGGER_ICONS[run.trigger] ?? "Automation"}
                      size={16}
                    />
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-md font-medium text-ink">
                    {/* A chat run has no workflow, and calling that "Untitled"
                        would imply something was meant to be there. */}
                    {run.workflowTitle ?? "Chat session"}
                  </p>
                  <p className="truncate text-caption text-muted">
                    {when(run.createdAt)}
                    {took && ` · ${took}`}
                  </p>
                </div>
                <span className="shrink-0">
                  <Badge tone={status.tone}>
                    <span className="inline-flex items-center gap-space-xxs">
                      <Icon name={status.icon} size={16} />
                      {status.label}
                    </span>
                  </Badge>
                </span>
              </div>

              {run.error && (
                <p className="mt-space-xs line-clamp-2 text-caption leading-relaxed text-danger">
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
