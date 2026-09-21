import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Firebase Cloud Messaging HTTP v1 transport.
 *
 * Implemented directly rather than through firebase-admin: the SDK pulls a
 * large dependency tree into a process whose only use of it is one HTTPS POST,
 * and the JWT-bearer grant below is the whole of what it would do for us.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
/** Refresh a little early so a token cannot expire between mint and send. */
const TOKEN_SKEW_MS = 60_000;

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export class PushTransportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PushTransportError";
  }
}

/**
 * Reads the service account from the environment, accepting either inline JSON
 * or a path. A path is the documented form — keeping a private key out of the
 * shell history and the process listing is worth the extra read.
 */
export function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.APP8N_FCM_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;

  let json: string;
  try {
    json = raw.startsWith("{") ? raw : readFileSync(raw, "utf8");
  } catch (cause) {
    throw new PushTransportError(
      `Could not read APP8N_FCM_SERVICE_ACCOUNT at ${raw}.`,
      { cause },
    );
  }

  let parsed: {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };
  try {
    parsed = JSON.parse(json);
  } catch (cause) {
    throw new PushTransportError(
      "APP8N_FCM_SERVICE_ACCOUNT is not valid JSON.",
      { cause },
    );
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new PushTransportError(
      "FCM service account is missing project_id, client_email or private_key.",
    );
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    // Env vars carry the PEM's newlines escaped; node's verifier needs them real.
    privateKey: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function signedAssertion(account: ServiceAccount, now: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: FCM_SCOPE,
      aud: TOKEN_URL,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(account.privateKey);

  return `${header}.${claims}.${base64url(signature)}`;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Exposed so a test can force the next send to mint a fresh token. */
export function resetAccessTokenCache(): void {
  cachedToken = null;
}

async function accessTokenFor(account: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - TOKEN_SKEW_MS > now) {
    return cachedToken.value;
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedAssertion(account, now),
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    throw new PushTransportError(
      payload?.error_description ??
        `FCM rejected the service account (HTTP ${response.status}).`,
    );
  }

  cachedToken = {
    value: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

export interface FcmMessage {
  token: string;
  title: string;
  body: string;
  /** String-valued, per the FCM data contract; the app routes on these. */
  data: Record<string, string>;
}

export type FcmSendResult =
  | { ok: true }
  /** The token is permanently dead — the caller should stop storing it. */
  | { ok: false; unregistered: true; error: string }
  | { ok: false; unregistered: false; error: string };

export async function sendFcmMessage(
  account: ServiceAccount,
  message: FcmMessage,
): Promise<FcmSendResult> {
  let token: string;
  try {
    token = await accessTokenFor(account);
  } catch (error) {
    return {
      ok: false,
      unregistered: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: message.token,
          notification: { title: message.title, body: message.body },
          data: message.data,
          android: { priority: "high" },
          apns: {
            headers: { "apns-priority": "10" },
            payload: { aps: { sound: "default" } },
          },
        },
      }),
    },
  );

  if (response.ok) return { ok: true };

  const detail = (await response.json().catch(() => null)) as {
    error?: { message?: string; status?: string };
  } | null;

  // UNREGISTERED and INVALID_ARGUMENT on a token mean the address is dead for
  // good; anything else (quota, outage) is worth keeping the device for.
  const status = detail?.error?.status;
  const unregistered = response.status === 404 || status === "UNREGISTERED";

  return {
    ok: false,
    unregistered,
    error:
      detail?.error?.message ?? `FCM send failed (HTTP ${response.status}).`,
  };
}
