"use client";

import { Icon, IconTile, SectionMessage } from "@/ds";
import { Skeleton } from "@/components/ui/skeleton";
import { usePushStatus } from "@/hooks/use-push";
import { isNative } from "@/lib/mobile/native";

const PLATFORM_LABELS: Record<string, string> = {
  ios: "iPhone or iPad",
  android: "Android device",
  web: "Browser",
};

/**
 * Push delivery status.
 *
 * Deliberately shows the two failure modes apart: a backend with no push
 * provider configured can never deliver, while a configured one with no
 * registered devices is simply waiting for the app to be opened on a phone.
 * Collapsing them into "push is off" would send someone to fix the wrong end.
 */
export function PushNotifications() {
  const { data, isLoading } = usePushStatus();

  if (isLoading) return <Skeleton className="h-20 rounded-md" />;
  if (!data) return null;

  return (
    <div className="space-y-space-sm">
      {data.configured ? (
        <div className="flex items-start gap-space-sm rounded-md border border-hairline bg-canvas p-space-sm">
          <IconTile
            appearance="neutral"
            size={32}
            icon={<Icon name="Megaphone" size={16} />}
          />
          <div className="min-w-0 flex-1">
            <p className="text-body-md font-medium text-ink">
              Push delivery is configured
            </p>
            <p className="mt-space-xxs text-caption leading-relaxed text-body">
              Approval gates raised by scheduled runs are sent to your
              registered devices.
            </p>
          </div>
        </div>
      ) : (
        <SectionMessage
          appearance="information"
          title="No push provider configured"
          IconComponent={Icon}
        >
          Set <code className="text-caption">APP8N_FCM_SERVICE_ACCOUNT</code> on
          the backend to deliver approval gates to your phone, or
          <code className="text-caption"> APP8N_NOTIFY_WEBHOOK_URL</code> to send
          them to any webhook. Until then the approvals tab is the only channel.
        </SectionMessage>
      )}

      {data.devices.length > 0 ? (
        <ul className="space-y-space-xs">
          {data.devices.map((device) => (
            <li
              key={device.id}
              className="flex items-center gap-space-sm rounded-md border border-hairline bg-canvas p-space-sm"
            >
              <span className="shrink-0 text-muted">
                <Icon name="ChatWidget" size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-md font-medium text-ink">
                  {PLATFORM_LABELS[device.platform] ?? device.platform}
                </p>
                <p className="truncate text-caption text-muted">
                  {device.tokenHint}
                  {device.lastSeenAt &&
                    ` · last seen ${new Date(device.lastSeenAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-space-xxs text-caption leading-relaxed text-muted">
          {isNative()
            ? "This device has not registered yet. Allow notifications when prompted."
            : "No devices registered. Open app8n on your phone to receive approval alerts."}
        </p>
      )}
    </div>
  );
}
