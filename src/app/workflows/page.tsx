"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Icon, IconTile } from "@/ds";
import { PageHeader } from "@/components/shell/page-header";
import { WorkflowList } from "@/components/workflows/workflow-list";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useWorkflows, type WorkflowSummary } from "@/hooks/use-workflows";

/**
 * React Flow measures the DOM on mount and ships a large amount of code that
 * a phone never renders, so it is loaded on the client only and only once the
 * viewport is actually wide enough to show it.
 */
const WorkflowCanvas = dynamic(
  () => import("@/components/workflows/workflow-canvas"),
  {
    ssr: false,
    loading: () => <Skeleton className="size-full rounded-none" />,
  },
);

function Body() {
  const { data, isLoading } = useWorkflows();
  const isDesktop = useIsDesktop();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const selected: WorkflowSummary | null =
    data?.find((workflow) => workflow.id === selectedId) ?? data?.[0] ?? null;

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-space-sm p-space-md">
        <Skeleton className="h-40 rounded-md" />
        <Skeleton className="h-40 rounded-md" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-space-sm px-space-lg py-space-xxl text-center">
        <IconTile
          appearance="neutral"
          size={48}
          icon={<Icon name="DataFlow" size={16} />}
        />
        <div>
          <p className="font-display text-title-sm text-ink">
            No blueprints yet
          </p>
          <p className="mt-space-xxs max-w-sm text-caption text-muted">
            Ask in chat for something to happen on a schedule — &ldquo;every
            Monday at 8am, summarise my unread mail&rdquo; — and it will be
            saved here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className={
          isDesktop
            ? "scroll-region w-80 shrink-0 overflow-y-auto border-r border-border p-space-md"
            : "mx-auto w-full max-w-2xl p-space-md"
        }
      >
        <WorkflowList
          workflows={data}
          selectedId={isDesktop ? selected?.id : null}
          onSelect={
            isDesktop ? (workflow) => setSelectedId(workflow.id) : undefined
          }
        />
      </div>

      {/* The canvas is desktop-only: pinch-zooming a node graph on a
          320px screen is worse than the list it would replace. */}
      {isDesktop && selected && (
        <div className="min-w-0 flex-1">
          <WorkflowCanvas workflow={selected} />
        </div>
      )}
    </div>
  );
}

export default function WorkflowsPage() {
  return (
    <>
      <PageHeader
        title="Blueprints"
        subtitle="Saved and scheduled automations"
      />
      <Body />
    </>
  );
}
