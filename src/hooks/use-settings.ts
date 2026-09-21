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
export const ANTHROPIC_KEY = ["anthropic-key"] as const;

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

export interface AnthropicKeyStatus {
  source: "vault" | "env" | "none";
  hint: string | null;
  updatedAt: string | null;
}

export function useAnthropicKey() {
  return useQuery({
    queryKey: ANTHROPIC_KEY,
    queryFn: () => apiFetch<AnthropicKeyStatus>("/api/settings/anthropic-key"),
  });
}

/**
 * Saves a key. The server verifies it against Anthropic first and returns the
 * masked status; the plaintext is never read back, so the client has no copy
 * to leak once the request is done.
 */
export function useSaveAnthropicKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      apiFetch<{ saved: boolean; status: AnthropicKeyStatus }>(
        "/api/settings/anthropic-key",
        { method: "PUT", body: JSON.stringify({ key }) },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ANTHROPIC_KEY }),
  });
}

export function useClearAnthropicKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ cleared: boolean; status: AnthropicKeyStatus }>(
        "/api/settings/anthropic-key",
        { method: "DELETE" },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ANTHROPIC_KEY }),
  });
}
