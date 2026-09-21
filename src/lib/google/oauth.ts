import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Auth, google } from "googleapis";
import { googleOAuthConfig, isGoogleConfigured } from "@/lib/config";
import { decryptJson, encryptJson } from "@/lib/crypto/vault";
import { scopesForServices, type GoogleService } from "./scopes";

const STATE_AAD = "oauth:google:state";
const STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthClientKind = "web" | "mobile";

export class GoogleOAuthError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GoogleOAuthError";
  }
}

export interface GoogleTokenSet {
  accessToken: string;
  refreshToken?: string;
  scope: string[];
  tokenType: string;
  /** Epoch millis, or null when Google omits an expiry. */
  expiryDate: number | null;
  idToken?: string;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

interface OAuthStatePayload {
  nonce: string;
  verifier: string;
  userId: string;
  client: OAuthClientKind;
  returnTo?: string;
  issuedAt: number;
}

// Use googleapis' bundled auth rather than a separate google-auth-library
// install: two copies produce structurally incompatible OAuth2Client types.
export function createOAuth2Client(): Auth.OAuth2Client {
  if (!isGoogleConfigured()) {
    throw new GoogleOAuthError(
      "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.",
    );
  }
  const { clientId, clientSecret, redirectUri } = googleOAuthConfig();
  return new google.auth.OAuth2({ clientId, clientSecret, redirectUri });
}

/** RFC 7636 S256 pair. The verifier never leaves the backend. */
export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

/**
 * The `state` parameter carries the PKCE verifier, encrypted with the vault key.
 * Keeping it in the (opaque, authenticated) state means no server-side session
 * store is required, which matters because the mobile flow starts in a system
 * browser that shares no cookie jar with the app.
 */
export function createOAuthState(
  payload: Omit<OAuthStatePayload, "nonce" | "issuedAt">,
): string {
  return encryptJson(
    { ...payload, nonce: randomUUID(), issuedAt: Date.now() },
    STATE_AAD,
  );
}

export function consumeOAuthState(state: string): OAuthStatePayload {
  let payload: OAuthStatePayload;
  try {
    payload = decryptJson<OAuthStatePayload>(state, STATE_AAD);
  } catch (cause) {
    throw new GoogleOAuthError("OAuth state is invalid or was tampered with.", {
      cause,
    });
  }

  if (Date.now() - payload.issuedAt > STATE_TTL_MS) {
    throw new GoogleOAuthError(
      "OAuth state expired. Please start the connection again.",
    );
  }
  return payload;
}

export interface BuildAuthUrlOptions {
  userId: string;
  services?: readonly GoogleService[];
  client?: OAuthClientKind;
  returnTo?: string;
  /** Pre-fills the account chooser when re-linking a known address. */
  loginHint?: string;
}

export function buildAuthorizationUrl(options: BuildAuthUrlOptions): {
  url: string;
  state: string;
} {
  const oauth2 = createOAuth2Client();
  const { verifier, challenge } = createPkcePair();

  const state = createOAuthState({
    verifier,
    userId: options.userId,
    client: options.client ?? "web",
    returnTo: options.returnTo,
  });

  const url = oauth2.generateAuthUrl({
    // Required for a refresh token; without it long-running workflows would
    // stop working as soon as the first access token expires.
    access_type: "offline",
    // Google only re-issues a refresh token when consent is shown again.
    prompt: "consent",
    include_granted_scopes: true,
    scope: scopesForServices(options.services),
    state,
    code_challenge_method: Auth.CodeChallengeMethod.S256,
    code_challenge: challenge,
    login_hint: options.loginHint,
  });

  return { url, state };
}

function toTokenSet(credentials: {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string | null;
  token_type?: string | null;
  expiry_date?: number | null;
  id_token?: string | null;
}): GoogleTokenSet {
  if (!credentials.access_token) {
    throw new GoogleOAuthError("Google did not return an access token.");
  }
  return {
    accessToken: credentials.access_token,
    refreshToken: credentials.refresh_token ?? undefined,
    scope: credentials.scope?.split(" ").filter(Boolean) ?? [],
    tokenType: credentials.token_type ?? "Bearer",
    expiryDate: credentials.expiry_date ?? null,
    idToken: credentials.id_token ?? undefined,
  };
}

export async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
): Promise<{ tokens: GoogleTokenSet; profile: GoogleProfile }> {
  const oauth2 = createOAuth2Client();

  let tokens: GoogleTokenSet;
  try {
    const { tokens: raw } = await oauth2.getToken({
      code,
      codeVerifier: verifier,
    });
    tokens = toTokenSet(raw);
  } catch (cause) {
    throw new GoogleOAuthError("Failed to exchange the authorization code.", {
      cause,
    });
  }

  if (!tokens.idToken) {
    throw new GoogleOAuthError(
      "Google did not return an ID token, so the account identity cannot be verified.",
    );
  }

  const ticket = await oauth2.verifyIdToken({
    idToken: tokens.idToken,
    audience: googleOAuthConfig().clientId,
  });
  const claims = ticket.getPayload();
  if (!claims?.sub || !claims.email) {
    throw new GoogleOAuthError("Google ID token is missing identity claims.");
  }

  return {
    tokens,
    profile: {
      sub: claims.sub,
      email: claims.email,
      name: claims.name,
      picture: claims.picture,
    },
  };
}

/**
 * Exchanges a refresh token for a fresh access token. Google may rotate the
 * refresh token, so callers must persist `refreshToken` when it comes back.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<GoogleTokenSet> {
  const oauth2 = createOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });

  try {
    await oauth2.getAccessToken();
  } catch (cause) {
    throw new GoogleOAuthError(
      "Failed to refresh the Google access token. The account may need to be reconnected.",
      { cause },
    );
  }

  const credentials = oauth2.credentials;
  return {
    ...toTokenSet(credentials),
    refreshToken: credentials.refresh_token ?? refreshToken,
  };
}

/** Best-effort revocation; connection removal should not fail if this does. */
export async function revokeToken(token: string): Promise<void> {
  const oauth2 = createOAuth2Client();
  await oauth2.revokeToken(token);
}
