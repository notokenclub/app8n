"use client";

import * as React from "react";
import { Icon, IconButton, IconTile, SectionMessage } from "@/ds";
import { PageHeader } from "@/components/shell/page-header";
import { RunList } from "@/components/runs/run-list";
import { RunTrace } from "@/components/runs/run-trace";
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
      <div className="flex items-center gap-space-xs border-b border-border px-space-md py-space-sm">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-md font-medium text-ink">
            {data?.workflowTitle ?? "Chat session"}
          </p>
          <p className="truncate text-caption text-muted">
            {data ? `${data.trigger} · ${data.status}` : "Loading"}
          </p>
        </div>
        {onClose && (
          <IconButton
            type="button"
            variant="square"
            size={32}
            aria-label="Close this run"
            onClick={onClose}
            icon={<Icon name="Cross" size={16} />}
          />
        )}
      </div>

      <div className="scroll-region min-h-0 flex-1 overflow-y-auto p-space-md">
        {isLoading || !data ? (
          <div className="space-y-space-sm">
            <Skeleton className="h-12 rounded-md" />
            <Skeleton className="h-12 rounded-md" />
            <Skeleton className="h-12 rounded-md" />
          </div>
        ) : (
          <>
            {data.error && (
              <div className="mb-space-md">
                <SectionMessage
                  appearance="danger"
                  title="This run failed"
                  IconComponent={Icon}
                >
                  {data.error}
                </SectionMessage>
              </div>
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
        <div className="mx-auto w-full max-w-2xl space-y-space-sm p-space-md">
          <Skeleton className="h-24 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
        </div>
      ) : data && data.length > 0 ? (
        <div className="flex min-h-0 flex-1">
          <div
            className={
              isDesktop
                ? "scroll-region w-96 shrink-0 overflow-y-auto border-r border-border p-space-md"
                : "mx-auto w-full max-w-2xl p-space-md"
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
        <div className="flex flex-1 flex-col items-center justify-center gap-space-sm px-space-lg py-space-xxl text-center">
          <IconTile
            appearance="neutral"
            size={48}
            icon={<Icon name="Clock" size={16} />}
          />
          <div>
            <p className="font-display text-title-sm text-ink">No runs yet</p>
            <p className="mt-space-xxs max-w-sm text-caption text-muted">
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
