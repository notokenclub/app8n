"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GoogleService } from "@/lib/google/scopes";
import { apiFetch } from "@/lib/client-api";

export interface LinkedAccount {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  services: GoogleService[];
  isPrimary: boolean;
  createdAt: string;
}

export interface AccountsResponse {
  accounts: LinkedAccount[];
  googleConfigured: boolean;
  mockMode: boolean;
}

export const ACCOUNTS_KEY = ["google-accounts"] as const;
export const MODEL_KEY = ["model-key"] as const;

export function useGoogleAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => apiFetch<AccountsResponse>("/api/auth/google/accounts"),
  });
}

export function useDisconnectAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) =>
      apiFetch<{ disconnected: boolean }>(
        `/api/auth/google/accounts?accountId=${encodeURIComponent(accountId)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  });
}

export type ServiceProbeStatus = "ok" | "failed" | "not_exercisable";

export interface ServiceProbe {
  service: string;
  status: ServiceProbeStatus;
  error?: string;
}

export interface AccountHealth {
  accountId: string;
  email: string;
  ok: boolean;
  needsReconnect: boolean;
  mock: boolean;
  error?: string;
  services: ServiceProbe[];
  checkedAt: string;
}

/**
 * Verifies a linked account against Google for real.
 *
 * A mutation rather than a query: it spends live API calls, so it runs when
 * the user asks for it and never on a background refetch.
 */
export function useCheckAccount() {
  return useMutation({
    mutationFn: (accountId: string) =>
      apiFetch<AccountHealth>(
        `/api/auth/google/health?accountId=${encodeURIComponent(accountId)}`,
        { method: "POST" },
      ),
  });
}

export interface ModelKeyStatus {
  provider: "anthropic" | "google" | "openai" | "ollama";
  providerLabel: string;
  requiresKey: boolean;
  baseUrl?: string;
  source: "vault" | "env" | "none";
  hint: string | null;
  updatedAt: string | null;
  envVar: string;
  placeholder: string;
  consoleUrl: string;
  freeTier: boolean;
}

export function useModelKey() {
  return useQuery({
    queryKey: MODEL_KEY,
    queryFn: () => apiFetch<ModelKeyStatus>("/api/settings/model-key"),
  });
}

export function useSaveModelKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      apiFetch<{ saved: boolean; status: ModelKeyStatus }>(
        "/api/settings/model-key",
        { method: "PUT", body: JSON.stringify({ key }) },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MODEL_KEY }),
  });
}

export function useClearModelKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ cleared: boolean; status: ModelKeyStatus }>(
        "/api/settings/model-key",
        { method: "DELETE" },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MODEL_KEY }),
  });
}

export interface ConnectionTestResult {
  ok: boolean;
  error?: string;
}

/**
 * Checks a keyless provider actually answers.
 *
 * A local runtime has no key to validate on save, so without this its first
 * sign of trouble would be a failed run rather than a failed setup.
 */
export function useTestProvider() {
  return useMutation({
    mutationFn: () =>
      apiFetch<ConnectionTestResult>("/api/settings/model-key", {
        method: "POST",
      }),
  });
}
