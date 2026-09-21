ALTER TABLE `approval_requests` ADD `tool_call_id` text;--> statement-breakpoint
CREATE INDEX `approval_requests_tool_call_idx` ON `approval_requests` (`tool_call_id`);--> statement-breakpoint
ALTER TABLE `execution_logs` ADD `steps_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `execution_logs` ADD `messages_json` text;