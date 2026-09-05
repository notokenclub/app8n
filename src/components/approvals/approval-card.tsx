"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  Check,
  Pencil,
  RotateCcw,
  ShieldAlert,
  X,
} from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
          "flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground",
          className,
        )}
      >
        <Ban className="size-4 shrink-0" />
        {gone}
      </div>
    );
  }

  if (settled) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm",
          settled === "approved"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-border bg-muted/40 text-muted-foreground",
          className,
        )}
      >
        {settled === "approved" ? (
          <Check className="size-4 shrink-0" />
        ) : (
          <X className="size-4 shrink-0" />
        )}
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
        // Amber framing, not the app's neutral card surface: this is the one
        // thing on screen that must not be skimmed past.
        "overflow-hidden rounded-2xl border border-amber-500/40 bg-amber-500/[0.06] shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
          <ShieldAlert className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-100">
            Needs your approval
          </p>
          <p className="truncate text-xs text-amber-200/70">
            {approval.summary || description.headline}
          </p>
        </div>
        <Badge
          variant="outline"
          className="shrink-0 border-amber-500/30 text-amber-200"
        >
          <display.icon />
          {description.title}
        </Badge>
      </div>

      <div className="space-y-3 px-4 py-3">
        {description.fields.length === 0 && (
          <p className="text-sm text-muted-foreground">
            This action takes no parameters.
          </p>
        )}

        {description.fields.map((field) =>
          editing ? (
            <label key={field.key} className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
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
                className={cn(
                  "bg-background/60",
                  field.kind === "inline" && "min-h-9 py-1.5",
                )}
              />
            </label>
          ) : (
            <div
              key={field.key}
              className={cn(
                field.kind === "inline" &&
                  "flex items-baseline gap-3 text-sm leading-6",
              )}
            >
              <span
                className={cn(
                  "text-xs font-medium text-muted-foreground",
                  field.kind === "inline" && "w-20 shrink-0",
                )}
              >
                {field.label}
              </span>
              {field.kind === "body" ? (
                <p className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground scroll-region">
                  {field.value}
                </p>
              ) : (
                <span className="min-w-0 flex-1 break-words text-foreground">
                  {field.value}
                </span>
              )}
            </div>
          ),
        )}

        {expiresSoon && approval.expiresAt && (
          <p className="flex items-center gap-1.5 text-xs text-amber-300">
            <AlertTriangle className="size-3.5" />
            Expires {relativeTime(approval.expiresAt, now)}
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-amber-500/20 px-4 py-3">
        <SwipeConfirm
          label={editing ? "Swipe to send edited" : "Swipe to approve"}
          confirmedLabel="Approved"
          pending={resolve.isPending && resolve.variables?.approved === true}
          disabled={resolve.isPending}
          onConfirm={() => submit(true)}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            disabled={resolve.isPending}
            onClick={() => (editing ? setEditing(false) : startEditing())}
          >
            {editing ? <RotateCcw /> : <Pencil />}
            {editing ? "Discard edits" : "Edit parameters"}
          </Button>
          <Button
            variant="destructive"
            size="lg"
            className="flex-1"
            disabled={resolve.isPending}
            onClick={() => submit(false)}
          >
            <X />
            Reject
          </Button>
        </div>
        {approval.createdAt && now > 0 && (
          <p className="text-center text-[0.625rem] text-muted-foreground">
            Requested {relativeTime(approval.createdAt, now)}
          </p>
        )}
      </div>
    </div>
  );
}
