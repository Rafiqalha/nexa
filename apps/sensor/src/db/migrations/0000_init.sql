CREATE TABLE `bandit_arms` (
	`arm_id` text PRIMARY KEY NOT NULL,
	`pulls` integer DEFAULT 0 NOT NULL,
	`total_hold_ms` integer DEFAULT 0 NOT NULL,
	`mean_reward` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `canaries` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`token` text NOT NULL,
	`kind` text NOT NULL,
	`issued_at` integer NOT NULL,
	`issued_path` text DEFAULT '' NOT NULL,
	`triggered_at` integer,
	`trigger_ip` text,
	`trigger_session_id` text,
	`trigger_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `canaries_token_unique` ON `canaries` (`token`);--> statement-breakpoint
CREATE INDEX `canaries_session_idx` ON `canaries` (`session_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`ts` integer NOT NULL,
	`kind` text NOT NULL,
	`method` text DEFAULT 'GET' NOT NULL,
	`path` text NOT NULL,
	`status` integer,
	`chars_served` integer DEFAULT 0 NOT NULL,
	`est_tokens` integer DEFAULT 0 NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_session_ts_idx` ON `events` (`session_id`,`ts`);--> statement-breakpoint
CREATE INDEX `events_kind_idx` ON `events` (`kind`);--> statement-breakpoint
CREATE TABLE `intel` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`source` text DEFAULT 'heuristic' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`suspected_model` text DEFAULT '' NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`captured_prompt` text,
	`patterns` text DEFAULT '[]' NOT NULL,
	`tokens_used` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `intel_session_idx` ON `intel` (`session_id`);--> statement-breakpoint
CREATE INDEX `intel_status_idx` ON `intel` (`status`);--> statement-breakpoint
CREATE TABLE `llm_budget` (
	`date` text PRIMARY KEY NOT NULL,
	`tokens_used` integer DEFAULT 0 NOT NULL,
	`limit` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text,
	`kind` text NOT NULL,
	`source` text DEFAULT 'template' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`syntax_valid` integer,
	`validation_output` text DEFAULT '' NOT NULL,
	`validated_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`deployed_at` integer,
	`deploy_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `rules_status_idx` ON `rules` (`status`);--> statement-breakpoint
CREATE INDEX `rules_session_idx` ON `rules` (`session_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`ended_at` integer,
	`source_ip` text NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`classification` text DEFAULT 'legit' NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`labyrinth_seed` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`max_depth` integer DEFAULT 0 NOT NULL,
	`trapped_at` integer,
	`reasons` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_fingerprint_idx` ON `sessions` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `sessions_status_idx` ON `sessions` (`status`);--> statement-breakpoint
CREATE INDEX `sessions_last_seen_idx` ON `sessions` (`last_seen_at`);