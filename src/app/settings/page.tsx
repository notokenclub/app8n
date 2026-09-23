"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Divider, Icon, Switch } from "@/ds";
import { ModelKeyField } from "@/components/settings/model-key-field";
import { GoogleAccounts } from "@/components/settings/google-accounts";
import { GoogleConnectResult } from "@/components/settings/google-connect-result";
import { PushNotifications } from "@/components/settings/push-notifications";
import { PageHeader } from "@/components/shell/page-header";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-space-sm">
      <div>
        <h2 className="font-display text-title-sm text-ink">{title}</h2>
        <p className="text-caption text-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { resolvedTheme, setTheme } = useTheme();
  // The resolved theme is only knowable in the browser, so the control renders
  // in its default position until the component has mounted. Without this the
  // server's markup and the first client render disagree whenever the stored
  // theme is not the default, which React reports as a hydration mismatch.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const charcoal = mounted && resolvedTheme === "dark";

  return (
    <>
      <PageHeader title="Settings" subtitle="Accounts, keys and the vault" />
      <GoogleConnectResult />

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-space-xl p-space-md">
        <Section
          title="Google Workspace"
          description="Which accounts app8n can act on, and what it is allowed to touch."
        >
          <GoogleAccounts />
        </Section>

        <Divider tone="hairline" />

        <Section
          title="Model API key"
          description="The model behind the agent. Stored in the encrypted local vault."
        >
          <ModelKeyField />
        </Section>

        <Divider tone="hairline" />

        <Section
          title="Notifications"
          description="Where an approval gate reaches you when the app is closed."
        >
          <PushNotifications />
        </Section>

        <Divider tone="hairline" />

        <Section
          title="Appearance"
          description="The canvas theme is the default; the charcoal theme inverts it onto the system's dark ink surfaces."
        >
          <div className="flex items-center gap-space-sm rounded-md border border-hairline bg-canvas p-space-sm">
            <span className="shrink-0 text-muted">
              <Icon name={charcoal ? "EyeOpenStrikethrough" : "EyeOpen"} size={16} />
            </span>
            <span className="min-w-0 flex-1 text-body-md font-medium">
              Charcoal theme
            </span>
            <Switch
              checked={charcoal}
              onChange={(checked) => setTheme(checked ? "dark" : "light")}
            />
          </div>
        </Section>

        <p className="pb-space-md text-legal leading-relaxed text-muted">
          Every credential above lives in an AES-256-GCM encrypted vault on this
          machine. The model is shown the results of actions, never the tokens
          that made them possible.
        </p>
      </div>
    </>
  );
}
