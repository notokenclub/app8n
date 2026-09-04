import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export const DEFAULT_MODEL_ID = "claude-opus-4-7";

export function isAgentConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class AgentNotConfiguredError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local to enable the agent.",
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
