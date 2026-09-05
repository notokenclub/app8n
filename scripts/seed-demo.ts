/**
 * Puts a pending approval into the local database so the HITL surface can be
 * exercised without a live Anthropic key or a connected Google account.
 *
 * Blueprints are *not* seeded here — `npm run seed:blueprints` owns those, and
 * duplicating them would leave two sets of near-identical workflows on
 * `/workflows`. Safe to re-run; not part of the app's runtime.
 */
import { db } from "../src/lib/db";
import { approvalRequests, executionLogs } from "../src/lib/db/schema";
import { getCurrentUserId } from "../src/lib/auth/session";

async function main() {
  const userId = await getCurrentUserId();

  const [execution] = await db
    .insert(executionLogs)
    .values({
      userId,
      trigger: "chat",
      status: "awaiting_approval",
      inputPayload: { messages: [] },
    })
    .returning({ id: executionLogs.id });

  await db.insert(approvalRequests).values({
    executionId: execution!.id,
    toolCallId: `demo-${Date.now()}`,
    actionName: "gmail_send_email",
    summary: "Send an attendance appeal to dean@university.edu",
    parametersJson: {
      to: "dean@university.edu",
      subject: "Attendance appeal — CS301",
      body: "Dear Dean,\n\nI am writing to appeal the attendance record for CS301. My records show 14 of 18 sessions attended, which is above the 75% threshold.\n\nThank you for your time.\n\nBest regards,\nVarun",
    },
    status: "PENDING",
    expiresAt: new Date(Date.now() + 25 * 60_000),
  });

  console.log("Seeded 1 pending approval. Open /approvals to resolve it.");
}

void main();
