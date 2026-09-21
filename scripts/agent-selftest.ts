// Must come first: points the database at a scratch file and forces mock
// Google clients before any module under src/ is evaluated.
import "./selftest-env";

import assert from "node:assert/strict";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  approvalRequests,
  executionLogs,
  users,
  workflows,
  type Workflow,
} from "../src/lib/db/schema";
import { deriveSubkey } from "../src/lib/crypto/vault";
import {
  APPROVAL_TTL_MS,
  ApprovalError,
  expireStaleApprovals,
  listPendingApprovals,
  resolveApproval,
  summariseAction,
} from "../src/lib/agent/approvals";
import { executeApprovedAction } from "../src/lib/agent/execute-approved";
import { runAgent } from "../src/lib/agent/orchestrator";
import { getMockStore, resetMockStore } from "../src/lib/google/mock";
import {
  GMAIL_POLL_INTERVAL_MS,
  isValidCron,
  selectDueWorkflows,
} from "../src/lib/scheduler/jobs";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

/** A model that replays a fixed script, one entry per generation step. */
function scriptedModel(
  script: LanguageModelV4GenerateResult[],
): MockLanguageModelV4 {
  let index = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const step = script[Math.min(index, script.length - 1)];
      index += 1;
      return step;
    },
  });
}

function toolCallStep(
  toolCallId: string,
  toolName: string,
  input: unknown,
): LanguageModelV4GenerateResult {
  return {
    content: [
      { type: "tool-call", toolCallId, toolName, input: JSON.stringify(input) },
    ],
    finishReason: { unified: "tool-calls", raw: "tool_use" },
    usage,
    warnings: [],
  };
}

function textStep(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "end_turn" },
    usage,
    warnings: [],
  };
}

const checks: [string, () => Promise<void> | void][] = [];
const check = (name: string, run: () => Promise<void> | void) =>
  checks.push([name, run]);

/** Mock Gmail files a sent message into the mailbox under the SENT label. */
const sentMessages = () =>
  getMockStore().messages.filter((m) => m.labelIds.includes("SENT"));

let userId: string;

// --- Approval bookkeeping --------------------------------------------------

check("approval signing key is derived, not the master key itself", () => {
  const master = Buffer.from(process.env.APP8N_ENCRYPTION_KEY!, "base64");
  const signing = deriveSubkey("tool-approval");
  assert.equal(signing.length, 32);
  assert.notDeepEqual(signing, master, "signing key must not equal master key");
  assert.deepEqual(
    signing,
    deriveSubkey("tool-approval"),
    "derivation must be deterministic",
  );
  assert.notDeepEqual(
    signing,
    deriveSubkey("something-else"),
    "different purposes must yield different keys",
  );
});

check("action summaries name the concrete action", () => {
  const summary = summariseAction("gmail_send_email", {
    to: "dean@university.edu",
    subject: "Attendance appeal",
  });
  assert.match(summary, /dean@university\.edu/);
  assert.match(summary, /Attendance appeal/);
});

check("every registered tool has a display label for the UI", async () => {
  // `tool-display.ts` deliberately does not import the tool registry — that
  // module pulls in googleapis, which must never reach the client bundle. This
  // check is what stops the two lists drifting: a tool added without a label
  // would otherwise ship as a generic "Working…" pill that tells the user
  // nothing about what the agent is doing on their behalf.
  const { AGENT_TOOLS } = await import("../src/lib/agent/tools");
  const { TOOL_DISPLAY } = await import("../src/lib/tool-display");

  const missing = AGENT_TOOLS.map((tool) => tool.name).filter(
    (name) => !(name in TOOL_DISPLAY),
  );
  assert.deepEqual(missing, [], `tools missing a display entry: ${missing}`);

  const orphaned = Object.keys(TOOL_DISPLAY).filter(
    (name) => !AGENT_TOOLS.some((tool) => tool.name === name),
  );
  assert.deepEqual(orphaned, [], `display entries for unknown tools: ${orphaned}`);
});

check("every starter blueprint step names a real tool", async () => {
  // A typo here is close to invisible: the canvas falls back to a generic
  // wrench icon and the run simply never places the call, so the blueprint
  // looks fine on screen while quietly doing less than it claims.
  const { AGENT_TOOLS } = await import("../src/lib/agent/tools");
  const { STARTER_BLUEPRINTS } = await import("../src/lib/blueprints");
  const known = new Set(AGENT_TOOLS.map((tool) => tool.name));

  const unknown = STARTER_BLUEPRINTS.flatMap((blueprint) =>
    blueprint.nodes
      .filter((node) => node.tool && !known.has(node.tool))
      .map((node) => `${blueprint.key}:${node.tool}`),
  );
  assert.deepEqual(unknown, [], `blueprint steps naming unknown tools: ${unknown}`);

  const keys = STARTER_BLUEPRINTS.map((blueprint) => blueprint.key);
  assert.equal(new Set(keys).size, keys.length, "blueprint keys must be unique");

  for (const blueprint of STARTER_BLUEPRINTS) {
    // The seeder relies on the key to decide insert-vs-update, and the
    // scheduler needs a cron string it can actually parse.
    assert.ok(blueprint.key, `${blueprint.title} has no blueprint key`);
    assert.ok(
      blueprint.description.length > 40,
      `${blueprint.title} needs a description — the scheduler runs it as the instruction`,
    );
    if (blueprint.triggerType === "cron") {
      assert.ok(
        blueprint.cronExpression,
        `${blueprint.title} is cron-triggered but has no expression`,
      );
      assert.ok(
        isValidCron(blueprint.cronExpression!),
        `${blueprint.title} has an unparseable cron expression`,
      );
    }
    const ids = new Set(blueprint.nodes.map((node) => node.id));
    for (const edge of blueprint.edges) {
      assert.ok(ids.has(edge.source), `${blueprint.key}: dangling edge source ${edge.source}`);
      assert.ok(ids.has(edge.target), `${blueprint.key}: dangling edge target ${edge.target}`);
    }
  }
});

// --- Agent loop ------------------------------------------------------------

check("agent chains read tools and logs every step", async () => {
  resetMockStore();

  const result = await runAgent({
    userId,
    trigger: "chat",
    messages: [{ role: "user", content: "What unread mail do I have?" }],
    model: scriptedModel([
      toolCallStep("call-1", "gmail_search_messages", { query: "is:unread" }),
      textStep("You have unread mail from Acme Corp."),
    ]),
  });

  assert.equal(result.status, "success");
  assert.match(result.text, /Acme Corp/);

  const row = await db.query.executionLogs.findFirst({
    where: eq(executionLogs.id, result.executionId),
  });
  assert.ok(row, "execution row must exist");
  assert.equal(row!.status, "success");
  assert.equal(row!.trigger, "chat");
  assert.ok(row!.durationMs !== null, "duration must be recorded");

  const kinds = row!.stepsJson.map((s) => s.kind);
  assert.ok(kinds.includes("tool_call"), "tool call must be logged");
  assert.ok(kinds.includes("tool_result"), "tool result must be logged");
  assert.ok(kinds.includes("text"), "assistant text must be logged");
});

check("a failing run is recorded as failed with its error", async () => {
  const result = await runAgent({
    userId,
    trigger: "chat",
    messages: [{ role: "user", content: "break" }],
    model: new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("upstream exploded");
      },
    }),
  });

  assert.equal(result.status, "failed");
  const row = await db.query.executionLogs.findFirst({
    where: eq(executionLogs.id, result.executionId),
  });
  assert.equal(row!.status, "failed");
  assert.match(row!.errorTrace ?? "", /upstream exploded/);
});

// --- Human-in-the-loop gate ------------------------------------------------

check("high-impact tool halts the run instead of executing", async () => {
  resetMockStore();
  const before = sentMessages().length;

  const result = await runAgent({
    userId,
    trigger: "chat",
    messages: [{ role: "user", content: "Email the dean my appeal." }],
    model: scriptedModel([
      toolCallStep("call-send", "gmail_send_email", {
        to: "dean@university.edu",
        subject: "Attendance appeal",
        body: "Please review my attendance.",
      }),
      textStep("Sent."),
    ]),
  });

  assert.equal(result.status, "awaiting_approval");
  assert.equal(result.approvals.length, 1);
  assert.equal(result.approvals[0].toolName, "gmail_send_email");

  const after = sentMessages().length;
  assert.equal(after, before, "the email must NOT have been sent");

  const row = await db.query.executionLogs.findFirst({
    where: eq(executionLogs.id, result.executionId),
  });
  assert.equal(row!.status, "awaiting_approval");
  assert.ok(row!.messagesJson, "conversation must be parked for resumption");
  assert.ok(
    row!.stepsJson.some((s) => s.kind === "approval_required"),
    "the gate must appear in the step trace",
  );

  const pending = await listPendingApprovals(userId);
  assert.ok(pending.some((p) => p.id === result.approvals[0].approvalRequestId));
});

check("approving executes the action through the runtime proxy", async () => {
  resetMockStore();

  const result = await runAgent({
    userId,
    trigger: "chat",
    messages: [{ role: "user", content: "Email the dean." }],
    model: scriptedModel([
      toolCallStep("call-send-2", "gmail_send_email", {
        to: "dean@university.edu",
        subject: "Attendance appeal",
        body: "Please review.",
      }),
      textStep("Sent."),
    ]),
  });

  const approvalId = result.approvals[0].approvalRequestId;
  const resolved = await resolveApproval({ approvalId, approved: true });
  assert.equal(resolved.status, "APPROVED");

  const executed = await executeApprovedAction(resolved);
  assert.ok(executed.executed, `expected send to run: ${executed.error ?? ""}`);

  const sent = sentMessages();
  assert.equal(sent.length, 1, "exactly one email must have been sent");

  const row = await db.query.executionLogs.findFirst({
    where: eq(executionLogs.id, result.executionId),
  });
  assert.equal(row!.status, "success");
});

check("edited parameters are re-validated before execution", async () => {
  resetMockStore();

  const result = await runAgent({
    userId,
    trigger: "chat",
    messages: [{ role: "user", content: "Email the dean." }],
    model: scriptedModel([
      toolCallStep("call-send-3", "gmail_send_email", {
        to: "dean@university.edu",
        subject: "Draft",
        body: "v1",
      }),
      textStep("Sent."),
    ]),
  });

  const approvalId = result.approvals[0].approvalRequestId;

  await assert.rejects(
    () =>
      resolveApproval({
        approvalId,
        approved: true,
        parameters: { to: "x", subject: 42 },
      }),
    (error: unknown) =>
      error instanceof ApprovalError && error.code === "invalid_parameters",
    "malformed edits must be rejected",
  );

  const resolved = await resolveApproval({
    approvalId,
    approved: true,
    parameters: {
      to: "registrar@university.edu",
      subject: "Final",
      body: "v2",
    },
  });

  await executeApprovedAction(resolved);
  const sent = sentMessages();
  assert.equal(sent.length, 1);
  assert.match(
    JSON.stringify(sent[0]),
    /registrar@university\.edu/,
    "the edited recipient must be what actually went out",
  );
});

check("rejecting cancels the run and sends nothing", async () => {
  resetMockStore();

  const result = await runAgent({
    userId,
    trigger: "chat",
    messages: [{ role: "user", content: "Email the dean." }],
    model: scriptedModel([
      toolCallStep("call-send-4", "gmail_send_email", {
        to: "dean@university.edu",
        subject: "Nope",
        body: "no",
      }),
      textStep("Sent."),
    ]),
  });

  const resolved = await resolveApproval({
    approvalId: result.approvals[0].approvalRequestId,
    approved: false,
  });
  assert.equal(resolved.status, "REJECTED");
  assert.equal(resolved.resolvedParametersJson, null);
  assert.equal(sentMessages().length, 0);
});

check("a second approver cannot resolve the same gate twice", async () => {
  resetMockStore();

  const result = await runAgent({
    userId,
    trigger: "chat",
    messages: [{ role: "user", content: "Email the dean." }],
    model: scriptedModel([
      toolCallStep("call-send-5", "gmail_send_email", {
        to: "dean@university.edu",
        subject: "Once",
        body: "once",
      }),
      textStep("Sent."),
    ]),
  });

  const approvalId = result.approvals[0].approvalRequestId;
  await resolveApproval({ approvalId, approved: true });

  await assert.rejects(
    () => resolveApproval({ approvalId, approved: true }),
    (error: unknown) =>
      error instanceof ApprovalError && error.code === "already_resolved",
    "double approval must be refused",
  );
});

check("stale approvals expire and cannot be executed", async () => {
  resetMockStore();

  const result = await runAgent({
    userId,
    trigger: "chat",
    messages: [{ role: "user", content: "Email the dean." }],
    model: scriptedModel([
      toolCallStep("call-send-6", "gmail_send_email", {
        to: "dean@university.edu",
        subject: "Old",
        body: "old",
      }),
      textStep("Sent."),
    ]),
  });

  const approvalId = result.approvals[0].approvalRequestId;
  const expired = await expireStaleApprovals(
    new Date(Date.now() + APPROVAL_TTL_MS + 1000),
  );
  assert.ok(expired >= 1, "the stale gate must be swept");

  const row = await db.query.approvalRequests.findFirst({
    where: eq(approvalRequests.id, approvalId),
  });
  assert.equal(row!.status, "EXPIRED");
  assert.equal(sentMessages().length, 0);
});

// --- Scheduler -------------------------------------------------------------

function workflowFixture(overrides: Partial<Workflow>): Workflow {
  return {
    id: "wf",
    userId: "u",
    title: "Test",
    description: null,
    triggerType: "cron",
    cronExpression: null,
    nodesJson: [],
    edgesJson: [],
    status: "active",
    isAgentic: true,
    blueprintKey: null,
    lastRunAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as Workflow;
}

check("cron expressions are validated", () => {
  assert.ok(isValidCron("0 8 * * *"));
  assert.ok(!isValidCron("not a cron"));
});

check("scheduler selects only workflows that are actually due", () => {
  const now = new Date("2026-01-02T09:00:00Z");

  const due = workflowFixture({
    id: "due",
    cronExpression: "0 8 * * *",
    lastRunAt: new Date("2026-01-01T08:00:00Z"),
  });
  const notDue = workflowFixture({
    id: "not-due",
    cronExpression: "0 8 * * *",
    lastRunAt: new Date("2026-01-02T08:00:00Z"),
  });
  const broken = workflowFixture({ id: "broken", cronExpression: "nonsense" });

  const selected = selectDueWorkflows([due, notDue, broken], now).map(
    (w) => w.id,
  );
  assert.deepEqual(selected, ["due"]);
});

check("gmail polling respects its interval", () => {
  const now = new Date();
  const fresh = workflowFixture({
    id: "fresh",
    triggerType: "gmail_poll",
    lastRunAt: new Date(now.getTime() - 1000),
  });
  const ready = workflowFixture({
    id: "ready",
    triggerType: "gmail_poll",
    lastRunAt: new Date(now.getTime() - GMAIL_POLL_INTERVAL_MS - 1000),
  });

  const selected = selectDueWorkflows([fresh, ready], now).map((w) => w.id);
  assert.deepEqual(selected, ["ready"]);
});

check("a scheduled run is attributed to its workflow", async () => {
  resetMockStore();

  const [workflow] = await db
    .insert(workflows)
    .values({
      userId,
      title: "Morning briefing",
      description: "Summarise today's calendar.",
      triggerType: "cron",
      cronExpression: "0 8 * * *",
      status: "active",
    })
    .returning();

  const result = await runAgent({
    userId,
    trigger: "cron",
    workflowId: workflow.id,
    messages: [{ role: "user", content: "Summarise today's calendar." }],
    model: scriptedModel([
      toolCallStep("call-cal", "calendar_list_events", {}),
      textStep("Two events today."),
    ]),
  });

  assert.equal(result.status, "success");
  const row = await db.query.executionLogs.findFirst({
    where: eq(executionLogs.id, result.executionId),
  });
  assert.equal(row!.workflowId, workflow.id);
  assert.equal(row!.trigger, "cron");
});

async function main() {
  migrate(db, { migrationsFolder: "drizzle" });

  const [user] = await db
    .insert(users)
    .values({ email: "selftest@app8n.local" })
    .returning();
  userId = user.id;

  let passed = 0;
  console.log();

  for (const [name, run] of checks) {
    try {
      await run();
      console.log(`  PASS  ${name}`);
      passed += 1;
    } catch (error) {
      console.log(`  FAIL  ${name}`);
      console.error(error);
    }
  }

  console.log(`\n  ${passed}/${checks.length} agent checks passed\n`);
  process.exit(passed === checks.length ? 0 : 1);
}

main();
