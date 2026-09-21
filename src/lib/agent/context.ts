import { isMockGoogle } from "@/lib/config";
import { listGoogleAccounts } from "@/lib/google/credentials";
import { GOOGLE_SERVICES, type GoogleService } from "@/lib/google/scopes";

export interface AgentContext {
  userId: string;
  accountId?: string;
  email?: string;
  services: GoogleService[];
}

/**
 * Resolves which tools the agent may see. Scoping the toolset to services the
 * user actually granted keeps the model from proposing actions that would fail
 * on a missing scope, and shrinks the prompt.
 */
export async function resolveAgentContext(
  userId: string,
  accountId?: string,
): Promise<AgentContext> {
  if (isMockGoogle()) {
    return {
      userId,
      accountId,
      email: "mock@app8n.local",
      services: [...GOOGLE_SERVICES],
    };
  }

  const accounts = await listGoogleAccounts(userId);
  const account =
    (accountId ? accounts.find((a) => a.id === accountId) : undefined) ??
    accounts.find((a) => a.isPrimary) ??
    accounts[0];

  if (!account) return { userId, accountId, services: [] };

  return {
    userId,
    accountId: account.id,
    email: account.email,
    services: account.services,
  };
}
