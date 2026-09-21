"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  CircleCheckBig,
  Loader2,
  Plus,
  RefreshCw,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCheckAccount,
  useDisconnectAccount,
  useGoogleAccounts,
  type AccountHealth,
  type LinkedAccount,
} from "@/hooks/use-settings";
import { apiUrl } from "@/lib/client-api";
import { GOOGLE_SERVICES, SERVICE_LABELS } from "@/lib/google/scopes";
import { SERVICE_ICONS } from "@/lib/tool-display";

/**
 * Per-account scope readout.
 *
 * Every service is listed, granted or not, rather than only the granted ones:
 * "Gmail is missing" is the answer to "why did the agent say it can't read my
 * mail", and it is invisible if ungranted services are simply absent.
 */
function ServiceGrid({ account }: { account: LinkedAccount }) {
  const granted = new Set(account.services);
  return (
    <div className="flex flex-wrap gap-1.5">
      {GOOGLE_SERVICES.map((service) => {
        const Icon = SERVICE_ICONS[service];
        const on = granted.has(service);
        return (
          <span
            key={service}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
              on
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-border bg-muted/40 text-muted-foreground line-through decoration-muted-foreground/50",
            )}
          >
            {Icon && <Icon className="size-3" />}
            {SERVICE_LABELS[service]}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Result of a live check.
 *
 * Mock mode is called out explicitly: a green tick that only proves the
 * fixtures work would be exactly the false confidence this check exists to
 * remove.
 */
function HealthReadout({ health }: { health: AccountHealth }) {
  const failed = health.services.filter((probe) => probe.status === "failed");

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 text-xs",
        health.ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <p className="flex items-center gap-1.5 font-medium">
        {health.ok ? (
          <CircleCheckBig className="size-3.5 shrink-0" />
        ) : (
          <TriangleAlert className="size-3.5 shrink-0" />
        )}
        {health.ok
          ? health.mock
            ? "Mock connectors responded — this proves nothing about Google"
            : "Live check passed"
          : health.needsReconnect
            ? "Reconnect needed"
            : "Live check failed"}
      </p>

      {health.error && <p className="mt-1 leading-relaxed">{health.error}</p>}

      {failed.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {failed.map((probe) => (
            <li key={probe.service} className="leading-relaxed">
              <span className="font-medium">
                {SERVICE_LABELS[probe.service as keyof typeof SERVICE_LABELS] ??
                  probe.service}
                :
              </span>{" "}
              {probe.error}
            </li>
          ))}
        </ul>
      )}

      {health.ok && (
        <p className="mt-1 leading-relaxed opacity-80">
          Checked{" "}
          {health.services.filter((probe) => probe.status === "ok").length} of{" "}
          {health.services.length} granted services. Docs and Sheets have no
          listing call to probe without a file id.
        </p>
      )}
    </div>
  );
}

export function GoogleAccounts() {
  const { data, isLoading } = useGoogleAccounts();
  const disconnect = useDisconnectAccount();
  const check = useCheckAccount();
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [health, setHealth] = React.useState<Record<string, AccountHealth>>({});

  const connect = () => {
    // A full navigation, not fetch: Google's consent screen has to be driven
    // by the browser. On native, the Capacitor shell intercepts this route and
    // opens the system browser instead (see lib/mobile/native.ts).
    window.location.href = apiUrl(
      "/api/auth/google/start?returnTo=/settings",
    );
  };

  if (isLoading) {
    return <Skeleton className="h-32 rounded-2xl" />;
  }

  return (
    <div className="space-y-3">
      {data?.googleConfigured === false && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Google OAuth is not configured. Add{" "}
            <code className="font-mono">GOOGLE_CLIENT_ID</code> and{" "}
            <code className="font-mono">GOOGLE_CLIENT_SECRET</code> to{" "}
            <code className="font-mono">.env.local</code> to connect a real
            account.
          </span>
        </div>
      )}

      {data?.mockMode && (
        <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Running with mock Google connectors — no live Workspace data is being
          read or written.
        </p>
      )}

      {data?.accounts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No Google account connected yet. app8n can&apos;t read your mail or
          calendar until one is.
        </p>
      )}

      {data?.accounts.map((account) => (
        <div
          key={account.id}
          className="space-y-3 rounded-2xl border border-border bg-card p-3.5"
        >
          <div className="flex items-center gap-3">
            {account.avatarUrl ? (
              // A 36px avatar from Google's own CDN gains nothing from the
              // image optimiser, and next/image would force a remotePatterns
              // entry for every avatar host Google might serve from.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={account.avatarUrl}
                alt=""
                className="size-9 shrink-0 rounded-full"
              />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium uppercase">
                {account.email.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {account.displayName ?? account.email}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {account.email}
              </p>
            </div>
            {account.isPrimary && (
              <Badge variant="secondary" className="shrink-0">
                Primary
              </Badge>
            )}
          </div>

          <ServiceGrid account={account} />

          {health[account.id] && <HealthReadout health={health[account.id]} />}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={check.isPending}
            onClick={() =>
              check.mutate(account.id, {
                onSuccess: (result) =>
                  setHealth((current) => ({
                    ...current,
                    [account.id]: result,
                  })),
                onError: (error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not check the connection.",
                  ),
              })
            }
          >
            {check.isPending && check.variables === account.id ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Test connection
          </Button>

          {confirming === account.id ? (
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                disabled={disconnect.isPending}
                onClick={() =>
                  disconnect.mutate(account.id, {
                    onSuccess: () => {
                      setConfirming(null);
                      toast.success(`Disconnected ${account.email}.`);
                    },
                    onError: (error) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Could not disconnect.",
                      ),
                  })
                }
              >
                {disconnect.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Unplug />
                )}
                Yes, disconnect
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setConfirming(account.id)}
            >
              <Unplug />
              Disconnect
            </Button>
          )}
        </div>
      ))}

      <Button
        variant={data?.accounts.length ? "outline" : "default"}
        size="lg"
        className="w-full"
        disabled={data?.googleConfigured === false}
        onClick={connect}
      >
        <Plus />
        {data?.accounts.length ? "Connect another account" : "Connect Google"}
      </Button>
    </div>
  );
}
