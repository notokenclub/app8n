import { generateEncryptionKey } from "../src/lib/crypto/vault";

const key = generateEncryptionKey();

console.log("\n  app8n vault master key (AES-256-GCM)\n");
console.log(`  APP8N_ENCRYPTION_KEY=${key}\n`);
console.log("  Add this to .env.local. Keep it out of version control.");
console.log("  If you lose it, every stored credential becomes unreadable");
console.log("  and each connected account must be re-linked.\n");
