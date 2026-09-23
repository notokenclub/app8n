"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Server,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useClearModelKey,
  useModelKey,
  useSaveModelKey,
  useTestProvider,
} from "@/hooks/use-settings";

/**
 * Entry point for the user's own model API key.
 *
 * The field is write-only by design: the server returns a masked hint and
 * never the key itself, so nothing here can be read back out of the vault
 * through the UI. Saving verifies the key with a one-token call before it is
 * written, so a mistyped key fails on this screen instead of silently
 * breaking a scheduled workflow at 6am.
 *
 * Everything vendor-specific — the label, the placeholder, where to get a key —
 * comes from the server's view of the active provider, so this component does
 * not need to know which providers exist.
 */
export function ModelKeyField() {
  const { data, isLoading } = useModelKey();
  const save = useSaveModelKey();
  const clear = useClearModelKey();
  const test = useTestProvider();
  const [value, setValue] = React.useState("");
  const [probe, setProbe] = React.useState<{
    ok: boolean;
    error?: string;
  } | null>(null);

  if (isLoading || !data) return <Skeleton className="h-28 rounded-2xl" />;

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
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{data.providerLabel}</span>
        {data.freeTier && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.625rem] font-medium text-emerald-300">
            <Sparkles className="size-2.5" />
            free tier
          </span>
        )}
      </div>

      {/* A local runtime has no key to store, so the whole vault flow is
          replaced by a reachability check against the address it serves on. */}
      {!data.requiresKey ? (
        <>
          <p className="text-sm text-muted-foreground">
            Runs on your own machine — no API key, no account, nothing leaves
            this computer. app8n talks to it at{" "}
            <code className="font-mono text-xs">{data.baseUrl}</code>.
          </p>

          {probe && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed",
                probe.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              {probe.ok ? (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1">
                {probe.ok
                  ? "Ollama answered and the model is installed."
                  : probe.error}
              </span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={test.isPending}
            onClick={() =>
              test.mutate(undefined, {
                onSuccess: (result) => setProbe(result),
                onError: (error) =>
                  setProbe({
                    ok: false,
                    error:
                      error instanceof Error
                        ? error.message
                        : "Could not reach the provider.",
                  }),
              })
            }
          >
            {test.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Test connection
          </Button>
        </>
      ) : (
        <>
      {data.source === "vault" && (
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

      {data.source === "env" && (
        <p className="text-sm text-muted-foreground">
          Using <code className="font-mono text-xs">{data.envVar}</code> from
          the environment{" "}
          <span className="font-mono text-xs">{data.hint}</span>. A key saved
          here takes precedence.
        </p>
      )}

      {data.source === "none" && (
        <p className="text-sm text-muted-foreground">
          The agent needs a {data.providerLabel} key before it can do anything.
          Nothing leaves this machine except the calls to {data.providerLabel}{" "}
          itself.
        </p>
      )}

      <div className="flex gap-2">
        <Input
          type="password"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={data.placeholder}
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

        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
          {data.requiresKey ? (
            <Lock className="mt-0.5 size-3 shrink-0" />
          ) : (
            <Server className="mt-0.5 size-3 shrink-0" />
          )}
          {data.requiresKey
            ? `Encrypted with AES-256-GCM in the local vault and tested against ${data.providerLabel} before it is saved.`
            : "Nothing is sent off this machine — the model runs locally."}
        </p>
        <a
          href={data.consoleUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {data.requiresKey ? "Get a key" : "Install Ollama"}
          <ExternalLink className="size-2.5" />
        </a>
      </div>
    </div>
  );
}
