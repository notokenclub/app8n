/**
 * Puts a pending approval and a couple of blueprints into the local database
 * so the UI can be exercised without a live Anthropic key or a connected
 * Google account. Safe to re-run; not part of the app's runtime.
 */
import { db } from "../src/lib/db";
import {
  approvalRequests,
  executionLogs,
  workflows,
} from "../src/lib/db/schema";
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
    executionId: execution.id,
    toolCallId: "demo-call-1",
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

  await db.insert(workflows).values([
    {
      userId,
      title: "Morning briefing",
      description:
        "Every weekday at 7am, summarise unread mail and read out today's calendar.",
      triggerType: "cron",
      cronExpression: "0 7 * * 1-5",
      status: "active",
      nodesJson: [
        { id: "n1", label: "Check calendar", tool: "calendar_list_events" },
        { id: "n2", label: "Scan unread mail", tool: "gmail_search_messages" },
        { id: "n3", label: "Write the brief", tool: "docs_create" },
      ],
      edgesJson: [],
    },
    {
      userId,
      title: "Lead capture",
      description:
        "When a new enquiry lands in Gmail, extract the contact details into the leads sheet.",
      triggerType: "gmail_poll",
      status: "paused",
      nodesJson: [
        { id: "n1", label: "Find new enquiries", tool: "gmail_search_messages" },
        { id: "n2", label: "Read the message", tool: "gmail_get_message" },
        { id: "n3", label: "Append to sheet", tool: "sheets_append_row" },
        { id: "n4", label: "Mark as read", tool: "gmail_mark_read" },
      ],
      edgesJson: [],
    },
  ]);

  console.log("Seeded 1 pending approval and 2 blueprints.");
}

void main();
