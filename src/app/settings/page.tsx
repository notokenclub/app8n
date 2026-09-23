"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { ModelKeyField } from "@/components/settings/model-key-field";
import { GoogleAccounts } from "@/components/settings/google-accounts";
import { GoogleConnectResult } from "@/components/settings/google-connect-result";
import { PushNotifications } from "@/components/settings/push-notifications";
import { PageHeader } from "@/components/shell/page-header";
import { Switch } from "@/components/ui/switch";

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
    <section className="space-y-2.5">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme !== "light";

  return (
    <>
      <PageHeader title="Settings" subtitle="Accounts, keys and the vault" />
      <GoogleConnectResult />

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-7 p-4">
        <Section
          title="Google Workspace"
          description="Which accounts app8n can act on, and what it is allowed to touch."
        >
          <GoogleAccounts />
        </Section>

        <Section
          title="Model API key"
          description="The model behind the agent. Stored in the encrypted local vault."
        >
          <ModelKeyField />
        </Section>

        <Section
          title="Notifications"
          description="Where an approval gate reaches you when the app is closed."
        >
          <PushNotifications />
        </Section>

        <Section
          title="Appearance"
          description="app8n is built dark-first; light mode is there if you need it."
        >
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
            {dark ? (
              <Moon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Sun className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 text-sm font-medium">
              Dark mode
            </span>
            <Switch
              checked={dark}
              onCheckedChange={(checked) =>
                setTheme(checked ? "dark" : "light")
              }
            />
          </label>
        </Section>

        <p className="pb-4 text-[0.6875rem] leading-relaxed text-muted-foreground">
          Every credential above lives in an AES-256-GCM encrypted vault on this
          machine. The model is shown the results of actions, never the tokens
          that made them possible.
        </p>
      </div>
    </>
  );
}
