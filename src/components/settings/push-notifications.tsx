"use client";

import { BellOff, BellRing, Smartphone } from "lucide-react";
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

  if (isLoading) return <Skeleton className="h-20 rounded-2xl" />;
  if (!data) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {data.configured ? (
            <BellRing className="size-4" />
          ) : (
            <BellOff className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {data.configured
              ? "Push delivery is configured"
              : "No push provider configured"}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {data.configured
              ? "Approval gates raised by scheduled runs are sent to your registered devices."
              : "Set APP8N_FCM_SERVICE_ACCOUNT on the backend to deliver approval gates to your phone. Until then the Approvals tab is the only channel."}
          </p>
        </div>
      </div>

      {data.devices.length > 0 ? (
        <ul className="space-y-2">
          {data.devices.map((device) => (
            <li
              key={device.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5"
            >
              <Smartphone className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {PLATFORM_LABELS[device.platform] ?? device.platform}
                </p>
                <p className="truncate text-xs text-muted-foreground">
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
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          {isNative()
            ? "This device has not registered yet. Allow notifications when prompted."
            : "No devices registered. Open app8n on your phone to receive approval alerts."}
        </p>
      )}
    </div>
  );
}
