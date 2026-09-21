/**
 * Side-effect module that prepares a throwaway environment for the self-tests.
 *
 * This lives in its own file because imports are hoisted and evaluated before
 * any statement in the importing module: setting these variables at the top of
 * a test script would still run *after* `src/lib/db` had already opened the
 * developer's real database. Import this first, before anything from `src/`.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "app8n-selftest-"));

process.env.DATABASE_URL = `file:${join(scratch, "selftest.db")}`;
process.env.APP8N_MOCK_GOOGLE = "1";
process.env.APP8N_ENCRYPTION_KEY ||= Buffer.alloc(32, 9).toString("base64");
process.env.ANTHROPIC_API_KEY ||= "selftest-key";

export const SCRATCH_DIR = scratch;
