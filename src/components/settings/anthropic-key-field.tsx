"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button, Icon, IconButton, Input, Tip } from "@/ds";
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

  if (isLoading) return <Skeleton className="h-28 rounded-md" />;

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
      {data?.source === "vault" && (
        <div className="flex items-center gap-space-xs text-body-md">
          <span className="shrink-0 text-success">
            <Icon name="CheckCircle" size={16} />
          </span>
          <span className="min-w-0 flex-1">
            Key stored in the vault
            <span className="ml-space-xs font-mono text-caption text-muted">
              {data.hint}
            </span>
          </span>
          <IconButton
              variant="square"
            size={32}
            aria-label="Remove key"
            disabled={clear.isPending}
            icon={<Icon name={clear.isPending ? "Clock" : "Delete"} size={16} />}
            onClick={() =>
              clear.mutate(undefined, {
                onSuccess: () => toast.info("Key removed from the vault."),
              })
            }
          />
        </div>
      )}

      {data?.source === "env" && (
        <p className="text-body-md text-body">
          Using <code className="text-caption">ANTHROPIC_API_KEY</code> from the
          environment <span className="font-mono text-caption">{data.hint}</span>
          . A key saved here takes precedence.
        </p>
      )}

      {data?.source === "none" && (
        <p className="text-body-md text-body">
          The agent needs an Anthropic key before it can do anything. Nothing
          leaves this machine except the calls to Anthropic itself.
        </p>
      )}

      <div className="flex items-end gap-space-xs">
        <div className="min-w-0 flex-1">
          <Input
            label="API key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            value={value}
            icon={<Icon name="LockLocked" size={16} />}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={save.isPending || value.trim() === ""}
          onClick={submit}
          icon={<Icon name={save.isPending ? "Clock" : "CheckMark"} size={16} />}
        >
          {save.isPending ? "Testing" : "Save"}
        </Button>
      </div>

      <Tip IconComponent={Icon}>
        Encrypted with AES-256-GCM in the local vault and tested against
        Anthropic before it is saved. It is never returned by the API once
        stored.
      </Tip>
    </div>
  );
}
