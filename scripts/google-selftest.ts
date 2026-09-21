import assert from "node:assert/strict";
import { createHash } from "node:crypto";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Fall through to the defaults below.
}

// Exercise the connectors against fixtures: no network, no Google credentials.
process.env.APP8N_MOCK_GOOGLE = "1";
process.env.GOOGLE_CLIENT_ID ||= "selftest-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET ||= "selftest-client-secret";
process.env.APP8N_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");

import { z } from "zod";
import {
  buildAuthorizationUrl,
  consumeOAuthState,
  createOAuthState,
  createPkcePair,
  GoogleOAuthError,
} from "../src/lib/google/oauth";
import {
  scopesForServices,
  servicesFromScopes,
  SERVICE_SCOPES,
} from "../src/lib/google/scopes";
import { getMockStore, resetMockStore } from "../src/lib/google/mock";
import * as gmail from "../src/lib/google/services/gmailService";
import * as calendar from "../src/lib/google/services/calendarService";
import * as sheets from "../src/lib/google/services/sheetsService";
import * as docs from "../src/lib/google/services/docsService";
import * as tasks from "../src/lib/google/services/tasksService";
import {
  AGENT_TOOLS,
  getTool,
  requiresApproval,
  toJsonSchemaTools,
  toolsForServices,
} from "../src/lib/agent/tools";

const ctx = { userId: "selftest-user" };
const checks: [string, () => Promise<void> | void][] = [];
const check = (name: string, run: () => Promise<void> | void) =>
  checks.push([name, run]);

// --- OAuth primitives ------------------------------------------------------

check("PKCE challenge is the S256 hash of the verifier", () => {
  const { verifier, challenge } = createPkcePair();
  assert.ok(verifier.length >= 43, "verifier must meet RFC 7636 minimum length");
  assert.equal(
    challenge,
    createHash("sha256").update(verifier).digest("base64url"),
  );
});

check("OAuth state round-trips and carries the verifier", () => {
  const state = createOAuthState({
    verifier: "v-123",
    userId: "user-1",
    client: "mobile",
    returnTo: "/connections",
  });
  const payload = consumeOAuthState(state);
  assert.equal(payload.verifier, "v-123");
  assert.equal(payload.client, "mobile");
  assert.equal(payload.returnTo, "/connections");
});

check("tampered OAuth state is rejected", () => {
  const state = createOAuthState({
    verifier: "v-123",
    userId: "user-1",
    client: "web",
  });
  const parts = state.split(".");
  parts[4] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => consumeOAuthState(parts.join(".")), GoogleOAuthError);
});

check("authorization URL requests offline access with PKCE", () => {
  const { url } = buildAuthorizationUrl({ userId: "user-1", client: "web" });
  const params = new URL(url).searchParams;
  assert.equal(params.get("access_type"), "offline");
  assert.equal(params.get("prompt"), "consent");
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.ok(params.get("code_challenge"));
  assert.ok(params.get("state"));
  assert.ok(params.get("scope")?.includes("gmail.readonly"));
});

check("scopes map to services and back", () => {
  const scopes = scopesForServices(["gmail", "sheets"]);
  assert.ok(scopes.includes(SERVICE_SCOPES.gmail[0]));
  assert.ok(!scopes.includes(SERVICE_SCOPES.tasks[0]));
  assert.deepEqual(servicesFromScopes(scopes).sort(), ["gmail", "sheets"]);
});

// --- Gmail -----------------------------------------------------------------

check("gmail search returns fixtures and honours is:unread", async () => {
  const all = await gmail.searchMessages({ ...ctx });
  assert.equal(all.length, 3);
  const unread = await gmail.searchMessages({ ...ctx, query: "is:unread" });
  assert.equal(unread.length, 2);
  assert.ok(unread.every((m) => m.isUnread));
});

check("gmail search filters by free-text term", async () => {
  const results = await gmail.searchMessages({ ...ctx, query: "redesign" });
  assert.equal(results.length, 1);
  assert.match(results[0].subject, /redesign/i);
});

check("gmail getMessage decodes the base64url body", async () => {
  const message = await gmail.getMessage({ ...ctx, messageId: "msg-1002" });
  assert.match(message.body, /Budget is around \$12,000/);
  assert.equal(message.from, "Priya Nair <priya@acmecorp.com>");
});

check("gmail header injection is neutralised", async () => {
  await gmail.sendEmail({
    ...ctx,
    to: "client@example.com",
    subject: "Quote\r\nBcc: attacker@evil.com",
    body: "Here is the quote.",
  });
  const sent = getMockStore().messages.at(-1);
  assert.ok(sent);
  // CRLF collapsed to a space, so no extra header was smuggled in.
  assert.equal(sent.subject, "Quote Bcc: attacker@evil.com");
  assert.ok(!sent.subject.includes("\n"));
});

check("gmail markAsRead removes the UNREAD label", async () => {
  const before = await gmail.getMessage({ ...ctx, messageId: "msg-1001" });
  assert.ok(before.labelIds.includes("UNREAD"));
  const after = await gmail.markAsRead({ ...ctx, messageId: "msg-1001" });
  assert.ok(!after.labelIds.includes("UNREAD"));
});

check("gmail draft does not send", async () => {
  const countBefore = getMockStore().messages.length;
  const { draftId } = await gmail.draftEmail({
    ...ctx,
    to: "a@b.com",
    subject: "Draft only",
    body: "hello",
  });
  assert.ok(draftId);
  assert.equal(getMockStore().messages.length, countBefore);
});

// --- Calendar --------------------------------------------------------------

check("calendar lists and creates events", async () => {
  const events = await calendar.listEvents({
    ...ctx,
    timeMin: "2026-09-01T00:00:00Z",
  });
  assert.equal(events.length, 2);

  const created = await calendar.createEvent({
    ...ctx,
    summary: "Design review",
    start: "2026-09-06T10:00:00Z",
    end: "2026-09-06T11:00:00Z",
    attendees: ["dev@example.com"],
  });
  assert.equal(created.summary, "Design review");
  assert.deepEqual(created.attendees, ["dev@example.com"]);
});

check("calendar detects overlapping events", async () => {
  const conflicts = await calendar.findConflicts({
    ...ctx,
    start: "2026-09-05T15:30:00Z",
    end: "2026-09-05T16:30:00Z",
  });
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0].summary, /Acme/);

  const clear = await calendar.findConflicts({
    ...ctx,
    start: "2026-09-05T22:00:00Z",
    end: "2026-09-05T23:00:00Z",
  });
  assert.equal(clear.length, 0);
});

check("attendance metrics compute debar risk", () => {
  const safe = calculateSafe();
  assert.equal(safe.status, "safe");
  assert.equal(safe.meetsThreshold, true);

  const risky = calendar.calculateAttendanceMetrics({
    heldClasses: 20,
    attendedClasses: 13,
    remainingClasses: 10,
    threshold: 0.75,
  });
  assert.equal(risky.status, "at_risk");
  assert.ok(risky.percentage < 0.75);
  // 13+n attended of 20+n held must reach 75%: n = 8.
  assert.equal(risky.classesMustAttend, 8);

  const doomed = calendar.calculateAttendanceMetrics({
    heldClasses: 20,
    attendedClasses: 5,
    remainingClasses: 2,
    threshold: 0.75,
  });
  assert.equal(doomed.status, "debarred");
  assert.equal(doomed.classesMustAttend, -1);
});

function calculateSafe() {
  return calendar.calculateAttendanceMetrics({
    heldClasses: 20,
    attendedClasses: 18,
    remainingClasses: 10,
    threshold: 0.75,
  });
}

check("attendance allows a safe number of misses", () => {
  const metrics = calculateSafe();
  // 18 attended of 30 total held is exactly 60%; misses must keep >= 75%.
  const finalPct =
    (metrics.attendedClasses + (metrics.remainingClasses - metrics.classesCanMiss)) /
    (metrics.heldClasses + metrics.remainingClasses);
  assert.ok(finalPct >= 0.75, `expected >=75%, got ${finalPct}`);
});

// --- Sheets ----------------------------------------------------------------

check("sheets append is visible to a subsequent read", async () => {
  await sheets.appendRow({
    ...ctx,
    spreadsheetId: "sheet-leads",
    values: ["Priya Nair", "priya@acmecorp.com", 12000, "+1-555-0142", "2026-09-02"],
  });
  const rows = await sheets.readRange({ ...ctx, spreadsheetId: "sheet-leads" });
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], "Priya Nair");
});

check("sheets findRows keys rows by header", async () => {
  const found = await sheets.findRows({
    ...ctx,
    spreadsheetId: "sheet-leads",
    match: { Name: "Priya Nair" },
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].Email, "priya@acmecorp.com");
  assert.equal(found[0].Budget, 12000);
});

check("sheets creates a spreadsheet with headers", async () => {
  const { spreadsheetId } = await sheets.createSpreadsheet({
    ...ctx,
    title: "Expenses",
    headers: ["Date", "Amount"],
  });
  const rows = await sheets.readRange({ ...ctx, spreadsheetId });
  assert.deepEqual(rows[0], ["Date", "Amount"]);
});

// --- Docs & Drive ----------------------------------------------------------

check("docs create, append and read round-trip", async () => {
  const doc = await docs.createDoc({
    ...ctx,
    title: "Daily Briefing",
    body: "Agenda:\n",
  });
  await docs.appendText({
    ...ctx,
    documentId: doc.documentId,
    text: "- Client call at 15:00\n",
  });
  const read = await docs.readDoc({ ...ctx, documentId: doc.documentId });
  assert.equal(read.title, "Daily Briefing");
  assert.match(read.text, /Agenda:/);
  assert.match(read.text, /Client call at 15:00/);
  assert.match(read.url, /^https:\/\/docs\.google\.com\/document\//);
});

check("drive search finds documents by title", async () => {
  const files = await docs.searchDrive({ ...ctx, query: "Daily Briefing" });
  assert.ok(files.length >= 1);
  assert.ok(files.some((f) => f.name === "Daily Briefing"));
});

// --- Tasks -----------------------------------------------------------------

check("tasks create and complete", async () => {
  const created = await tasks.createTask({
    ...ctx,
    title: "Reply to Acme",
    due: "2026-09-10T00:00:00Z",
  });
  assert.equal(created.completed, false);

  const open = await tasks.listTasks({ ...ctx });
  assert.equal(open.length, 1);

  const done = await tasks.completeTask({ ...ctx, taskId: created.id });
  assert.equal(done.completed, true);
});

// --- Agent tool registry ---------------------------------------------------

check("high-impact tools require approval, reads do not", () => {
  assert.equal(requiresApproval("gmail_send_email"), true);
  assert.equal(requiresApproval("calendar_create_event"), true);
  assert.equal(requiresApproval("calendar_delete_event"), true);
  assert.equal(requiresApproval("docs_append_text"), true);
  assert.equal(requiresApproval("gmail_search_messages"), false);
  assert.equal(requiresApproval("sheets_read_range"), false);
  // Unknown tools fail closed.
  assert.equal(requiresApproval("something_unknown"), true);
});

check("tool arguments are validated before reaching a connector", async () => {
  await assert.rejects(
    () => getTool("tasks_create").execute({}, ctx),
    (error: unknown) => error instanceof z.ZodError,
  );
  await assert.rejects(
    () => getTool("gmail_search_messages").execute({ maxResults: 999 }, ctx),
    (error: unknown) => error instanceof z.ZodError,
  );
});

check("tools execute through the registry", async () => {
  const result = (await getTool("gmail_search_messages").execute(
    { query: "invoice" },
    ctx,
  )) as { subject: string }[];
  assert.equal(result.length, 1);
  assert.match(result[0].subject, /Invoice/);
});

check("tools are filtered by granted services", () => {
  const names = toolsForServices(["gmail"]).map((t) => t.name);
  assert.ok(names.includes("gmail_send_email"));
  assert.ok(names.includes("calendar_attendance_metrics"), "core tools always available");
  assert.ok(!names.includes("sheets_append_row"));
});

check("tools export valid JSON Schema for MCP", () => {
  const exported = toJsonSchemaTools();
  assert.equal(exported.length, AGENT_TOOLS.length);
  const send = exported.find((t) => t.name === "gmail_send_email");
  assert.ok(send);
  assert.equal(send.annotations.requiresApproval, true);
  assert.equal(send.annotations.destructiveHint, true);
  const schema = send.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
  assert.ok(schema.properties?.to);
  assert.ok(schema.required?.includes("subject"));
});

// --- Runner ----------------------------------------------------------------

async function main() {
  resetMockStore();
  let failed = 0;

  for (const [name, run] of checks) {
    try {
      await run();
      console.log(`  PASS  ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`  FAIL  ${name}`);
      console.error(error);
    }
  }

  console.log(
    `\n  ${checks.length - failed}/${checks.length} Google connector checks passed\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main();
