"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";
import { isNative, onPushTapped, registerForPush } from "@/lib/mobile/native";

export interface PushDeviceSummary {
  id: string;
  platform: "ios" | "android" | "web";
  tokenHint: string;
  lastSeenAt: string | null;
}

export interface PushStatus {
  configured: boolean;
  devices: PushDeviceSummary[];
}

export const PUSH_KEY = ["push", "devices"] as const;

export function usePushStatus() {
  return useQuery({
    queryKey: PUSH_KEY,
    queryFn: () => apiFetch<PushStatus>("/api/push/devices"),
  });
}

/**
 * Registers this device for approval notifications and routes a tapped one to
 * the gate it refers to.
 *
 * Mounted once from the app shell. On web this is inert — `registerForPush`
 * resolves null off a native platform — so the same tree runs in a browser and
 * in the Capacitor webview without a branch at the call site.
 */
export function usePushRegistration(): void {
  const router = useRouter();
  // The query client and router are stable across renders, so the effect below
  // keys on mount alone. A mutation hook would not be: its object identity
  // changes every render, and holding it in a ref would mean writing that ref
  // during render, which the compiler rules correctly reject.
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!isNative()) return;

    let cancelled = false;

    void (async () => {
      const token = await registerForPush();
      if (cancelled || !token) return;

      const platform = /android/i.test(navigator.userAgent)
        ? "android"
        : "ios";

      try {
        await apiFetch("/api/push/devices", {
          method: "POST",
          body: JSON.stringify({ token, platform }),
        });
      } catch {
        // Not worth interrupting the user for: the approvals tab still polls,
        // so the gate is reachable whether or not push ever arrives.
        return;
      }

      if (!cancelled) {
        void queryClient.invalidateQueries({ queryKey: PUSH_KEY });
      }
    })();

    void onPushTapped((data) => {
      if (cancelled) return;
      if (data.kind === "approval_required") router.push("/approvals");
    });

    return () => {
      cancelled = true;
    };
  }, [router, queryClient]);
}
