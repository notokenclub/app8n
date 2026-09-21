/**
 * Runtime configuration. Read lazily so the app can build without credentials
 * and so tests can swap env vars between cases.
 */

export function appUrl(): string {
  return process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

/** Base URL the client (web or native shell) uses to reach the backend. */
export function apiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP8N_API_URL?.replace(/\/$/, "") ?? appUrl()
  );
}

export function googleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    `${appUrl()}/api/auth/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleConfigured(): boolean {
  const { clientId, clientSecret } = googleOAuthConfig();
  return Boolean(clientId && clientSecret);
}

/**
 * Mock mode swaps the Google API clients for fixtures. Service logic still runs
 * end to end, so connectors are exercised without network or credentials.
 */
export function isMockGoogle(): boolean {
  return process.env.APP8N_MOCK_GOOGLE === "1";
}

/** Deep link the native shell registers, used to hand OAuth back to the app. */
export function mobileRedirectUri(): string {
  return process.env.APP8N_MOBILE_REDIRECT_URI ?? "app8n://auth/callback";
}

/** Origins allowed to complete an OAuth flow, guarding the open-redirect path. */
export function allowedReturnOrigins(): string[] {
  const extra =
    process.env.APP8N_ALLOWED_ORIGINS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  return [appUrl(), ...extra];
}
