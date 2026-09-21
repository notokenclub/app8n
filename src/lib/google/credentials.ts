import { and, eq } from "drizzle-orm";
import type { Auth } from "googleapis";
import { db } from "@/lib/db";
import { accounts, credentialVault, type Account } from "@/lib/db/schema";
import {
  credentialAad,
  decryptJson,
  encryptJson,
} from "@/lib/crypto/vault";
import {
  createOAuth2Client,
  GoogleOAuthError,
  refreshAccessToken,
  revokeToken,
  type GoogleProfile,
  type GoogleTokenSet,
} from "./oauth";
import { servicesFromScopes, type GoogleService } from "./scopes";

/** Refresh slightly early so a token cannot expire mid-request. */
const EXPIRY_SKEW_MS = 60_000;

export function credentialNameForAccount(providerAccountId: string): string {
  return `google:${providerAccountId}`;
}

export interface LinkedGoogleAccount {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  services: GoogleService[];
  isPrimary: boolean;
  createdAt: Date;
}

function toLinkedAccount(account: Account): LinkedGoogleAccount {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    scopes: account.scopes,
    services: servicesFromScopes(account.scopes),
    isPrimary: account.isPrimary,
    createdAt: account.createdAt,
  };
}

/**
 * Persists a freshly authorized Google account. Re-linking an existing account
 * updates it in place so workflows keep referencing the same account id.
 */
export async function linkGoogleAccount(params: {
  userId: string;
  tokens: GoogleTokenSet;
  profile: GoogleProfile;
}): Promise<LinkedGoogleAccount> {
  const { userId, tokens, profile } = params;

  const [existing] = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, "google"),
        eq(accounts.providerAccountId, profile.sub),
      ),
    )
    .limit(1);

  if (existing && existing.userId !== userId) {
    throw new GoogleOAuthError(
      "This Google account is already linked to a different app8n user.",
    );
  }

  const existingCount = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const account =
    existing ??
    (
      await db
        .insert(accounts)
        .values({
          userId,
          provider: "google",
          providerAccountId: profile.sub,
          email: profile.email,
          displayName: profile.name ?? null,
          avatarUrl: profile.picture ?? null,
          scopes: tokens.scope,
          isPrimary: existingCount.length === 0,
        })
        .returning()
    )[0];

  if (existing) {
    await db
      .update(accounts)
      .set({
        email: profile.email,
        displayName: profile.name ?? null,
        avatarUrl: profile.picture ?? null,
        scopes: tokens.scope,
      })
      .where(eq(accounts.id, account.id));
  }

  const name = credentialNameForAccount(profile.sub);
  const aad = credentialAad(userId, name);

  // Google omits the refresh token when consent is skipped; never overwrite a
  // good one with undefined or the account silently stops refreshing.
  const previous = await readTokenSet(userId, account.id).catch(() => null);
  const merged: GoogleTokenSet = {
    ...tokens,
    refreshToken: tokens.refreshToken ?? previous?.refreshToken,
  };

  if (!merged.refreshToken) {
    throw new GoogleOAuthError(
      "Google did not return a refresh token. Revoke app8n's access at myaccount.google.com/permissions and reconnect.",
    );
  }

  const secret = encryptJson(merged, aad);
  const [existingCredential] = await db
    .select({ id: credentialVault.id })
    .from(credentialVault)
    .where(
      and(eq(credentialVault.userId, userId), eq(credentialVault.name, name)),
    )
    .limit(1);

  if (existingCredential) {
    await db
      .update(credentialVault)
      .set({
        secret,
        accountId: account.id,
        expiresAt: merged.expiryDate ? new Date(merged.expiryDate) : null,
      })
      .where(eq(credentialVault.id, existingCredential.id));
  } else {
    await db.insert(credentialVault).values({
      userId,
      accountId: account.id,
      name,
      type: "google_oauth",
      secret,
      expiresAt: merged.expiryDate ? new Date(merged.expiryDate) : null,
    });
  }

  const [fresh] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, account.id))
    .limit(1);
  return toLinkedAccount(fresh);
}

export async function listGoogleAccounts(
  userId: string,
): Promise<LinkedGoogleAccount[]> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));
  return rows.map(toLinkedAccount);
}

async function resolveAccount(
  userId: string,
  accountId?: string,
): Promise<Account> {
  const rows = await db
    .select()
    .from(accounts)
    .where(
      accountId
        ? and(eq(accounts.userId, userId), eq(accounts.id, accountId))
        : eq(accounts.userId, userId),
    );

  if (rows.length === 0) {
    throw new GoogleOAuthError(
      accountId
        ? `No linked Google account with id ${accountId}.`
        : "No Google account is connected yet.",
    );
  }
  return rows.find((row) => row.isPrimary) ?? rows[0];
}

async function readTokenSet(
  userId: string,
  accountId: string,
): Promise<GoogleTokenSet> {
  const [row] = await db
    .select()
    .from(credentialVault)
    .where(
      and(
        eq(credentialVault.userId, userId),
        eq(credentialVault.accountId, accountId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new GoogleOAuthError(
      "Stored credentials for this Google account are missing. Reconnect the account.",
    );
  }
  return decryptJson<GoogleTokenSet>(
    row.secret,
    credentialAad(userId, row.name),
  );
}

async function writeTokenSet(
  userId: string,
  accountId: string,
  tokens: GoogleTokenSet,
): Promise<void> {
  const [row] = await db
    .select({ id: credentialVault.id, name: credentialVault.name })
    .from(credentialVault)
    .where(
      and(
        eq(credentialVault.userId, userId),
        eq(credentialVault.accountId, accountId),
      ),
    )
    .limit(1);
  if (!row) return;

  await db
    .update(credentialVault)
    .set({
      secret: encryptJson(tokens, credentialAad(userId, row.name)),
      expiresAt: tokens.expiryDate ? new Date(tokens.expiryDate) : null,
      lastUsedAt: new Date(),
    })
    .where(eq(credentialVault.id, row.id));
}

function isExpired(tokens: GoogleTokenSet): boolean {
  if (!tokens.expiryDate) return true;
  return tokens.expiryDate - EXPIRY_SKEW_MS <= Date.now();
}

export interface GoogleContext {
  userId: string;
  accountId?: string;
}

/**
 * Returns an OAuth2Client with a valid access token, refreshing and persisting
 * transparently. This is the only place raw tokens are handled — callers (and
 * the LLM) work with the client, never the secret.
 */
export async function getAuthorizedClient(
  ctx: GoogleContext,
): Promise<{ client: Auth.OAuth2Client; account: Account }> {
  const account = await resolveAccount(ctx.userId, ctx.accountId);
  let tokens = await readTokenSet(ctx.userId, account.id);

  if (isExpired(tokens)) {
    if (!tokens.refreshToken) {
      throw new GoogleOAuthError(
        "Access token expired and no refresh token is stored. Reconnect the account.",
      );
    }
    tokens = await refreshAccessToken(tokens.refreshToken);
    await writeTokenSet(ctx.userId, account.id, tokens);
  }

  const client = createOAuth2Client();
  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate,
    token_type: tokens.tokenType,
  });
  return { client, account };
}

export async function unlinkGoogleAccount(
  userId: string,
  accountId: string,
): Promise<void> {
  const tokens = await readTokenSet(userId, accountId).catch(() => null);
  if (tokens?.refreshToken) {
    await revokeToken(tokens.refreshToken).catch(() => {
      // Google may already consider the grant revoked; local removal proceeds.
    });
  }
  await db
    .delete(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)));
}
