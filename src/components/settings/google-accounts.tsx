"use client";

import * as React from "react";
import { toast } from "sonner";
import { Badge, Button, Icon, SectionMessage, TextBadge } from "@/ds";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDisconnectAccount,
  useGoogleAccounts,
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
    <div className="flex flex-wrap gap-space-xxs">
      {GOOGLE_SERVICES.map((service) => {
        const on = granted.has(service);
        return (
          <span key={service} className={on ? undefined : "opacity-60"}>
            <Badge tone={on ? "success" : "neutral"}>
              <span className="inline-flex items-center gap-space-xxs">
                <Icon name={SERVICE_ICONS[service] ?? "Automation"} size={16} />
                {SERVICE_LABELS[service]}
                {!on && " — not granted"}
              </span>
            </Badge>
          </span>
        );
      })}
    </div>
  );
}

export function GoogleAccounts() {
  const { data, isLoading } = useGoogleAccounts();
  const disconnect = useDisconnectAccount();
  const [confirming, setConfirming] = React.useState<string | null>(null);

  const connect = () => {
    // A full navigation, not fetch: Google's consent screen has to be driven
    // by the browser. On native, the Capacitor shell intercepts this route and
    // opens the system browser instead (see lib/mobile/native.ts).
    window.location.href = apiUrl("/api/auth/google/start?returnTo=/settings");
  };

  if (isLoading) {
    return <Skeleton className="h-32 rounded-md" />;
  }

  return (
    <div className="space-y-space-sm">
      {data?.googleConfigured === false && (
        <SectionMessage
          appearance="warning"
          title="Google OAuth is not configured"
          IconComponent={Icon}
        >
          Add <code className="text-caption">GOOGLE_CLIENT_ID</code> and{" "}
          <code className="text-caption">GOOGLE_CLIENT_SECRET</code> to{" "}
          <code className="text-caption">.env.local</code> to connect a real
          account.
        </SectionMessage>
      )}

      {data?.mockMode && (
        <SectionMessage appearance="information" IconComponent={Icon}>
          Running with mock Google connectors — no live Workspace data is being
          read or written.
        </SectionMessage>
      )}

      {data?.accounts.length === 0 && (
        <p className="text-body-md text-body">
          No Google account connected yet. app8n can&apos;t read your mail or
          calendar until one is.
        </p>
      )}

      {data?.accounts.map((account) => (
        <div
          key={account.id}
          className="space-y-space-sm rounded-md border border-hairline bg-canvas p-space-sm"
        >
          <div className="flex items-center gap-space-sm">
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
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-body-md font-medium text-ink uppercase">
                {account.email.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-md font-medium text-ink">
                {account.displayName ?? account.email}
              </p>
              <p className="truncate text-caption text-muted">
                {account.email}
              </p>
            </div>
            {account.isPrimary && (
              <span className="shrink-0">
                <TextBadge tone="primary">Primary</TextBadge>
              </span>
            )}
          </div>

          <ServiceGrid account={account} />

          {confirming === account.id ? (
            <div className="flex gap-space-xs">
              <Button
                variant="primary"
                size="sm"
                disabled={disconnect.isPending}
                icon={
                  <Icon
                    name={disconnect.isPending ? "Clock" : "LogOut"}
                    size={16}
                  />
                }
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
                Yes, disconnect
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon name="LogOut" size={16} />}
              onClick={() => setConfirming(account.id)}
            >
              Disconnect
            </Button>
          )}
        </div>
      ))}

      <Button
        variant={data?.accounts.length ? "secondary" : "primary"}
        size="md"
        disabled={data?.googleConfigured === false}
        onClick={connect}
        icon={<Icon name="Add" size={16} />}
      >
        {data?.accounts.length ? "Connect another account" : "Connect Google"}
      </Button>
    </div>
  );
}
