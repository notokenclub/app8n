import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { credentialVault } from "@/lib/db/schema";
import {
  credentialAad,
  decryptSecret,
  encryptSecret,
  safeEquals,
} from "@/lib/crypto/vault";

/**
 * Secrets for webhook-triggered workflows.
 *
 * A webhook trigger is an unauthenticated door into an agent that can send
 * mail, so the URL alone is not the credential: callers present the secret in
 * `x-app8n-webhook-secret`, and it is compared in constant time. The secret
 * itself lives in the same AES-256-GCM vault as every other credential, keyed
 * per workflow, so it is no more readable at rest than an OAuth token.
 */

function credentialName(workflowId: string): string {
  return `webhook:${workflowId}`;
}

export async function ensureWebhookSecret(
  userId: string,
  workflowId: string,
): Promise<string> {
  const name = credentialName(workflowId);

  const [existing] = await db
    .select({ secret: credentialVault.secret })
    .from(credentialVault)
    .where(
      and(eq(credentialVault.userId, userId), eq(credentialVault.name, name)),
    )
    .limit(1);

  if (existing) {
    return decryptSecret(existing.secret, credentialAad(userId, name));
  }

  const secret = randomBytes(24).toString("base64url");
  await db.insert(credentialVault).values({
    userId,
    name,
    type: "webhook_secret",
    secret: encryptSecret(secret, credentialAad(userId, name)),
  });

  return secret;
}

export async function getWebhookSecret(
  userId: string,
  workflowId: string,
): Promise<string | null> {
  const name = credentialName(workflowId);
  const [row] = await db
    .select({ secret: credentialVault.secret })
    .from(credentialVault)
    .where(
      and(eq(credentialVault.userId, userId), eq(credentialVault.name, name)),
    )
    .limit(1);

  if (!row) return null;
  return decryptSecret(row.secret, credentialAad(userId, name));
}

export async function revokeWebhookSecret(
  userId: string,
  workflowId: string,
): Promise<void> {
  await db
    .delete(credentialVault)
    .where(
      and(
        eq(credentialVault.userId, userId),
        eq(credentialVault.name, credentialName(workflowId)),
      ),
    );
}

/** Constant-time check of a presented secret against the stored one. */
export function webhookSecretMatches(
  presented: string | null,
  expected: string,
): boolean {
  if (!presented) return false;
  return safeEquals(presented, expected);
}
