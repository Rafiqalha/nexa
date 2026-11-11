CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`scope` text DEFAULT 'read' NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_tokens_user_idx` ON `api_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`actor_id` text,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_ts_idx` ON `audit_log` (`ts`);--> statement-breakpoint
CREATE INDEX `audit_log_action_idx` ON `audit_log` (`action`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`plan_id` text NOT NULL,
	`plan_name` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`amount_idr` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`issued_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`paid_at` integer,
	`paid_by` text,
	`paid_by_name` text,
	`payment_ref` text,
	`lines` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_number_unique` ON `invoices` (`number`);--> statement-breakpoint
CREATE INDEX `invoices_period_idx` ON `invoices` (`period_start`);--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);--> statement-breakpoint
CREATE TABLE `login_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `login_sessions_user_idx` ON `login_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `one_time_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`kind` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`user_id` text,
	`created_by` text,
	`created_by_name` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_time_tokens_public_id_unique` ON `one_time_tokens` (`public_id`);--> statement-breakpoint
CREATE INDEX `one_time_tokens_kind_idx` ON `one_time_tokens` (`kind`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `subscription` (
	`id` integer PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`scheduled_plan_id` text,
	`current_period_start` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`is_owner` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`password_hash` text NOT NULL,
	`totp_secret_enc` text,
	`totp_enabled` integer DEFAULT false NOT NULL,
	`totp_last_step` integer,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);