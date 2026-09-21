"use client";

import * as React from "react";
import { History, X } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { RunList } from "@/components/runs/run-list";
import { RunTrace } from "@/components/runs/run-trace";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useExecution, useExecutions } from "@/hooks/use-executions";

function RunDetail({
  runId,
  onClose,
}: {
  runId: string;
  onClose?: () => void;
}) {
  const { data, isLoading } = useExecution(runId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {data?.workflowTitle ?? "Chat session"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {data ? `${data.trigger} · ${data.status}` : "Loading…"}
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="xs" onClick={onClose}>
            <X />
          </Button>
        )}
      </div>

      <div className="scroll-region min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : (
          <>
            {data.error && (
              <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs leading-relaxed text-destructive">
                {data.error}
              </p>
            )}
            <RunTrace steps={data.steps} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Run history.
 *
 * Two panes on desktop, list-then-detail on a phone: a trace is long enough
 * that showing it beside a list on a 320px screen would leave neither usable.
 */
export default function RunsPage() {
  const { data, isLoading } = useExecutions();
  const isDesktop = useIsDesktop();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const selected = isDesktop
    ? (data?.find((run) => run.id === selectedId) ?? data?.[0] ?? null)
    : (data?.find((run) => run.id === selectedId) ?? null);

  // On a phone the detail takes over the screen entirely.
  if (!isDesktop && selected) {
    return (
      <>
        <PageHeader title="Run" subtitle="What the agent actually did" />
        <RunDetail runId={selected.id} onClose={() => setSelectedId(null)} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Activity" subtitle="Every run, and what it did" />

      {isLoading ? (
        <div className="mx-auto w-full max-w-2xl space-y-3 p-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : data && data.length > 0 ? (
        <div className="flex min-h-0 flex-1">
          <div
            className={
              isDesktop
                ? "scroll-region w-96 shrink-0 overflow-y-auto border-r border-border p-4"
                : "mx-auto w-full max-w-2xl p-4"
            }
          >
            <RunList
              runs={data}
              selectedId={isDesktop ? selected?.id : null}
              onSelect={(run) => setSelectedId(run.id)}
            />
          </div>

          {isDesktop && selected && (
            <div className="flex min-w-0 flex-1 flex-col">
              <RunDetail runId={selected.id} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <History className="size-6" />
          </span>
          <div>
            <p className="text-sm font-medium">No runs yet</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Every chat and every scheduled automation records what it did
              here — the tools it called, the results it got, and where it
              stopped.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
