CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text DEFAULT 'google' NOT NULL,
	`provider_account_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`avatar_url` text,
	`scopes` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_provider_account_idx` ON `accounts` (`provider`,`provider_account_id`);--> statement-breakpoint
CREATE INDEX `accounts_user_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`action_name` text NOT NULL,
	`summary` text,
	`parameters_json` text NOT NULL,
	`resolved_parameters_json` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`expires_at` integer,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `execution_logs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `approval_requests_execution_idx` ON `approval_requests` (`execution_id`);--> statement-breakpoint
CREATE INDEX `approval_requests_status_idx` ON `approval_requests` (`status`);--> statement-breakpoint
CREATE TABLE `credential_vault` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`secret` text NOT NULL,
	`key_version` integer DEFAULT 1 NOT NULL,
	`expires_at` integer,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credential_vault_user_name_idx` ON `credential_vault` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `credential_vault_account_idx` ON `credential_vault` (`account_id`);--> statement-breakpoint
CREATE TABLE `execution_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`trigger` text NOT NULL,
	`input_payload` text,
	`output_payload` text,
	`error_trace` text,
	`duration_ms` integer,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `execution_logs_workflow_idx` ON `execution_logs` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `execution_logs_status_idx` ON `execution_logs` (`status`);--> statement-breakpoint
CREATE INDEX `execution_logs_created_idx` ON `execution_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`trigger_type` text DEFAULT 'manual' NOT NULL,
	`cron_expression` text,
	`nodes_json` text DEFAULT '[]' NOT NULL,
	`edges_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`is_agentic` integer DEFAULT true NOT NULL,
	`blueprint_key` text,
	`last_run_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workflows_user_idx` ON `workflows` (`user_id`);--> statement-breakpoint
CREATE INDEX `workflows_status_trigger_idx` ON `workflows` (`status`,`trigger_type`);