"use client";

import { ShieldCheck } from "lucide-react";
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

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-3 p-4">
        {isLoading && (
          <>
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </>
        )}

        {isError && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Could not load pending approvals."}
          </p>
        )}

        {data?.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <ShieldCheck className="size-6" />
            </span>
            <div>
              <p className="text-sm font-medium">Nothing waiting</p>
              <p className="mt-1 text-xs text-muted-foreground">
                High-impact actions — sending mail, deleting events, editing
                docs — will land here before they run.
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
