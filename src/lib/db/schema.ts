import { randomUUID } from "node:crypto";
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const primaryId = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date());

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

export const users = sqliteTable("users", {
  id: primaryId(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * A connected third-party identity (one row per linked Google account), so a
 * single user can attach personal and work Workspace accounts side by side.
 */
export const accounts = sqliteTable(
  "accounts",
  {
    id: primaryId(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["google"] })
      .notNull()
      .default("google"),
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("accounts_provider_account_idx").on(
      t.provider,
      t.providerAccountId,
    ),
    index("accounts_user_idx").on(t.userId),
  ],
);

export const CREDENTIAL_TYPES = [
  "google_oauth",
  "llm_api_key",
  "webhook_secret",
  "generic",
] as const;

/**
 * Encrypted secret storage. `secret` holds an AES-256-GCM envelope produced by
 * `@/lib/crypto/vault` — plaintext never touches this table, and the agent
 * runtime resolves credentials by reference rather than reading them.
 */
export const credentialVault = sqliteTable(
  "credential_vault",
  {
    id: primaryId(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    type: text("type", { enum: CREDENTIAL_TYPES }).notNull(),
    secret: text("secret").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("credential_vault_user_name_idx").on(t.userId, t.name),
    index("credential_vault_account_idx").on(t.accountId),
  ],
);

export const TRIGGER_TYPES = [
  "manual",
  "chat",
  "cron",
  "webhook",
  "gmail_poll",
] as const;

export const WORKFLOW_STATUSES = [
  "draft",
  "active",
  "paused",
  "archived",
] as const;

export const workflows = sqliteTable(
  "workflows",
  {
    id: primaryId(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    triggerType: text("trigger_type", { enum: TRIGGER_TYPES })
      .notNull()
      .default("manual"),
    cronExpression: text("cron_expression"),
    nodesJson: text("nodes_json", { mode: "json" })
      .$type<unknown[]>()
      .notNull()
      .default([]),
    edgesJson: text("edges_json", { mode: "json" })
      .$type<unknown[]>()
      .notNull()
      .default([]),
    status: text("status", { enum: WORKFLOW_STATUSES })
      .notNull()
      .default("draft"),
    isAgentic: integer("is_agentic", { mode: "boolean" })
      .notNull()
      .default(true),
    blueprintKey: text("blueprint_key"),
    lastRunAt: integer("last_run_at", { mode: "timestamp" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("workflows_user_idx").on(t.userId),
    index("workflows_status_trigger_idx").on(t.status, t.triggerType),
  ],
);

export const EXECUTION_STATUSES = [
  "running",
  "awaiting_approval",
  "success",
  "failed",
  "cancelled",
] as const;

export const executionLogs = sqliteTable(
  "execution_logs",
  {
    id: primaryId(),
    workflowId: text("workflow_id").references(() => workflows.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: EXECUTION_STATUSES })
      .notNull()
      .default("running"),
    trigger: text("trigger", { enum: TRIGGER_TYPES }).notNull(),
    inputPayload: text("input_payload", { mode: "json" }),
    outputPayload: text("output_payload", { mode: "json" }),
    errorTrace: text("error_trace"),
    durationMs: integer("duration_ms"),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("execution_logs_workflow_idx").on(t.workflowId),
    index("execution_logs_status_idx").on(t.status),
    index("execution_logs_created_idx").on(t.createdAt),
  ],
);

export const APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
] as const;

/**
 * One row per human-in-the-loop gate. `parametersJson` is what the agent
 * proposed; `resolvedParametersJson` is what the user actually approved after
 * any edits, and is the payload the runtime executes.
 */
export const approvalRequests = sqliteTable(
  "approval_requests",
  {
    id: primaryId(),
    executionId: text("execution_id")
      .notNull()
      .references(() => executionLogs.id, { onDelete: "cascade" }),
    actionName: text("action_name").notNull(),
    summary: text("summary"),
    parametersJson: text("parameters_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    resolvedParametersJson: text("resolved_parameters_json", {
      mode: "json",
    }).$type<Record<string, unknown>>(),
    status: text("status", { enum: APPROVAL_STATUSES })
      .notNull()
      .default("PENDING"),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("approval_requests_execution_idx").on(t.executionId),
    index("approval_requests_status_idx").on(t.status),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  credentials: many(credentialVault),
  workflows: many(workflows),
  executions: many(executionLogs),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  credentials: many(credentialVault),
}));

export const credentialVaultRelations = relations(
  credentialVault,
  ({ one }) => ({
    user: one(users, {
      fields: [credentialVault.userId],
      references: [users.id],
    }),
    account: one(accounts, {
      fields: [credentialVault.accountId],
      references: [accounts.id],
    }),
  }),
);

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  user: one(users, { fields: [workflows.userId], references: [users.id] }),
  executions: many(executionLogs),
}));

export const executionLogsRelations = relations(
  executionLogs,
  ({ one, many }) => ({
    workflow: one(workflows, {
      fields: [executionLogs.workflowId],
      references: [workflows.id],
    }),
    user: one(users, {
      fields: [executionLogs.userId],
      references: [users.id],
    }),
    approvals: many(approvalRequests),
  }),
);

export const approvalRequestsRelations = relations(
  approvalRequests,
  ({ one }) => ({
    execution: one(executionLogs, {
      fields: [approvalRequests.executionId],
      references: [executionLogs.id],
    }),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Credential = typeof credentialVault.$inferSelect;
export type NewCredential = typeof credentialVault.$inferInsert;
export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type ExecutionLog = typeof executionLogs.$inferSelect;
export type NewExecutionLog = typeof executionLogs.$inferInsert;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type NewApprovalRequest = typeof approvalRequests.$inferInsert;
