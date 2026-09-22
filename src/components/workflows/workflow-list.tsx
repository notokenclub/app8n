"use client";

import { toast } from "sonner";
import { cn } from "cn";
import { Badge, Button, Icon, IconTile, TextBadge, type IconName } from "@/ds";
import { toolDisplay } from "@/lib/tool-display";
import {
  useSetWorkflowStatus,
  type WorkflowSummary,
} from "@/hooks/use-workflows";

const TRIGGER_ICONS: Record<string, IconName> = {
  manual: "CheckMark",
  chat: "ChatWidget",
  cron: "Clock",
  webhook: "Link",
  gmail_poll: "Email",
};

/** Blueprint state mapped onto the system's four badge tones. */
const STATUS_TONES: Record<string, "neutral" | "primary" | "success" | "danger"> =
  {
    active: "success",
    paused: "primary",
    draft: "neutral",
    archived: "neutral",
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

  return (
    <ul className="space-y-space-sm">
      {workflows.map((workflow) => {
        const triggerIcon = TRIGGER_ICONS[workflow.triggerType] ?? "Automation";
        const paused = workflow.status === "paused";
        const selected = selectedId === workflow.id;

        return (
          <li
            key={workflow.id}
            className={cn(
              "rounded-md border bg-canvas p-space-sm transition-colors",
              selected ? "border-primary" : "border-hairline",
              onSelect && "cursor-pointer hover:border-border-strong",
            )}
            onClick={() => onSelect?.(workflow)}
          >
            <div className="flex items-start gap-space-sm">
              <IconTile
                appearance="neutral"
                size={32}
                icon={<Icon name={triggerIcon} size={16} />}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-title-sm text-ink">
                  {workflow.title}
                </p>
                <p className="flex items-center gap-space-xs truncate text-caption text-muted">
                  {triggerLabel(workflow)}
                  <span aria-hidden>·</span>
                  {/* Whether the steps below are a suggestion or a script is
                      the difference between an automation that adapts and one
                      that repeats, and it is not guessable from the list. */}
                  <span
                    className="inline-flex items-center gap-space-xxs"
                    title={
                      workflow.isAgentic
                        ? "The agent follows these steps as a plan and adapts them to what it finds."
                        : "The agent runs these steps in order, without improvising."
                    }
                  >
                    <Icon
                      name={workflow.isAgentic ? "MagicWand" : "ListBulleted"}
                      size={16}
                    />
                    {workflow.isAgentic ? "Agentic" : "Fixed steps"}
                  </span>
                </p>
              </div>
              <span className="shrink-0">
                <Badge tone={STATUS_TONES[workflow.status] ?? "neutral"}>
                  {workflow.status}
                </Badge>
              </span>
            </div>

            {workflow.description && (
              <p className="mt-space-xs line-clamp-2 text-caption leading-relaxed text-body">
                {workflow.description}
              </p>
            )}

            {workflow.nodes.length > 0 && (
              <div className="mt-space-xs flex flex-wrap items-center gap-space-xxs">
                {workflow.nodes.slice(0, 5).map((node, index) => (
                  <TextBadge key={node.id ?? index} tone="neutral">
                    <span className="inline-flex max-w-full items-center gap-space-xxs">
                      <Icon
                        name={node.tool ? toolDisplay(node.tool).icon : "Automation"}
                        size={16}
                      />
                      <span className="truncate">
                        {node.label ??
                          (node.tool ? toolDisplay(node.tool).done : "Step")}
                      </span>
                    </span>
                  </TextBadge>
                ))}
                {workflow.nodes.length > 5 && (
                  <span className="text-legal text-muted">
                    +{workflow.nodes.length - 5}
                  </span>
                )}
              </div>
            )}

            <div className="mt-space-sm flex items-center gap-space-xs">
              <Button
                variant="secondary"
                size="sm"
                disabled={setStatus.isPending || workflow.status === "archived"}
                icon={
                  <Icon
                    name={
                      setStatus.isPending &&
                      setStatus.variables?.id === workflow.id
                        ? "Clock"
                        : paused
                          ? "ArrowRight"
                          : "Minus"
                    }
                    size={16}
                  />
                }
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
                {paused ? "Resume" : "Pause"}
              </Button>
              {workflow.lastRunAt && (
                <span className="shrink-0 text-legal text-muted">
                  Last run{" "}
                  {new Date(workflow.lastRunAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
