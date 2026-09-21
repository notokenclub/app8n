import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { credentialVault } from "@/lib/db/schema";
import { credentialAad, decryptSecret, encryptSecret } from "@/lib/crypto/vault";

/** Single well-known vault row, so the unique (userId, name) index upserts it. */
export const ANTHROPIC_KEY_NAME = "anthropic_api_key";

export type ApiKeySource = "vault" | "env" | "none";

export interface ApiKeyStatus {
  source: ApiKeySource;
  /** Last four characters only — enough to recognise, useless if leaked. */
  hint: string | null;
  updatedAt: string | null;
}

function hintOf(key: string): string {
  return key.length <= 4 ? "••••" : `••••${key.slice(-4)}`;
}

async function readVaultRow(userId: string) {
  const [row] = await db
    .select()
    .from(credentialVault)
    .where(
      and(
        eq(credentialVault.userId, userId),
        eq(credentialVault.name, ANTHROPIC_KEY_NAME),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The key the agent should run with.
 *
 * Vault first, environment second. A user who pastes a key into Settings on a
 * phone expects it to take effect; falling back to `.env.local` keeps the
 * developer workflow and the headless scheduler working on a machine where
 * nobody has opened the UI.
 */
export async function resolveAnthropicKey(
  userId: string,
): Promise<{ key: string | null; source: ApiKeySource }> {
  const row = await readVaultRow(userId);
  if (row) {
    try {
      return {
        key: decryptSecret(row.secret, credentialAad(userId, ANTHROPIC_KEY_NAME)),
        source: "vault",
      };
    } catch {
      // A row encrypted under a rotated master key is unusable, not fatal:
      // fall through to the environment rather than bricking the agent.
    }
  }
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  return fromEnv
    ? { key: fromEnv, source: "env" }
    : { key: null, source: "none" };
}

export async function getAnthropicKeyStatus(
  userId: string,
): Promise<ApiKeyStatus> {
  const row = await readVaultRow(userId);
  if (row) {
    try {
      const key = decryptSecret(
        row.secret,
        credentialAad(userId, ANTHROPIC_KEY_NAME),
      );
      return {
        source: "vault",
        hint: hintOf(key),
        updatedAt: row.updatedAt?.toISOString() ?? null,
      };
    } catch {
      return { source: "vault", hint: null, updatedAt: null };
    }
  }
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  return fromEnv
    ? { source: "env", hint: hintOf(fromEnv), updatedAt: null }
    : { source: "none", hint: null, updatedAt: null };
}

export async function setAnthropicKey(
  userId: string,
  key: string,
): Promise<void> {
  // AAD binds the ciphertext to this user and this credential name, so a row
  // copied between users or between slots fails to decrypt rather than
  // silently working.
  const secret = encryptSecret(key, credentialAad(userId, ANTHROPIC_KEY_NAME));
  const now = new Date();

  await db
    .insert(credentialVault)
    .values({
      userId,
      name: ANTHROPIC_KEY_NAME,
      type: "llm_api_key",
      secret,
    })
    .onConflictDoUpdate({
      target: [credentialVault.userId, credentialVault.name],
      set: { secret, updatedAt: now },
    });
}

export async function clearAnthropicKey(userId: string): Promise<void> {
  await db
    .delete(credentialVault)
    .where(
      and(
        eq(credentialVault.userId, userId),
        eq(credentialVault.name, ANTHROPIC_KEY_NAME),
      ),
    );
}

/**
 * Checks a key against Anthropic before it is stored.
 *
 * A one-token completion is the cheapest call that exercises authentication;
 * `/v1/models` would pass for a key that lacks completion access. The key is
 * sent straight to Anthropic and never logged — it is not written to the
 * vault unless this succeeds, so a typo cannot silently disable the agent.
 */
export async function testAnthropicKey(
  key: string,
  modelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    if (response.ok) return { ok: true };

    const detail = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return {
      ok: false,
      error:
        detail?.error?.message ??
        `Anthropic rejected the key (HTTP ${response.status}).`,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Could not reach Anthropic: ${error.message}`
          : "Could not reach Anthropic.",
    };
  }
}
