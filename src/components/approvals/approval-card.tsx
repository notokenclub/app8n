"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge, Button, Divider, Icon, IconTile } from "@/ds";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/client-api";
import { describeAction, formatValue, parseEditedValue } from "@/lib/approval-format";
import { toolDisplay } from "@/lib/tool-display";
import { useResolveApproval } from "@/hooks/use-approvals";
import { useNow } from "@/hooks/use-now";
import { SwipeConfirm } from "./swipe-confirm";

export interface ApprovalCardData {
  id: string;
  action: string;
  parameters: Record<string, unknown>;
  summary?: string | null;
  createdAt?: string;
  expiresAt?: string | null;
}

/** "in 4 min" / "12 min ago", without pulling in a date library. */
function relativeTime(iso: string, now: number): string {
  const delta = new Date(iso).getTime() - now;
  const abs = Math.abs(delta);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return delta < 0 ? "just now" : "in a moment";
  const value =
    minutes < 60
      ? `${minutes} min`
      : minutes < 1440
        ? `${Math.round(minutes / 60)} h`
        : `${Math.round(minutes / 1440)} d`;
  return delta < 0 ? `${value} ago` : `in ${value}`;
}

/**
 * The confirmation card that stands between the agent and an irreversible
 * action. Rendered both inline in the chat stream and on `/approvals`, from
 * one component so the two surfaces cannot drift into showing the user
 * different things about the same pending action.
 */
export function ApprovalCard({
  approval,
  onResolved,
  className,
}: {
  approval: ApprovalCardData;
  onResolved?: (approved: boolean) => void;
  className?: string;
}) {
  const resolve = useResolveApproval();
  const now = useNow();
  const display = toolDisplay(approval.action);
  const description = React.useMemo(
    () => describeAction(approval.action, approval.parameters),
    [approval.action, approval.parameters],
  );

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [settled, setSettled] = React.useState<"approved" | "rejected" | null>(
    null,
  );
  const [gone, setGone] = React.useState<string | null>(null);

  const startEditing = () => {
    setDraft(
      Object.fromEntries(
        Object.entries(approval.parameters).map(([key, value]) => [
          key,
          formatValue(value),
        ]),
      ),
    );
    setEditing(true);
  };

  const submit = (approved: boolean) => {
    // Only send parameters on the edit path. Sending them unconditionally would
    // mean a round-trip through string formatting for every approval, and any
    // lossy field would silently rewrite an action the user never touched.
    const parameters =
      approved && editing
        ? Object.fromEntries(
            Object.entries(draft).map(([key, value]) => [
              key,
              parseEditedValue(approval.parameters[key], value),
            ]),
          )
        : undefined;

    resolve.mutate(
      { id: approval.id, approved, parameters },
      {
        onSuccess: (result) => {
          setEditing(false);
          setSettled(approved ? "approved" : "rejected");
          if (approved) {
            toast.success(
              result.error
                ? `Approved, but the action failed: ${result.error}`
                : `${display.done}.`,
            );
          } else {
            toast.info("Action rejected. The run was cancelled.");
          }
          onResolved?.(approved);
        },
        onError: (error) => {
          // 409/410 mean the gate is no longer actionable — most likely it was
          // resolved on another device or it timed out. Retrying cannot help,
          // so the card retires itself instead of offering dead buttons.
          if (error instanceof ApiError && error.status === 409) {
            setGone("Already resolved somewhere else.");
          } else if (error instanceof ApiError && error.status === 410) {
            setGone("This request expired before it was approved.");
          } else {
            toast.error(
              error instanceof Error ? error.message : "Could not resolve this.",
            );
          }
        },
      },
    );
  };

  if (gone) {
    return (
      <div
        className={cn(
          "flex items-center gap-space-xs rounded-md border border-border bg-surface-soft px-space-sm py-space-xs text-body-md text-muted",
          className,
        )}
      >
        <Icon name="Cross" size={16} />
        {gone}
      </div>
    );
  }

  if (settled) {
    return (
      <div
        className={cn(
          "flex items-center gap-space-xs rounded-md border border-border px-space-sm py-space-xs text-body-md",
          settled === "approved"
            ? "bg-canvas text-success"
            : "bg-surface-soft text-muted",
          className,
        )}
      >
        <Icon name={settled === "approved" ? "CheckCircle" : "Cross"} size={16} />
        {settled === "approved" ? display.done : "Rejected"}
      </div>
    );
  }

  // `now === 0` means the clock has not started (server render / hydration),
  // so no time-relative text is emitted and the markup matches on both sides.
  const expiresSoon =
    now > 0 &&
    approval.expiresAt != null &&
    new Date(approval.expiresAt).getTime() - now < 10 * 60_000;

  return (
    <div
      className={cn(
        // A flame-subtle colour block, not a shadow: this is the one thing on
        // screen that must not be skimmed past, and the system builds emphasis
        // out of colour blocks.
        "overflow-hidden rounded-md border border-primary bg-primary-subtle",
        className,
      )}
    >
      <div className="flex items-start gap-space-sm border-b border-hairline px-space-md py-space-sm">
        <IconTile
          appearance="ember"
          size={32}
          icon={<Icon name="LockLocked" size={16} />}
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-title-sm text-ink">
            Needs your approval
          </p>
          <p className="truncate text-caption text-body">
            {approval.summary || description.headline}
          </p>
        </div>
        <span className="shrink-0">
          <Badge tone="primary">
            <span className="inline-flex items-center gap-space-xxs">
              <Icon name={display.icon} size={16} />
              {display.active}
            </span>
          </Badge>
        </span>
      </div>

      <div className="space-y-space-sm bg-canvas px-space-md py-space-sm">
        {description.fields.length === 0 && (
          <p className="text-body-md text-muted">
            This action takes no parameters.
          </p>
        )}

        {description.fields.map((field) =>
          editing ? (
            <label key={field.key} className="block space-y-space-xxs">
              <span className="text-caption font-medium text-muted">
                {field.label}
              </span>
              <Textarea
                value={draft[field.key] ?? ""}
                rows={field.kind === "body" ? 5 : 1}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    [field.key]: event.target.value,
                  }))
                }
                className={cn(field.kind === "inline" && "min-h-9 py-space-xxs")}
              />
            </label>
          ) : (
            <div
              key={field.key}
              className={cn(
                field.kind === "inline" &&
                  "flex items-baseline gap-space-sm text-body-md",
              )}
            >
              <span
                className={cn(
                  "text-caption font-medium text-muted",
                  field.kind === "inline" && "w-20 shrink-0",
                )}
              >
                {field.label}
              </span>
              {field.kind === "body" ? (
                <p className="scroll-region mt-space-xxs max-h-40 overflow-y-auto rounded-sm border border-hairline bg-surface-soft px-space-sm py-space-xs text-body-md leading-relaxed whitespace-pre-wrap text-ink">
                  {field.value}
                </p>
              ) : (
                <span className="min-w-0 flex-1 break-words text-ink">
                  {field.value}
                </span>
              )}
            </div>
          ),
        )}

        {expiresSoon && approval.expiresAt && (
          <p className="flex items-center gap-space-xs text-caption text-danger">
            <Icon name="Alert" size={16} />
            Expires {relativeTime(approval.expiresAt, now)}
          </p>
        )}
      </div>

      <Divider tone="hairline" />

      <div className="space-y-space-xs bg-canvas px-space-md py-space-sm">
        <SwipeConfirm
          label={editing ? "Swipe to send edited" : "Swipe to approve"}
          confirmedLabel="Approved"
          pending={resolve.isPending && resolve.variables?.approved === true}
          disabled={resolve.isPending}
          onConfirm={() => submit(true)}
        />
        <div className="flex gap-space-xs [&>*]:flex-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={resolve.isPending}
            onClick={() => (editing ? setEditing(false) : startEditing())}
            icon={<Icon name={editing ? "Cross" : "Edit"} size={16} />}
          >
            {editing ? "Discard edits" : "Edit parameters"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={resolve.isPending}
            onClick={() => submit(false)}
            icon={<Icon name="CrossCircle" size={16} />}
          >
            Reject
          </Button>
        </div>
        {approval.createdAt && now > 0 && (
          <p className="text-center text-legal text-muted">
            Requested {relativeTime(approval.createdAt, now)}
          </p>
        )}
      </div>
    </div>
  );
}
