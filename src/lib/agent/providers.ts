import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * The model providers the agent can run on.
 *
 * app8n is local-first and its users are not all willing (or able) to hold a
 * paid API account, so the agent is not tied to one vendor. Everything above
 * this module — the tool registry, the approval gate, the scheduler — is
 * provider-agnostic already; this is the only place a vendor is named.
 */
export const MODEL_PROVIDERS = ["anthropic", "google"] as const;

export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export type KeyTestResult = { ok: true } | { ok: false; error: string };

export interface ProviderDefinition {
  id: ModelProvider;
  label: string;
  /** Overridable per deployment with APP8N_MODEL_ID. */
  defaultModel: string;
  envVar: string;
  /** Vault row name. Stable per provider — renaming one orphans its key. */
  vaultKeyName: string;
  /** Shown in the settings field so a key is recognisable before saving. */
  placeholder: string;
  /** Where a user gets one. */
  consoleUrl: string;
  /** True when the provider has a no-cost tier, which the UI points out. */
  freeTier: boolean;
  createModel: (apiKey: string, modelId: string) => LanguageModel;
  testKey: (apiKey: string, modelId: string) => Promise<KeyTestResult>;
}

function errorMessage(error: unknown, provider: string): string {
  return error instanceof Error
    ? `Could not reach ${provider}: ${error.message}`
    : `Could not reach ${provider}.`;
}

export const PROVIDERS: Record<ModelProvider, ProviderDefinition> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    defaultModel: "claude-opus-4-7",
    envVar: "ANTHROPIC_API_KEY",
    // Unchanged from when Anthropic was the only provider, so keys already in
    // the vault keep working across this change.
    vaultKeyName: "anthropic_api_key",
    placeholder: "sk-ant-…",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    freeTier: false,
    createModel: (apiKey, modelId) => createAnthropic({ apiKey })(modelId),
    // A one-token completion is the cheapest call that exercises
    // authentication; a models listing would pass for a key that cannot
    // actually generate.
    testKey: async (apiKey, modelId) => {
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
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
        return { ok: false, error: errorMessage(error, "Anthropic") };
      }
    },
  },

  google: {
    id: "google",
    label: "Google Gemini",
    // Flash rather than Pro: it is the tier Google's free quota covers, and it
    // handles the multi-step tool calling app8n depends on.
    defaultModel: "gemini-2.5-flash",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    vaultKeyName: "google_api_key",
    placeholder: "AIza…",
    consoleUrl: "https://aistudio.google.com/apikey",
    freeTier: true,
    createModel: (apiKey, modelId) =>
      createGoogleGenerativeAI({ apiKey })(modelId),
    testKey: async (apiKey, modelId) => {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              // Header rather than a query parameter, so the key cannot end up
              // in a proxy or server access log.
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "hi" }] }],
              generationConfig: { maxOutputTokens: 1 },
            }),
          },
        );

        if (response.ok) return { ok: true };

        const detail = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        return {
          ok: false,
          error:
            detail?.error?.message ??
            `Google rejected the key (HTTP ${response.status}).`,
        };
      } catch (error) {
        return { ok: false, error: errorMessage(error, "Google") };
      }
    },
  },
};

export function isModelProvider(value: unknown): value is ModelProvider {
  return (
    typeof value === "string" &&
    (MODEL_PROVIDERS as readonly string[]).includes(value)
  );
}

/** Used when nothing is configured and nothing is stored. */
export const FALLBACK_PROVIDER: ModelProvider = "anthropic";

/**
 * The provider named by the environment, if any.
 *
 * Returning null rather than a default lets the caller fall back to whichever
 * provider actually holds a key — a user who saved a Gemini key in Settings
 * should not also have to set an environment variable to be able to use it.
 */
export function configuredProvider(): ModelProvider | null {
  const raw = process.env.APP8N_MODEL_PROVIDER?.trim().toLowerCase();
  if (!raw) return null;
  if (!isModelProvider(raw)) {
    throw new Error(
      `APP8N_MODEL_PROVIDER is "${raw}"; expected one of ${MODEL_PROVIDERS.join(", ")}.`,
    );
  }
  return raw;
}

/** Model id for a provider, overridable per deployment. */
export function modelIdFor(provider: ProviderDefinition): string {
  return process.env.APP8N_MODEL_ID?.trim() || provider.defaultModel;
}
