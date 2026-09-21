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

  // Approving also hands the run back its parked conversation, so the model
  // is scripted here too — it wraps up rather than calling anything further.
  const executed = await executeApprovedAction(resolved, {
    model: scriptedModel([textStep("Sent the appeal.")]),
  });
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

// --- Workflow authoring ----------------------------------------------------

check("authoring rejects an invalid cron expression", async () => {
  const { validateDraft, WorkflowAuthoringError } = await import(
    "../src/lib/workflows/authoring"
  );
  const { agentToolNames } = await import("../src/lib/agent/tools");

  assert.throws(
    () =>
      validateDraft(
        {
          title: "Nightly",
          description: "Runs nightly.",
          triggerType: "cron",
          cronExpression: "not a cron",
          steps: [],
          isAgentic: true,
          status: "active",
        },
        agentToolNames(),
      ),
    WorkflowAuthoringError,
  );
});

check("authoring rejects a step naming an unknown tool", async () => {
  // Fails closed for the same reason the approval lookup does: a step calling
  // a tool that does not exist would render in the canvas and silently do
  // nothing on every run.
  const { validateDraft, WorkflowAuthoringError } = await import(
    "../src/lib/workflows/authoring"
  );
  const { agentToolNames } = await import("../src/lib/agent/tools");

  assert.throws(
    () =>
      validateDraft(
        {
          title: "Bogus",
          description: "Calls a tool that does not exist.",
          triggerType: "manual",
          steps: [{ label: "Send it", tool: "gmail_send_telegram" }],
          isAgentic: true,
          status: "active",
        },
        agentToolNames(),
      ),
    WorkflowAuthoringError,
  );
});

check("a saved workflow becomes a plan the scheduler reads back", async () => {
  // The `is_agentic` lesson, enforced: authoring writes the same nodes the
  // canvas draws and the worker renders into its run instruction, so the two
  // cannot describe different automations.
  const { saveWorkflow } = await import("../src/lib/workflows/authoring");
  const { agentToolNames } = await import("../src/lib/agent/tools");

  const workflow = await saveWorkflow({
    userId,
    knownTools: agentToolNames(),
    draft: {
      title: "Morning briefing",
      description: "Summarise the day ahead.",
      triggerType: "cron",
      cronExpression: "0 7 * * 1-5",
      steps: [
        { label: "Check calendar", tool: "calendar_list_events" },
        { label: "Decide what matters" },
      ],
      isAgentic: true,
      status: "active",
    },
  });

  assert.equal(workflow.nodesJson.length, 2);
  assert.equal(workflow.edgesJson.length, 1);
  assert.equal(workflow.cronExpression, "0 7 * * 1-5");

  const { buildRunInstruction } = await import("../src/lib/scheduler/worker");
  const instruction = buildRunInstruction(workflow);
  assert.match(instruction, /Check calendar/);
  assert.match(instruction, /Decide what matters/);
  assert.match(instruction, /deviate/, "an agentic plan is advisory");
});

check("changing a trigger away from cron clears its schedule", async () => {
  const { saveWorkflow } = await import("../src/lib/workflows/authoring");
  const { agentToolNames } = await import("../src/lib/agent/tools");

  const base = {
    title: "Was scheduled",
    description: "Started life on a cron.",
    steps: [],
    isAgentic: true,
    status: "active" as const,
  };

  const created = await saveWorkflow({
    userId,
    knownTools: agentToolNames(),
    draft: { ...base, triggerType: "cron", cronExpression: "0 9 * * *" },
  });

  const updated = await saveWorkflow({
    userId,
    workflowId: created.id,
    knownTools: agentToolNames(),
    draft: { ...base, triggerType: "manual" },
  });

  // A stale expression left behind would resurrect the old schedule the next
  // time someone switched the trigger back.
  assert.equal(updated.cronExpression, null);
});

check("saving a workflow is not gated, but unknown tools still are", async () => {
  const { requiresApproval } = await import("../src/lib/agent/tools");
  // Local state the user owns is not an external action.
  assert.equal(requiresApproval("workflow_save"), false);
  // The fail-closed default must survive the new tool being added.
  assert.equal(requiresApproval("totally_made_up_tool"), true);
});

// --- Run history -----------------------------------------------------------

check("run history is scoped to its owner and ordered newest first", async () => {
  const { listExecutions, getExecutionForUser } = await import(
    "../src/lib/agent/execution"
  );

  const [stranger] = await db
    .insert(users)
    .values({ email: `stranger-${Date.now()}@app8n.local` })
    .returning();

  const [theirs] = await db
    .insert(executionLogs)
    .values({ userId: stranger.id, trigger: "chat", status: "success" })
    .returning();

  const mine = await listExecutions(userId);
  assert.ok(mine.length > 0, "the earlier checks recorded runs");
  assert.ok(
    !mine.some((row) => row.execution.id === theirs.id),
    "another user's run must not appear",
  );

  const times = mine.map((row) => row.execution.createdAt.getTime());
  assert.deepEqual(
    times,
    [...times].sort((a, b) => b - a),
    "newest first",
  );

  // An id belonging to someone else must miss rather than leak.
  assert.equal(await getExecutionForUser(theirs.id, userId), undefined);
});

check("a run trace is retrievable and carries its steps", async () => {
  const { getExecutionForUser } = await import("../src/lib/agent/execution");

  const withSteps = (
    await db.select().from(executionLogs).where(eq(executionLogs.userId, userId))
  ).find((row) => row.stepsJson.length > 0);

  assert.ok(withSteps, "earlier checks produced a run with steps");
  const found = await getExecutionForUser(withSteps.id, userId);
  assert.ok(found);
  assert.deepEqual(found.execution.stepsJson, withSteps.stepsJson);
});

// --- Push notifications ----------------------------------------------------

check("re-registering a device does not duplicate it", async () => {
  // APNs and FCM reissue the same token to a reinstalled app; a second row
  // would deliver every approval to that phone twice.
  const { registerDevice, listDevices } = await import(
    "../src/lib/push/devices"
  );

  await registerDevice({ userId, platform: "ios", token: "token-abc-123" });
  await registerDevice({ userId, platform: "ios", token: "token-abc-123" });

  const devices = await listDevices(userId);
  assert.equal(
    devices.filter((device) => device.token === "token-abc-123").length,
    1,
  );
});

check("push is skipped, not failed, when no provider is configured", async () => {
  const { notifyApprovalRequired } = await import("../src/lib/push/dispatch");
  const previous = process.env.APP8N_FCM_SERVICE_ACCOUNT;
  delete process.env.APP8N_FCM_SERVICE_ACCOUNT;

  try {
    const report = await notifyApprovalRequired(userId, {
      approvalRequestId: "a1",
      executionId: "e1",
      toolCallId: "t1",
      toolName: "gmail_send_email",
      summary: "Send an email",
      parameters: {},
    });
    // A missing push provider must never fail the run that raised the gate.
    assert.equal(report.skipped, "not_configured");
    assert.equal(report.failed, 0);
  } finally {
    if (previous !== undefined) {
      process.env.APP8N_FCM_SERVICE_ACCOUNT = previous;
    }
  }
});

// --- Mobile deep link ------------------------------------------------------

check("deep-link registration is correct and idempotent", async () => {
  const { schemeFrom, patchInfoPlist, patchAndroidManifest } = await import(
    "./register-deep-link"
  );

  assert.equal(schemeFrom("app8n://auth/callback"), "app8n");

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
\t<key>CFBundleName</key>
\t<string>app8n</string>
</dict>
</plist>`;

  const first = patchInfoPlist(plist, "app8n");
  assert.equal(first.changed, true);
  assert.match(first.contents, /<key>CFBundleURLSchemes<\/key>/);
  assert.match(first.contents, /<string>app8n<\/string>/);
  // Reapplied on every `cap sync`, so a second pass must be a no-op.
  assert.equal(patchInfoPlist(first.contents, "app8n").changed, false);

  const manifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application>
        <activity android:name=".MainActivity">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;

  const patched = patchAndroidManifest(manifest, "app8n");
  assert.equal(patched.changed, true);
  assert.match(patched.contents, /android:scheme="app8n"/);
  assert.match(patched.contents, /android\.intent\.category\.BROWSABLE/);
  assert.equal(patchAndroidManifest(patched.contents, "app8n").changed, false);
});

// --- Google connection health ---------------------------------------------

check("a health check reports mock mode rather than claiming a live pass", async () => {
  // The whole point of the check is telling "verified against Google" apart
  // from "verified against fixtures"; a green tick that conflated them would
  // be the false confidence it exists to remove.
  const { checkAccountHealth } = await import("../src/lib/google/health");
  const { accounts } = await import("../src/lib/db/schema");

  const [account] = await db
    .insert(accounts)
    .values({
      userId,
      provider: "google",
      providerAccountId: `sub-${Date.now()}`,
      email: "health@app8n.local",
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/calendar",
      ],
    })
    .returning();

  const health = await checkAccountHealth(userId, account.id);
  assert.equal(health.mock, true);
  assert.equal(health.ok, true);
  assert.deepEqual(
    health.services.map((probe) => probe.service).sort(),
    ["calendar", "gmail"],
  );
});

check("an approved run resumes its remaining steps", async () => {
  // `messagesJson` exists to make a run resumable across an approval pause —
  // a job can park at 7am and continue after a decision at lunchtime. Without
  // this the approved call would fire and the rest of the plan would be
  // silently abandoned, leaving the column as state nothing reads.
  resetMockStore();

  const parked = await runAgent({
    userId,
    trigger: "cron",
    services: ["gmail", "tasks"],
    messages: [{ role: "user", content: "Email the dean, then log a task." }],
    model: scriptedModel([
      toolCallStep("send-1", "gmail_send_email", {
        to: "dean@university.edu",
        subject: "Attendance appeal",
        body: "Please review.",
      }),
    ]),
  });

  assert.equal(parked.status, "awaiting_approval");
  assert.equal(sentMessages().length, 0, "nothing sent before approval");

  const [gate] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.executionId, parked.executionId));

  const approved = await resolveApproval({
    approvalId: gate.id,
    approved: true,
  });

  // The resumed leg files the follow-up task the original plan called for.
  const result = await executeApprovedAction(approved, {
    model: scriptedModel([
      toolCallStep("task-1", "tasks_create", { title: "Chase the dean" }),
      textStep("Sent the appeal and logged a follow-up."),
    ]),
  });

  assert.equal(result.executed, true);
  assert.equal(sentMessages().length, 1, "the approved email actually sent");

  const row = await db.query.executionLogs.findFirst({
    where: eq(executionLogs.id, parked.executionId),
  });

  // One continuous run, not a stub plus an orphan.
  assert.equal(row!.status, "success");
  assert.ok(
    row!.stepsJson.some(
      (step) => step.kind === "tool_call" && step.toolName === "tasks_create",
    ),
    "the run continued past the gate",
  );
  assert.equal(
    row!.stepsJson.filter(
      (step) => step.kind === "tool_call" && step.toolName === "gmail_send_email",
    ).length,
    1,
    "the approved call must not be replayed by the resumed run",
  );
});

// --- Model providers ---------------------------------------------------------

/** Runs `body` with the given env vars applied, restoring them afterwards. */
async function withEnv(
  vars: Record<string, string | undefined>,
  body: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await body();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

check("the provider is auto-detected from whichever key exists", async () => {
  // Saving a Gemini key in Settings has to be enough on its own. Requiring an
  // environment variable as well would mean the UI accepted a key that never
  // took effect — the same dead-config trap as the unread OPENAI_API_KEY that
  // sat in .env.example while nothing read it.
  const { activeProvider, setModelKey, clearModelKey } = await import(
    "../src/lib/agent/model-key"
  );
  const { PROVIDERS } = await import("../src/lib/agent/providers");

  await withEnv(
    {
      APP8N_MODEL_PROVIDER: undefined,
      ANTHROPIC_API_KEY: undefined,
      GOOGLE_GENERATIVE_AI_API_KEY: undefined,
    },
    async () => {
      // Nothing anywhere: fall back rather than throw, so Settings can render.
      assert.equal((await activeProvider(userId)).id, "anthropic");

      await setModelKey(userId, PROVIDERS.google, "AIzaTestKey123");
      assert.equal((await activeProvider(userId)).id, "google");

      await clearModelKey(userId, PROVIDERS.google);
      assert.equal((await activeProvider(userId)).id, "anthropic");
    },
  );
});

check("an explicit provider choice overrides auto-detection", async () => {
  const { activeProvider } = await import("../src/lib/agent/model-key");

  await withEnv(
    {
      APP8N_MODEL_PROVIDER: "google",
      ANTHROPIC_API_KEY: "sk-ant-present",
      GOOGLE_GENERATIVE_AI_API_KEY: undefined,
    },
    async () => {
      // Named explicitly, so it wins even though only Anthropic has a key.
      assert.equal((await activeProvider(userId)).id, "google");
    },
  );
});

check("an unknown provider name fails loudly", async () => {
  const { configuredProvider } = await import("../src/lib/agent/providers");

  await withEnv({ APP8N_MODEL_PROVIDER: "gpt5" }, async () => {
    // Silently falling back would strand the user on a provider they did not
    // choose, with no clue why their key is ignored.
    assert.throws(() => configuredProvider(), /APP8N_MODEL_PROVIDER/);
  });
});

check("each provider's key is stored under its own vault name", async () => {
  const { setModelKey, resolveKeyFor, clearModelKey } = await import(
    "../src/lib/agent/model-key"
  );
  const { PROVIDERS } = await import("../src/lib/agent/providers");

  await withEnv(
    { ANTHROPIC_API_KEY: undefined, GOOGLE_GENERATIVE_AI_API_KEY: undefined },
    async () => {
      await setModelKey(userId, PROVIDERS.google, "AIzaOnlyGoogle");

      const google = await resolveKeyFor(userId, PROVIDERS.google);
      assert.equal(google.key, "AIzaOnlyGoogle");
      assert.equal(google.source, "vault");

      // A key for one provider must never satisfy another.
      const anthropic = await resolveKeyFor(userId, PROVIDERS.anthropic);
      assert.equal(anthropic.key, null);
      assert.equal(anthropic.source, "none");

      await clearModelKey(userId, PROVIDERS.google);
    },
  );
});

check("the model id is overridable per deployment", async () => {
  const { modelIdFor, PROVIDERS } = await import("../src/lib/agent/providers");

  assert.equal(modelIdFor(PROVIDERS.google), "gemini-2.5-flash");
  await withEnv({ APP8N_MODEL_ID: "gemini-3-flash-preview" }, async () => {
    assert.equal(modelIdFor(PROVIDERS.google), "gemini-3-flash-preview");
  });
});

check("every provider is fully described for the settings UI", async () => {
  // The key field renders entirely from this table, so a provider missing its
  // console URL or placeholder would ship as an unfillable form.
  const { MODEL_PROVIDERS, PROVIDERS } = await import(
    "../src/lib/agent/providers"
  );

  for (const id of MODEL_PROVIDERS) {
    const provider = PROVIDERS[id];
    assert.equal(provider.id, id, `${id} must be keyed by its own id`);
    for (const field of [
      "label",
      "defaultModel",
      "envVar",
      "vaultKeyName",
      "placeholder",
      "consoleUrl",
    ] as const) {
      assert.ok(provider[field], `${id} is missing ${field}`);
    }
    assert.equal(typeof provider.createModel, "function");
    assert.equal(typeof provider.testKey, "function");
  }

  // Two providers sharing a vault name would overwrite each other's keys.
  const names = MODEL_PROVIDERS.map((id) => PROVIDERS[id].vaultKeyName);
  assert.equal(new Set(names).size, names.length, "vault names must be unique");
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
