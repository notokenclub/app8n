import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shell points at a running app8n backend rather than bundling one:
 * the engine needs SQLite, cron scheduling and long-lived OAuth tokens, none of
 * which can live inside a static mobile bundle.
 *
 * Set APP8N_SERVER_URL before `npx cap sync` — e.g. your LAN address
 * (http://192.168.1.20:3000) for development, or your deployed instance.
 */
const serverUrl = process.env.APP8N_SERVER_URL ?? "http://localhost:3000";
const allowCleartext = serverUrl.startsWith("http://");

const config: CapacitorConfig = {
  appId: "ai.app8n.client",
  appName: "app8n",
  // Offline fallback shell, shown when the backend is unreachable.
  webDir: "mobile/shell",
  server: {
    url: serverUrl,
    cleartext: allowCleartext,
    androidScheme: "https",
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: allowCleartext,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
