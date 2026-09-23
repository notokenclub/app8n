import { isMockGoogle } from "@/lib/config";
import { getGoogleSession, type GoogleClients } from "./clients";
import { GoogleOAuthError } from "./oauth";
import { listGoogleAccounts } from "./credentials";
import type { GoogleService } from "./scopes";

/**
 * Live verification of a linked Google account.
 *
 * Everything up to Phase 5 was proven against `APP8N_MOCK_GOOGLE=1`, which
 * exercises connector logic but never the OAuth grant behind it. This module
 * makes the same round trip the agent's tools make — token refresh included —
 * so a scope that was never consented to, or a refresh token Google has since
 * revoked, is found by pressing a button rather than by a workflow failing at
 * 7am.
 */

export type ServiceProbeStatus =
  | "ok"
  | "failed"
  /** Granted, but the API offers no listing call to prove it without an ID. */
  | "not_exercisable";

export interface ServiceProbe {
  service: GoogleService;
  status: ServiceProbeStatus;
  error?: string;
}

export interface AccountHealth {
  accountId: string;
  email: string;
  /** False when the credential itself failed, independent of any one service. */
  ok: boolean;
  /** True when the grant is gone and only re-consent will fix it. */
  needsReconnect: boolean;
  /** True when this ran against fixtures, so "ok" says nothing about Google. */
  mock: boolean;
  error?: string;
  services: ServiceProbe[];
  checkedAt: string;
}

/**
 * The cheapest real call per service, deliberately the same endpoints the
 * connectors use — a probe that exercised a different API could pass while the
 * tools still failed.
 */
const PROBES: Partial<
  Record<GoogleService, (clients: GoogleClients) => Promise<unknown>>
> = {
  gmail: (clients) =>
    clients.gmail.users.messages.list({ userId: "me", maxResults: 1 }),
  calendar: (clients) =>
    clients.calendar.events.list({ calendarId: "primary", maxResults: 1 }),
  drive: (clients) => clients.drive.files.list({ pageSize: 1 }),
  tasks: (clients) => clients.tasks.tasklists.list({ maxResults: 1 }),
};

export async function checkAccountHealth(
  userId: string,
  accountId: string,
): Promise<AccountHealth> {
  const accounts = await listGoogleAccounts(userId);
  const account = accounts.find((row) => row.id === accountId);
  const checkedAt = new Date().toISOString();

  if (!account) {
    throw new GoogleOAuthError(`No linked Google account with id ${accountId}.`);
  }

  const base = {
    accountId,
    email: account.email,
    mock: isMockGoogle(),
    checkedAt,
  };

  let clients: GoogleClients;
  try {
    // This is where a refresh happens, so an expired or revoked grant fails
    // here rather than inside one of the probes below.
    ({ clients } = await getGoogleSession({ userId, accountId }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not authorise.";
    return {
      ...base,
      ok: false,
      needsReconnect: error instanceof GoogleOAuthError,
      error: message,
      services: account.services.map((service) => ({
        service,
        status: "failed" as const,
        error: message,
      })),
    };
  }

  const services: ServiceProbe[] = [];
  for (const service of account.services) {
    const probe = PROBES[service];
    if (!probe) {
      services.push({ service, status: "not_exercisable" });
      continue;
    }

    try {
      await probe(clients);
      services.push({ service, status: "ok" });
    } catch (error) {
      services.push({
        service,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ...base,
    ok: services.every((probe) => probe.status !== "failed"),
    needsReconnect: false,
    services,
  };
}
