import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { credentialVault } from "@/lib/db/schema";
import { credentialAad, decryptSecret, encryptSecret } from "@/lib/crypto/vault";
import {
  baseUrlFor,
  configuredProvider,
  FALLBACK_PROVIDER,
  MODEL_PROVIDERS,
  PROVIDERS,
  type ModelProvider,
  type ProviderDefinition,
} from "./providers";

export type ApiKeySource = "vault" | "env" | "none";

export interface ApiKeyStatus {
  provider: ModelProvider;
  providerLabel: string;
  /** False for a local provider, where the UI hides the key field entirely. */
  requiresKey: boolean;
  /** Where a self-hosted provider is reached. Absent for hosted ones. */
  baseUrl?: string;
  source: ApiKeySource;
  /** Last four characters only — enough to recognise, useless if leaked. */
  hint: string | null;
  updatedAt: string | null;
  /** So the settings field can render without a second round trip. */
  envVar: string;
  placeholder: string;
  consoleUrl: string;
  freeTier: boolean;
}

function hintOf(key: string): string {
  return key.length <= 4 ? "••••" : `••••${key.slice(-4)}`;
}

async function readVaultRow(userId: string, name: string) {
  const [row] = await db
    .select()
    .from(credentialVault)
    .where(
      and(eq(credentialVault.userId, userId), eq(credentialVault.name, name)),
    )
    .limit(1);
  return row ?? null;
}

function decryptRow(
  userId: string,
  name: string,
  secret: string,
): string | null {
  try {
    return decryptSecret(secret, credentialAad(userId, name));
  } catch {
    // A row encrypted under a rotated master key is unusable, not fatal:
    // callers fall through to the environment rather than bricking the agent.
    return null;
  }
}

/**
 * The key for one specific provider. Vault first, environment second.
 *
 * A user who pastes a key into Settings on a phone expects it to take effect;
 * falling back to the environment keeps the developer workflow and the
 * headless scheduler working on a machine where nobody has opened the UI.
 */
export async function resolveKeyFor(
  userId: string,
  provider: ProviderDefinition,
): Promise<{ key: string | null; source: ApiKeySource }> {
  const row = await readVaultRow(userId, provider.vaultKeyName);
  if (row) {
    const key = decryptRow(userId, provider.vaultKeyName, row.secret);
    if (key) return { key, source: "vault" };
  }

  const fromEnv = process.env[provider.envVar];
  return fromEnv
    ? { key: fromEnv, source: "env" }
    : { key: null, source: "none" };
}

/**
 * Which provider the agent should actually run on.
 *
 * An explicit `APP8N_MODEL_PROVIDER` always wins. Otherwise the first provider
 * that holds a key is used, so saving a Gemini key in Settings is enough on
 * its own — requiring an environment variable as well would mean the UI
 * appeared to accept a key that never took effect.
 */
export async function activeProvider(
  userId: string,
): Promise<ProviderDefinition> {
  const explicit = configuredProvider();
  if (explicit) return PROVIDERS[explicit];

  for (const id of MODEL_PROVIDERS) {
    if (await providerConfigured(userId, PROVIDERS[id])) return PROVIDERS[id];
  }

  return PROVIDERS[FALLBACK_PROVIDER];
}

/**
 * Whether a provider is usable without further setup.
 *
 * A keyless provider counts as configured only when its address is set
 * explicitly. Probing the default localhost port instead would mean an
 * unrelated Ollama install silently captured the agent from a hosted provider
 * the user had deliberately chosen.
 */
export async function providerConfigured(
  userId: string,
  provider: ProviderDefinition,
): Promise<boolean> {
  if (!provider.requiresKey) {
    return Boolean(
      provider.baseUrlEnvVar && process.env[provider.baseUrlEnvVar]?.trim(),
    );
  }
  const { key } = await resolveKeyFor(userId, provider);
  return Boolean(key);
}

/** The resolved provider and its key, which is what a run needs. */
export async function resolveModelKey(userId: string): Promise<{
  provider: ProviderDefinition;
  key: string | null;
  source: ApiKeySource;
}> {
  const provider = await activeProvider(userId);
  const { key, source } = await resolveKeyFor(userId, provider);
  return { provider, key, source };
}

export async function getKeyStatus(userId: string): Promise<ApiKeyStatus> {
  const provider = await activeProvider(userId);
  const row = await readVaultRow(userId, provider.vaultKeyName);

  const base = {
    provider: provider.id,
    providerLabel: provider.label,
    requiresKey: provider.requiresKey,
    baseUrl: baseUrlFor(provider),
    envVar: provider.envVar,
    placeholder: provider.placeholder,
    consoleUrl: provider.consoleUrl,
    freeTier: provider.freeTier,
  };

  // A keyless provider has no vault row to report on — it is configured by
  // being reachable, which only a live check can establish.
  if (!provider.requiresKey) {
    return { ...base, source: "none", hint: null, updatedAt: null };
  }

  if (row) {
    const key = decryptRow(userId, provider.vaultKeyName, row.secret);
    return {
      ...base,
      source: "vault",
      hint: key ? hintOf(key) : null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  }

  const fromEnv = process.env[provider.envVar];
  return fromEnv
    ? { ...base, source: "env", hint: hintOf(fromEnv), updatedAt: null }
    : { ...base, source: "none", hint: null, updatedAt: null };
}

export async function setModelKey(
  userId: string,
  provider: ProviderDefinition,
  key: string,
): Promise<void> {
  // AAD binds the ciphertext to this user and this credential name, so a row
  // copied between users or between slots fails to decrypt rather than
  // silently working.
  const secret = encryptSecret(
    key,
    credentialAad(userId, provider.vaultKeyName),
  );
  const now = new Date();

  await db
    .insert(credentialVault)
    .values({
      userId,
      name: provider.vaultKeyName,
      type: "llm_api_key",
      secret,
    })
    .onConflictDoUpdate({
      target: [credentialVault.userId, credentialVault.name],
      set: { secret, updatedAt: now },
    });
}

export async function clearModelKey(
  userId: string,
  provider: ProviderDefinition,
): Promise<void> {
  await db
    .delete(credentialVault)
    .where(
      and(
        eq(credentialVault.userId, userId),
        eq(credentialVault.name, provider.vaultKeyName),
      ),
    );
}
