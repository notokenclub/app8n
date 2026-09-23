import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * The model providers the agent can run on.
 *
 * app8n is local-first and its users are not all willing (or able) to hold a
 * paid API account, so the agent is not tied to one vendor. Everything above
 * this module — the tool registry, the approval gate, the scheduler — is
 * provider-agnostic already; this is the only place a vendor is named.
 *
 * Order matters: auto-detection walks this list and takes the first provider
 * that is configured. Hosted providers come before the local one so an
 * installed-but-idle Ollama does not quietly displace a key the user set.
 */
export const MODEL_PROVIDERS = [
  "anthropic",
  "google",
  "openai",
  "ollama",
] as const;

export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export type KeyTestResult = { ok: true } | { ok: false; error: string };

export interface ProviderModelOptions {
  apiKey?: string;
  modelId: string;
  baseUrl?: string;
}

export interface ProviderDefinition {
  id: ModelProvider;
  label: string;
  /** Overridable per deployment with APP8N_MODEL_ID. */
  defaultModel: string;
  /** Empty for a provider that needs no key, which the UI branches on. */
  envVar: string;
  /** Vault row name. Stable per provider — renaming one orphans its key. */
  vaultKeyName: string;
  /**
   * False for a provider that authenticates by reachability rather than a
   * secret. A local Ollama server has no key to hold, so treating a missing
   * key as "not configured" would make it permanently unusable.
   */
  requiresKey: boolean;
  /** Set when the provider is reached at an address the user controls. */
  baseUrlEnvVar?: string;
  defaultBaseUrl?: string;
  /** Shown in the settings field so a key is recognisable before saving. */
  placeholder: string;
  /** Where a user gets a key, or how they install the runtime. */
  consoleUrl: string;
  /** True when the provider costs nothing to run, which the UI points out. */
  freeTier: boolean;
  createModel: (options: ProviderModelOptions) => LanguageModel;
  /** Verifies the provider will actually answer, before anything is stored. */
  testConnection: (options: ProviderModelOptions) => Promise<KeyTestResult>;
}

function unreachable(error: unknown, label: string): KeyTestResult {
  return {
    ok: false,
    error:
      error instanceof Error
        ? `Could not reach ${label}: ${error.message}`
        : `Could not reach ${label}.`,
  };
}

/** Reads `{error:{message}}`, the shape all three hosted providers return. */
async function providerError(
  response: Response,
  label: string,
): Promise<string> {
  const detail = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return (
    detail?.error?.message ??
    `${label} rejected the key (HTTP ${response.status}).`
  );
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
    requiresKey: true,
    placeholder: "sk-ant-…",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    freeTier: false,
    createModel: ({ apiKey, modelId }) =>
      createAnthropic({ apiKey })(modelId),
    // A one-token completion is the cheapest call that exercises
    // authentication; a models listing would pass for a key that cannot
    // actually generate.
    testConnection: async ({ apiKey, modelId }) => {
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey ?? "",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: modelId,
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
        });
        return response.ok
          ? { ok: true }
          : { ok: false, error: await providerError(response, "Anthropic") };
      } catch (error) {
        return unreachable(error, "Anthropic");
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
    requiresKey: true,
    placeholder: "AIza…",
    consoleUrl: "https://aistudio.google.com/apikey",
    freeTier: true,
    createModel: ({ apiKey, modelId }) =>
      createGoogleGenerativeAI({ apiKey })(modelId),
    testConnection: async ({ apiKey, modelId }) => {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              // Header rather than a query parameter, so the key cannot end up
              // in a proxy or server access log.
              "x-goog-api-key": apiKey ?? "",
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "hi" }] }],
              generationConfig: { maxOutputTokens: 1 },
            }),
          },
        );
        return response.ok
          ? { ok: true }
          : { ok: false, error: await providerError(response, "Google") };
      } catch (error) {
        return unreachable(error, "Google");
      }
    },
  },

  openai: {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4.1-mini",
    envVar: "OPENAI_API_KEY",
    vaultKeyName: "openai_api_key",
    requiresKey: true,
    placeholder: "sk-…",
    consoleUrl: "https://platform.openai.com/api-keys",
    freeTier: false,
    createModel: ({ apiKey, modelId }) => createOpenAI({ apiKey })(modelId),
    testConnection: async ({ apiKey, modelId }) => {
      try {
        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${apiKey ?? ""}`,
            },
            body: JSON.stringify({
              model: modelId,
              max_completion_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          },
        );
        return response.ok
          ? { ok: true }
          : { ok: false, error: await providerError(response, "OpenAI") };
      } catch (error) {
        return unreachable(error, "OpenAI");
      }
    },
  },

  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    // Chosen for tool calling rather than raw benchmark scores: app8n's whole
    // surface is tools, and a model that cannot call them reliably is useless
    // here however well it writes prose.
    defaultModel: "qwen2.5",
    // Keyless — reachability is the credential.
    envVar: "",
    vaultKeyName: "ollama_api_key",
    requiresKey: false,
    baseUrlEnvVar: "OLLAMA_BASE_URL",
    defaultBaseUrl: "http://localhost:11434",
    placeholder: "",
    consoleUrl: "https://ollama.com/download",
    freeTier: true,
    createModel: ({ modelId, baseUrl }) =>
      createOpenAICompatible({
        name: "ollama",
        // Ollama serves an OpenAI-shaped API under /v1 beside its native one.
        baseURL: `${(baseUrl ?? "http://localhost:11434").replace(/\/$/, "")}/v1`,
        // The SDK requires a key; Ollama ignores it entirely.
        apiKey: "ollama",
      })(modelId),
    /**
     * Checks the server is up *and* the model is actually pulled.
     *
     * Reachability alone is not enough: a running Ollama with no matching
     * model fails at the first real request, long after the user believed
     * setup was finished.
     */
    testConnection: async ({ modelId, baseUrl }) => {
      const root = (baseUrl ?? "http://localhost:11434").replace(/\/$/, "");
      try {
        const response = await fetch(`${root}/api/tags`);
        if (!response.ok) {
          return {
            ok: false,
            error: `Ollama answered with HTTP ${response.status} at ${root}.`,
          };
        }

        const body = (await response.json().catch(() => null)) as {
          models?: { name?: string }[];
        } | null;
        const installed = (body?.models ?? [])
          .map((model) => model.name)
          .filter((name): name is string => Boolean(name));

        // Ollama reports "qwen2.5:latest" for a bare "qwen2.5" pull.
        const present = installed.some(
          (name) => name === modelId || name.split(":")[0] === modelId,
        );
        if (!present) {
          return {
            ok: false,
            error:
              `Ollama is running, but "${modelId}" is not installed. ` +
              `Run: ollama pull ${modelId}` +
              (installed.length
                ? ` (installed: ${installed.join(", ")})`
                : " (no models installed yet)"),
          };
        }

        return { ok: true };
      } catch (error) {
        return unreachable(error, `Ollama at ${root}`);
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

/** Where a self-hosted provider is reached. Null for hosted ones. */
export function baseUrlFor(provider: ProviderDefinition): string | undefined {
  if (!provider.baseUrlEnvVar) return undefined;
  return (
    process.env[provider.baseUrlEnvVar]?.trim() || provider.defaultBaseUrl
  );
}
