import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * app8n is local-first and single-tenant by default: the backend runs on the
 * user's own machine, so there is one implicit owner rather than a login.
 * Multi-user deployments replace this with a real session lookup.
 */
const LOCAL_USER_EMAIL =
  process.env.APP8N_LOCAL_USER_EMAIL ?? "local@app8n.local";

export async function getCurrentUserId(): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, LOCAL_USER_EMAIL))
    .limit(1);
  if (existing) return existing.id;

  try {
    const [created] = await db
      .insert(users)
      .values({ email: LOCAL_USER_EMAIL, name: "Local User" })
      .returning({ id: users.id });
    return created.id;
  } catch {
    // Concurrent first request already inserted the row.
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, LOCAL_USER_EMAIL))
      .limit(1);
    if (!row) throw new Error("Failed to resolve the local app8n user.");
    return row.id;
  }
}
