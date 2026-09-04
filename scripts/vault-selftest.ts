import assert from "node:assert/strict";
import {
  credentialAad,
  decryptJson,
  encryptJson,
  encryptSecret,
  decryptSecret,
  generateEncryptionKey,
  isVaultEnvelope,
  resetKeyCache,
  safeEquals,
  VaultError,
} from "../src/lib/crypto/vault";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local yet — fall through to an ephemeral key below.
}

if (!process.env.APP8N_ENCRYPTION_KEY) {
  process.env.APP8N_ENCRYPTION_KEY = generateEncryptionKey();
  console.log("  (no APP8N_ENCRYPTION_KEY found; testing with a throwaway key)");
}
resetKeyCache();

const checks: [string, () => void][] = [
  [
    "round-trips a secret",
    () => {
      const secret = "ya29.a0AfH6SMB-fake-refresh-token";
      const envelope = encryptSecret(secret);
      assert.ok(isVaultEnvelope(envelope));
      assert.notEqual(envelope, secret);
      assert.equal(decryptSecret(envelope), secret);
    },
  ],
  [
    "round-trips JSON token sets",
    () => {
      const tokens = { access_token: "abc", refresh_token: "def", expiry: 123 };
      const envelope = encryptJson(tokens);
      assert.deepEqual(decryptJson(envelope), tokens);
    },
  ],
  [
    "produces a distinct ciphertext per call",
    () => {
      assert.notEqual(encryptSecret("same"), encryptSecret("same"));
    },
  ],
  [
    "binds ciphertext to its AAD context",
    () => {
      const envelope = encryptSecret("token", credentialAad("user-1", "gmail"));
      assert.equal(
        decryptSecret(envelope, credentialAad("user-1", "gmail")),
        "token",
      );
      assert.throws(
        () => decryptSecret(envelope, credentialAad("user-2", "gmail")),
        VaultError,
      );
    },
  ],
  [
    "rejects tampered ciphertext",
    () => {
      const envelope = encryptSecret("token");
      const parts = envelope.split(".");
      parts[4] = Buffer.from("tampered").toString("base64url");
      assert.throws(() => decryptSecret(parts.join(".")), VaultError);
    },
  ],
  [
    "rejects a malformed envelope",
    () => {
      assert.throws(() => decryptSecret("not-an-envelope"), VaultError);
    },
  ],
  [
    "rejects the wrong master key",
    () => {
      const envelope = encryptSecret("token");
      process.env.APP8N_ENCRYPTION_KEY = generateEncryptionKey();
      resetKeyCache();
      assert.throws(() => decryptSecret(envelope), VaultError);
    },
  ],
  [
    "compares secrets in constant time",
    () => {
      assert.ok(safeEquals("abc", "abc"));
      assert.ok(!safeEquals("abc", "abd"));
      assert.ok(!safeEquals("abc", "abcd"));
    },
  ],
];

let failed = 0;
for (const [name, run] of checks) {
  try {
    run();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(error);
  }
}

console.log(`\n  ${checks.length - failed}/${checks.length} vault checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
