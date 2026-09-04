import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ENVELOPE_PREFIX = "app8n";

export const KEY_VERSION = 1;
export const ENCRYPTION_KEY_ENV = "APP8N_ENCRYPTION_KEY";

export class VaultError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "VaultError";
  }
}

let cachedKey: Buffer | null = null;

/** Generates a fresh base64 master key suitable for `APP8N_ENCRYPTION_KEY`. */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env[ENCRYPTION_KEY_ENV];
  if (!raw) {
    throw new VaultError(
      `${ENCRYPTION_KEY_ENV} is not set. Run \`npm run vault:keygen\` and add the value to .env.local.`,
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch (cause) {
    throw new VaultError(`${ENCRYPTION_KEY_ENV} is not valid base64.`, {
      cause,
    });
  }

  if (key.length !== KEY_BYTES) {
    throw new VaultError(
      `${ENCRYPTION_KEY_ENV} must decode to exactly ${KEY_BYTES} bytes (got ${key.length}). Run \`npm run vault:keygen\` for a valid key.`,
    );
  }

  cachedKey = key;
  return key;
}

/** Test-only: drops the memoized key so a new env value takes effect. */
export function resetKeyCache(): void {
  cachedKey = null;
}

/**
 * Encrypts a secret into a self-describing envelope:
 * `app8n.v1.<iv>.<authTag>.<ciphertext>` (all base64url).
 *
 * `aad` is bound into the GCM tag but not stored, so a ciphertext copied into a
 * different row fails to decrypt rather than silently resolving another user's
 * credential. Callers must pass the same value on decrypt.
 */
export function encryptSecret(plaintext: string, aad?: string): string {
  if (typeof plaintext !== "string") {
    throw new VaultError("Only string plaintext can be encrypted.");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadKey(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    ENVELOPE_PREFIX,
    `v${KEY_VERSION}`,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(envelope: string, aad?: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 5 || parts[0] !== ENVELOPE_PREFIX) {
    throw new VaultError("Malformed vault envelope.");
  }

  const [, version, ivPart, tagPart, ciphertextPart] = parts;
  if (version !== `v${KEY_VERSION}`) {
    throw new VaultError(`Unsupported vault envelope version: ${version}.`);
  }

  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(tagPart, "base64url");
  if (iv.length !== IV_BYTES || authTag.length !== TAG_BYTES) {
    throw new VaultError("Vault envelope has an invalid IV or auth tag.");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, loadKey(), iv);
    decipher.setAuthTag(authTag);
    if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (cause) {
    if (cause instanceof VaultError) throw cause;
    throw new VaultError(
      "Failed to decrypt secret: wrong key, wrong context, or tampered ciphertext.",
      { cause },
    );
  }
}

export function encryptJson(value: unknown, aad?: string): string {
  return encryptSecret(JSON.stringify(value), aad);
}

export function decryptJson<T>(envelope: string, aad?: string): T {
  return JSON.parse(decryptSecret(envelope, aad)) as T;
}

export function isVaultEnvelope(value: string): boolean {
  return value.startsWith(`${ENVELOPE_PREFIX}.v`) && value.split(".").length === 5;
}

/**
 * Compares two secrets without leaking length or position through timing —
 * for verifying inbound webhook signatures against a stored secret.
 */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Canonical AAD for a vault row, binding ciphertext to its owner and name. */
export function credentialAad(userId: string, name: string): string {
  return `credential:${userId}:${name}`;
}
