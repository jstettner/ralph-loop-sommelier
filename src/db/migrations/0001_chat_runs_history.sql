CREATE TABLE `chat_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`user_message_id` text NOT NULL,
	`assistant_message_id` text NOT NULL,
	`status` text NOT NULL,
	`safe_error` text,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`heartbeat_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assistant_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chat_runs_valid_shape" CHECK((
    ("chat_runs"."status" = 'running' and "chat_runs"."finished_at" is null and "chat_runs"."safe_error" is null) or
    ("chat_runs"."status" = 'completed' and "chat_runs"."finished_at" is not null and "chat_runs"."safe_error" is null) or
    ("chat_runs"."status" in ('failed', 'interrupted') and "chat_runs"."finished_at" is not null and length(trim("chat_runs"."safe_error")) > 0)
  ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_runs_user_message_id_unique` ON `chat_runs` (`user_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_runs_assistant_message_id_unique` ON `chat_runs` (`assistant_message_id`);--> statement-breakpoint
CREATE INDEX `chat_runs_household_idx` ON `chat_runs` (`household_id`);--> statement-breakpoint
CREATE INDEX `chat_runs_conversation_idx` ON `chat_runs` (`conversation_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_runs_one_running_per_conversation` ON `chat_runs` (`conversation_id`) WHERE "chat_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX `conversations_history_idx` ON `conversations` (`household_id`,`updated_at`,`id`);