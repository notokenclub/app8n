import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushDevices, type PushDevice, type PushPlatform } from "@/lib/db/schema";

export interface RegisterDeviceInput {
  userId: string;
  platform: PushPlatform;
  token: string;
}

/**
 * Records a device as a delivery address for this user.
 *
 * Upserted on the token rather than inserted: APNs and FCM reissue the same
 * token to a reinstalled app, and a duplicate row would deliver every approval
 * twice to one phone.
 */
export async function registerDevice(
  params: RegisterDeviceInput,
): Promise<PushDevice> {
  const now = new Date();
  const [row] = await db
    .insert(pushDevices)
    .values({
      userId: params.userId,
      platform: params.platform,
      token: params.token,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: pushDevices.token,
      set: {
        userId: params.userId,
        platform: params.platform,
        lastSeenAt: now,
        updatedAt: now,
      },
    })
    .returning();

  return row;
}

export async function listDevices(userId: string): Promise<PushDevice[]> {
  return db
    .select()
    .from(pushDevices)
    .where(eq(pushDevices.userId, userId))
    .orderBy(desc(pushDevices.lastSeenAt));
}

/** Scoped to the owner so one user cannot unregister another's device. */
export async function removeDevice(
  userId: string,
  token: string,
): Promise<boolean> {
  const removed = await db
    .delete(pushDevices)
    .where(and(eq(pushDevices.userId, userId), eq(pushDevices.token, token)))
    .returning({ id: pushDevices.id });

  return removed.length > 0;
}

/** Drops a token the push provider has told us is permanently dead. */
export async function forgetToken(token: string): Promise<void> {
  await db.delete(pushDevices).where(eq(pushDevices.token, token));
}
