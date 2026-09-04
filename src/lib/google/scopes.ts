/**
 * Google Workspace scopes, grouped so the connect flow can request only what a
 * user's chosen blueprints actually need rather than everything up front.
 */

export const GOOGLE_SERVICES = [
  "gmail",
  "calendar",
  "drive",
  "sheets",
  "docs",
  "tasks",
] as const;

export type GoogleService = (typeof GOOGLE_SERVICES)[number];

export const IDENTITY_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
] as const;

export const SERVICE_SCOPES: Record<GoogleService, readonly string[]> = {
  gmail: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
  ],
  calendar: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ],
  drive: [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
  ],
  sheets: ["https://www.googleapis.com/auth/spreadsheets"],
  docs: ["https://www.googleapis.com/auth/documents"],
  tasks: ["https://www.googleapis.com/auth/tasks"],
};

/** Human-readable labels for the connection UI. */
export const SERVICE_LABELS: Record<GoogleService, string> = {
  gmail: "Gmail",
  calendar: "Google Calendar",
  drive: "Google Drive",
  sheets: "Google Sheets",
  docs: "Google Docs",
  tasks: "Google Tasks",
};

export function scopesForServices(
  services: readonly GoogleService[] = GOOGLE_SERVICES,
): string[] {
  const scopes = new Set<string>(IDENTITY_SCOPES);
  for (const service of services) {
    for (const scope of SERVICE_SCOPES[service]) scopes.add(scope);
  }
  return [...scopes];
}

export function isGoogleService(value: string): value is GoogleService {
  return (GOOGLE_SERVICES as readonly string[]).includes(value);
}

/** Which services a granted scope list actually unlocks. */
export function servicesFromScopes(granted: readonly string[]): GoogleService[] {
  const set = new Set(granted);
  return GOOGLE_SERVICES.filter((service) =>
    SERVICE_SCOPES[service].some((scope) => set.has(scope)),
  );
}
