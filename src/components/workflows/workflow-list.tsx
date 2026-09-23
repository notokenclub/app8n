"use client";

import { toast } from "sonner";
import {
  CalendarClock,
  CircleDot,
  Hand,
  ListOrdered,
  Loader2,
  Mail,
  Pause,
  Play,
  Archive,
  ArchiveRestore,
  MoreVertical,
  Sparkles,
  Trash2,
  Webhook,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toolDisplay } from "@/lib/tool-display";
import {
  useDeleteWorkflow,
  useSetWorkflowStatus,
  type WorkflowSummary,
} from "@/hooks/use-workflows";

const TRIGGER_ICONS: Record<string, LucideIcon> = {
  manual: Hand,
  chat: CircleDot,
  cron: CalendarClock,
  webhook: Webhook,
  gmail_poll: Mail,
};

const STATUS_STYLES: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  paused: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  draft: "border-border bg-muted/50 text-muted-foreground",
  archived: "border-border bg-muted/50 text-muted-foreground",
};

function triggerLabel(workflow: WorkflowSummary): string {
  if (workflow.triggerType === "cron") {
    return workflow.cronExpression
      ? `Schedule · ${workflow.cronExpression}`
      : "Schedule";
  }
  if (workflow.triggerType === "gmail_poll") return "On new mail";
  if (workflow.triggerType === "webhook") return "Webhook";
  if (workflow.triggerType === "chat") return "From chat";
  return "Manual";
}

/**
 * The blueprint list.
 *
 * This is the canonical view on a phone and the summary rail on desktop, so
 * it carries the full story — trigger, steps, status — rather than being a
 * cut-down stand-in for the canvas. A user who never opens a desktop browser
 * should not be missing information.
 */
export function WorkflowList({
  workflows,
  selectedId,
  onSelect,
}: {
  workflows: WorkflowSummary[];
  selectedId?: string | null;
  onSelect?: (workflow: WorkflowSummary) => void;
}) {
  const setStatus = useSetWorkflowStatus();
  const remove = useDeleteWorkflow();

  return (
    <ul className="space-y-3">
      {workflows.map((workflow) => {
        const TriggerIcon = TRIGGER_ICONS[workflow.triggerType] ?? CircleDot;
        const paused = workflow.status === "paused";
        const archived = workflow.status === "archived";
        const selected = selectedId === workflow.id;

        return (
          <li
            key={workflow.id}
            className={cn(
              "rounded-2xl border bg-card p-3.5 transition-colors",
              selected ? "border-primary/50" : "border-border",
              onSelect && "cursor-pointer hover:border-primary/30",
            )}
            onClick={() => onSelect?.(workflow)}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <TriggerIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{workflow.title}</p>
                <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  {triggerLabel(workflow)}
                  <span aria-hidden>·</span>
                  {/* Whether the steps below are a suggestion or a script is
                      the difference between an automation that adapts and one
                      that repeats, and it is not guessable from the list. */}
                  <span
                    className="inline-flex items-center gap-1"
                    title={
                      workflow.isAgentic
                        ? "The agent follows these steps as a plan and adapts them to what it finds."
                        : "The agent runs these steps in order, without improvising."
                    }
                  >
                    {workflow.isAgentic ? (
                      <Sparkles className="size-3" />
                    ) : (
                      <ListOrdered className="size-3" />
                    )}
                    {workflow.isAgentic ? "Agentic" : "Fixed steps"}
                  </span>
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn("shrink-0", STATUS_STYLES[workflow.status])}
              >
                {workflow.status}
              </Badge>
            </div>

            {workflow.description && (
              <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {workflow.description}
              </p>
            )}

            {workflow.nodes.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {workflow.nodes.slice(0, 5).map((node, index) => {
                  const Icon = node.tool
                    ? toolDisplay(node.tool).icon
                    : CircleDot;
                  return (
                    <span
                      key={node.id ?? index}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[0.625rem] text-muted-foreground"
                    >
                      <Icon className="size-2.5 shrink-0" />
                      <span className="truncate">
                        {node.label ??
                          (node.tool ? toolDisplay(node.tool).done : "Step")}
                      </span>
                    </span>
                  );
                })}
                {workflow.nodes.length > 5 && (
                  <span className="text-[0.625rem] text-muted-foreground">
                    +{workflow.nodes.length - 5}
                  </span>
                )}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={setStatus.isPending || archived}
                onClick={(event) => {
                  event.stopPropagation();
                  setStatus.mutate(
                    { id: workflow.id, status: paused ? "active" : "paused" },
                    {
                      onSuccess: () =>
                        toast.success(
                          paused
                            ? `${workflow.title} resumed.`
                            : `${workflow.title} paused.`,
                        ),
                      onError: (error) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not update the blueprint.",
                        ),
                    },
                  );
                }}
              >
                {setStatus.isPending &&
                setStatus.variables?.id === workflow.id ? (
                  <Loader2 className="animate-spin" />
                ) : paused ? (
                  <Play />
                ) : (
                  <Pause />
                )}
                {paused ? "Resume" : "Pause"}
              </Button>
              {workflow.lastRunAt && (
                <span className="shrink-0 text-[0.625rem] text-muted-foreground">
                  Last run{" "}
                  {new Date(workflow.lastRunAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-label={`More actions for ${workflow.title}`}
                      className="shrink-0 text-muted-foreground"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MoreVertical />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  {/* Archiving is the reversible way to retire a blueprint:
                      the scheduler only ever loads `active`, so an archived
                      one stops running while its history stays attributed. */}
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      setStatus.mutate(
                        {
                          id: workflow.id,
                          status: archived ? "paused" : "archived",
                        },
                        {
                          onSuccess: () =>
                            toast.success(
                              archived
                                ? `${workflow.title} restored, still paused.`
                                : `${workflow.title} archived.`,
                            ),
                          onError: (error) =>
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Could not update the blueprint.",
                            ),
                        },
                      );
                    }}
                  >
                    {archived ? <ArchiveRestore /> : <Archive />}
                    {archived ? "Restore" : "Archive"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (
                        !window.confirm(
                          `Delete "${workflow.title}"? Its run history is deleted with it. Archive instead to keep both.`,
                        )
                      ) {
                        return;
                      }
                      remove.mutate(workflow.id, {
                        onSuccess: () =>
                          toast.success(`${workflow.title} deleted.`),
                        onError: (error) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not delete the blueprint.",
                          ),
                      });
                    }}
                  >
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
