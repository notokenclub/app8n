"use client";

import { Icon, IconTile, SectionMessage } from "@/ds";
import { ApprovalCard } from "@/components/approvals/approval-card";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { usePendingApprovals } from "@/hooks/use-approvals";

/**
 * The queue of actions the agent has stopped in front of.
 *
 * A dedicated page as well as the inline chat card, because a gate opened by
 * the background scheduler has no chat thread to appear in — without this list
 * a scheduled workflow could sit blocked forever with nothing on screen to say
 * so.
 */
export default function ApprovalsPage() {
  const { data, isLoading, isError, error } = usePendingApprovals();

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle={
          data?.length
            ? `${data.length} action${data.length === 1 ? "" : "s"} waiting on you`
            : "Actions the agent paused before running"
        }
      />

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-space-sm p-space-md">
        {isLoading && (
          <>
            <Skeleton className="h-64 rounded-md" />
            <Skeleton className="h-64 rounded-md" />
          </>
        )}

        {isError && (
          <SectionMessage
            appearance="danger"
            title="Could not load pending approvals"
            IconComponent={Icon}
          >
            {error instanceof Error ? error.message : "The request failed."}
          </SectionMessage>
        )}

        {data?.length === 0 && (
          <div className="flex flex-col items-center gap-space-sm py-space-xxl text-center">
            <IconTile
              appearance="neutral"
              size={48}
              icon={<Icon name="Inbox" size={16} />}
            />
            <div>
              <p className="font-display text-title-sm text-ink">
                Nothing waiting
              </p>
              <p className="mt-space-xxs text-caption text-muted">
                High-impact actions — sending mail, deleting events, editing
                docs — land here before they run.
              </p>
            </div>
          </div>
        )}

        {data?.map((approval) => (
          <ApprovalCard key={approval.id} approval={approval} />
        ))}
      </div>
    </>
  );
}
