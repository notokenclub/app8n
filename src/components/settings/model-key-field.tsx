"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button, Icon, IconButton, Input, SectionMessage, TextBadge, Tip } from "@/ds";
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

  if (isLoading || !data) return <Skeleton className="h-28 rounded-md" />;

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
    <div className="space-y-space-sm rounded-md border border-hairline bg-canvas p-space-sm">
      <div className="flex items-center gap-space-xs">
        <span className="text-body-md font-medium text-ink">
          {data.providerLabel}
        </span>
        {data.freeTier && <TextBadge tone="primary">free tier</TextBadge>}
      </div>

      {/* A local runtime has no key to store, so the whole vault flow is
          replaced by a reachability check against the address it serves on. */}
      {!data.requiresKey ? (
        <>
          <p className="text-body-md text-body">
            Runs on your own machine — no API key, no account, nothing leaves
            this computer. app8n talks to it at{" "}
            <code className="text-caption">{data.baseUrl}</code>.
          </p>

          {probe && (
            <SectionMessage
              appearance={probe.ok ? "success" : "danger"}
              IconComponent={Icon}
            >
              {probe.ok
                ? "Ollama answered and the model is installed."
                : probe.error}
            </SectionMessage>
          )}

          <div className="flex [&>*]:flex-1">
            <Button
              variant="secondary"
              size="sm"
              disabled={test.isPending}
              icon={
                <Icon name={test.isPending ? "Clock" : "CheckCircle"} size={16} />
              }
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
              Test connection
            </Button>
          </div>
        </>
      ) : (
        <>
          {data.source === "vault" && (
            <div className="flex items-center gap-space-xs text-body-md">
              <span className="shrink-0 text-success">
                <Icon name="CheckCircle" size={16} />
              </span>
              <span className="min-w-0 flex-1 text-ink">
                Key stored in the vault
                <span className="ml-space-xs font-mono text-caption text-muted">
                  {data.hint}
                </span>
              </span>
              <IconButton
                type="button"
                variant="square"
                size={32}
                aria-label="Remove key"
                disabled={clear.isPending}
                icon={
                  <Icon name={clear.isPending ? "Clock" : "Delete"} size={16} />
                }
                onClick={() =>
                  clear.mutate(undefined, {
                    onSuccess: () => toast.info("Key removed from the vault."),
                  })
                }
              />
            </div>
          )}

          {data.source === "env" && (
            <p className="text-body-md text-body">
              Using <code className="text-caption">{data.envVar}</code> from the
              environment{" "}
              <span className="font-mono text-caption">{data.hint}</span>. A key
              saved here takes precedence.
            </p>
          )}

          {data.source === "none" && (
            <p className="text-body-md text-body">
              The agent needs an API key from {data.providerLabel} before it
              can do anything. Nothing leaves this machine except the calls to{" "}
              {data.providerLabel} itself.
            </p>
          )}

          <div className="flex items-end gap-space-xs">
            <div className="min-w-0 flex-1">
              <Input
                label="API key"
                type="password"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={data.placeholder}
                value={value}
                icon={<Icon name="LockLocked" size={16} />}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
              />
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={save.isPending || value.trim() === ""}
              onClick={submit}
              icon={
                <Icon name={save.isPending ? "Clock" : "CheckMark"} size={16} />
              }
            >
              {save.isPending ? "Testing" : "Save"}
            </Button>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-space-xs">
        <Tip IconComponent={Icon}>
          {data.requiresKey
            ? `Encrypted with AES-256-GCM in the local vault and tested against ${data.providerLabel} before it is saved.`
            : "Nothing is sent off this machine — the model runs locally."}
        </Tip>
        <a
          href={data.consoleUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-space-xxs text-legal text-muted underline underline-offset-2 hover:text-foreground"
        >
          {data.requiresKey ? "Get a key" : "Install Ollama"}
          <Icon name="LinkExternal" size={16} />
        </a>
      </div>
    </div>
  );
}
