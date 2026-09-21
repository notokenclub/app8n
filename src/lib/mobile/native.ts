"use client";

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

/** Base URL of the app8n backend. Empty string means "same origin" on web. */
export function apiBase(): string {
  return process.env.NEXT_PUBLIC_APP8N_API_URL?.replace(/\/$/, "") ?? "";
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export interface ConnectResult {
  status: "success" | "error";
  email?: string;
  accountId?: string;
  services?: string[];
  message?: string;
}

/**
 * Runs Google consent in the system browser (ASWebAuthenticationSession on iOS,
 * Custom Tabs on Android) and resolves when the backend hands control back via
 * the `app8n://auth/callback` deep link.
 *
 * An in-app webview is deliberately avoided: Google blocks OAuth in embedded
 * webviews, and the system browser keeps credentials out of our process.
 */
export async function connectGoogleNative(
  services?: string[],
): Promise<ConnectResult> {
  const query = new URLSearchParams({ client: "mobile" });
  if (services?.length) query.set("services", services.join(","));

  return new Promise<ConnectResult>((resolve, reject) => {
    let settled = false;

    App.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith("app8n://auth/callback") || settled) return;
      settled = true;

      await Browser.close().catch(() => {
        // Android Custom Tabs may already be dismissed.
      });

      const params = new URL(url).searchParams;
      const status = params.get("status");
      resolve({
        status: status === "success" ? "success" : "error",
        email: params.get("email") ?? undefined,
        accountId: params.get("accountId") ?? undefined,
        services: params.get("services")?.split(",").filter(Boolean),
        message: params.get("message") ?? undefined,
      });
    }).catch(reject);

    Browser.open({
      url: `${apiBase()}/api/auth/google/start?${query}`,
      presentationStyle: "popover",
    }).catch(reject);
  });
}

/**
 * Registers for push so background workflow results and approval requests can
 * reach the phone while the app is closed. Returns the device token for the
 * backend to store, or null when unavailable (web, or permission denied).
 */
export async function registerForPush(): Promise<string | null> {
  if (!isNative()) return null;

  const existing = await PushNotifications.checkPermissions();
  const permission =
    existing.receive === "prompt"
      ? await PushNotifications.requestPermissions()
      : existing;

  if (permission.receive !== "granted") return null;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      resolve(token);
    };

    PushNotifications.addListener("registration", ({ value }) => finish(value));
    PushNotifications.addListener("registrationError", () => finish(null));
    PushNotifications.register();

    // Never leave a caller hanging if the platform stays silent.
    setTimeout(() => finish(null), 15_000);
  });
}

/** Fires when the user taps a push notification, e.g. an approval request. */
export async function onPushTapped(
  handler: (data: Record<string, unknown>) => void,
): Promise<void> {
  if (!isNative()) return;
  await PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action) => handler(action.notification.data ?? {}),
  );
}
