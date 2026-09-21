"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, Loader2, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAnthropicKey,
  useClearAnthropicKey,
  useSaveAnthropicKey,
} from "@/hooks/use-settings";

/**
 * Entry point for the user's own Anthropic key.
 *
 * The field is write-only by design: the server returns a masked hint and
 * never the key itself, so nothing here can be read back out of the vault
 * through the UI. Saving verifies the key with a one-token call before it is
 * written, so a mistyped key fails on this screen instead of silently
 * breaking a scheduled workflow at 6am.
 */
export function AnthropicKeyField() {
  const { data, isLoading } = useAnthropicKey();
  const save = useSaveAnthropicKey();
  const clear = useClearAnthropicKey();
  const [value, setValue] = React.useState("");

  if (isLoading) return <Skeleton className="h-28 rounded-2xl" />;

  const submit = () => {
    const key = value.trim();
    if (!key) return;
    save.mutate(key, {
      onSuccess: () => {
        setValue("");
        toast.success("Key verified and stored in the vault.");
      },
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not save the key.",
        ),
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-3.5">
      {data?.source === "vault" && (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
          <span className="min-w-0 flex-1">
            Key stored in the vault
            <span className="ml-1.5 font-mono text-xs text-muted-foreground">
              {data.hint}
            </span>
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove key"
            disabled={clear.isPending}
            onClick={() =>
              clear.mutate(undefined, {
                onSuccess: () => toast.info("Key removed from the vault."),
              })
            }
          >
            {clear.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Trash2 />
            )}
          </Button>
        </div>
      )}

      {data?.source === "env" && (
        <p className="text-sm text-muted-foreground">
          Using{" "}
          <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> from the
          environment{" "}
          <span className="font-mono text-xs">{data.hint}</span>. A key saved
          here takes precedence.
        </p>
      )}

      {data?.source === "none" && (
        <p className="text-sm text-muted-foreground">
          The agent needs an Anthropic key before it can do anything. Nothing
          leaves this machine except the calls to Anthropic itself.
        </p>
      )}

      <div className="flex gap-2">
        <Input
          type="password"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          className="flex-1 font-mono text-sm"
        />
        <Button
          size="lg"
          disabled={save.isPending || value.trim() === ""}
          onClick={submit}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {save.isPending ? "Testing…" : "Save"}
        </Button>
      </div>

      <p className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-3 shrink-0" />
        Encrypted with AES-256-GCM in the local vault and tested against
        Anthropic before it is saved. It is never returned by the API once
        stored.
      </p>
    </div>
  );
}
