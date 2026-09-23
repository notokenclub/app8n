import type { LanguageModel } from "ai";
import { resolveModelKey } from "./model-key";
import {
  baseUrlFor,
  modelIdFor,
  MODEL_PROVIDERS,
  PROVIDERS,
} from "./providers";

export class AgentNotConfiguredError extends Error {
  constructor(envVar = "an API key") {
    super(
      `No model API key. Add one in Settings, or set ${envVar} in .env.local.`,
    );
    this.name = "AgentNotConfiguredError";
  }
}

/** True when either the vault or the environment can supply a key. */
export async function isAgentConfiguredFor(userId: string): Promise<boolean> {
  const { provider, key } = await resolveModelKey(userId);
  return provider.requiresKey ? Boolean(key) : true;
}

/**
 * Advisory boot-time check for the worker. It has no user to resolve, so it
 * can only report whether *some* provider key is present in the environment.
 */
export function isAgentConfiguredInEnv(): boolean {
  return MODEL_PROVIDERS.some((id) => {
    const provider = PROVIDERS[id];
    // A keyless provider is configured by being reachable, which this
    // boot-time check cannot determine without a network call.
    return provider.envVar ? Boolean(process.env[provider.envVar]) : false;
  });
}

/**
 * The model for a specific user, preferring the key they saved in the vault.
 *
 * Every run goes through here rather than reading `process.env` directly, so a
 * key entered on a phone governs the background scheduler too — otherwise the
 * UI would appear to accept a key that only chat ever used.
 */
export async function agentModelFor(
  userId: string,
  modelId?: string,
): Promise<LanguageModel> {
  const { provider, key } = await resolveModelKey(userId);
  if (provider.requiresKey && !key) {
    throw new AgentNotConfiguredError(provider.envVar);
  }
  return provider.createModel({
    apiKey: key ?? undefined,
    modelId: modelId ?? modelIdFor(provider),
    baseUrl: baseUrlFor(provider),
  });
}

/** The message shown when a run cannot start, naming the right variable. */
export async function notConfiguredMessage(userId: string): Promise<string> {
  const { provider } = await resolveModelKey(userId);
  return `No ${provider.label} API key. Add one in Settings, or set ${provider.envVar} in .env.local.`;
}
