CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`participant_ids` text NOT NULL,
	`title` text DEFAULT 'New tasting session' NOT NULL,
	`model` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_household_idx` ON `conversations` (`household_id`);--> statement-breakpoint
CREATE TABLE `grapes` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`aka` text NOT NULL,
	`profile` text NOT NULL,
	`classic_regions` text NOT NULL,
	`what_to_taste_for` text NOT NULL,
	`benchmark_styles` text NOT NULL,
	`order_index` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grapes_slug_unique` ON `grapes` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `grapes_order_index_unique` ON `grapes` (`order_index`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`parts` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `palate_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`quiz_answers` text,
	`sweetness` integer,
	`acidity` integer,
	`tannin` integer,
	`body` integer,
	`oak` integer,
	`adventurousness` integer,
	`notes` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "palate_sweetness_range" CHECK("palate_profiles"."sweetness" is null or "palate_profiles"."sweetness" between 1 and 5),
	CONSTRAINT "palate_acidity_range" CHECK("palate_profiles"."acidity" is null or "palate_profiles"."acidity" between 1 and 5),
	CONSTRAINT "palate_tannin_range" CHECK("palate_profiles"."tannin" is null or "palate_profiles"."tannin" between 1 and 5),
	CONSTRAINT "palate_body_range" CHECK("palate_profiles"."body" is null or "palate_profiles"."body" between 1 and 5),
	CONSTRAINT "palate_oak_range" CHECK("palate_profiles"."oak" is null or "palate_profiles"."oak" between 1 and 5),
	CONSTRAINT "palate_adventurousness_range" CHECK("palate_profiles"."adventurousness" is null or "palate_profiles"."adventurousness" between 1 and 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `palate_profiles_profile_id_unique` ON `palate_profiles` (`profile_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_household_name_unique` ON `profiles` (`household_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_household_color_unique` ON `profiles` (`household_id`,`color`);--> statement-breakpoint
CREATE INDEX `profiles_household_idx` ON `profiles` (`household_id`);--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`profile_id` text,
	`wine_name` text NOT NULL,
	`producer` text,
	`grape` text,
	`region` text,
	`style` text,
	`price_band` text,
	`reasoning` text NOT NULL,
	`status` text DEFAULT 'suggested' NOT NULL,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recommendations_household_idx` ON `recommendations` (`household_id`);--> statement-breakpoint
CREATE INDEX `recommendations_profile_idx` ON `recommendations` (`profile_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `tasting_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`wine_id` text NOT NULL,
	`appearance` text,
	`nose` text NOT NULL,
	`palate` text NOT NULL,
	`finish` text,
	`rating` integer,
	`verdict` text NOT NULL,
	`freeform` text,
	`conversation_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wine_id`) REFERENCES `wines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "tasting_notes_rating_range" CHECK("tasting_notes"."rating" is null or "tasting_notes"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE INDEX `tasting_notes_household_idx` ON `tasting_notes` (`household_id`);--> statement-breakpoint
CREATE INDEX `tasting_notes_profile_idx` ON `tasting_notes` (`profile_id`);--> statement-breakpoint
CREATE INDEX `tasting_notes_conversation_idx` ON `tasting_notes` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `wines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`producer` text,
	`vintage` integer,
	`grapes` text NOT NULL,
	`region` text,
	`country` text,
	`style` text NOT NULL,
	`price_band` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wines_identity_unique` ON `wines` (`name`,`producer`,`vintage`);