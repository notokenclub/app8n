import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { resolveAnthropicKey } from "./api-key";

export const DEFAULT_MODEL_ID = "claude-opus-4-7";

export function isAgentConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** True when either the vault or the environment can supply a key. */
export async function isAgentConfiguredFor(userId: string): Promise<boolean> {
  const { key } = await resolveAnthropicKey(userId);
  return Boolean(key);
}

export class AgentNotConfiguredError extends Error {
  constructor() {
    super(
      "No Anthropic API key. Add one in Settings, or set ANTHROPIC_API_KEY in .env.local.",
    );
    this.name = "AgentNotConfiguredError";
  }
}

/**
 * Resolves the chat model. Read lazily so the process can boot — and the
 * connector self-tests can run — without an API key present.
 */
export function agentModel(modelId = DEFAULT_MODEL_ID): LanguageModel {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AgentNotConfiguredError();
  return createAnthropic({ apiKey })(modelId);
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
  modelId = DEFAULT_MODEL_ID,
): Promise<LanguageModel> {
  const { key } = await resolveAnthropicKey(userId);
  if (!key) throw new AgentNotConfiguredError();
  return createAnthropic({ apiKey: key })(modelId);
}
