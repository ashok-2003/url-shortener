CREATE TABLE `click_events` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` integer NOT NULL,
	`clicked_at` integer NOT NULL,
	`referrer` text,
	`country` text,
	`device_type` text NOT NULL,
	`browser` text,
	`os` text,
	`batch_id` text NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `click_events_link_clicked_idx` ON `click_events` (`link_id`,`clicked_at`);--> statement-breakpoint
CREATE INDEX `click_events_batch_link_idx` ON `click_events` (`batch_id`,`link_id`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`target_url` text NOT NULL,
	`owner_id` text NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`last_click_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `links_slug_unique` ON `links` (`slug`);--> statement-breakpoint
CREATE INDEX `links_owner_id_idx` ON `links` (`owner_id`,`id`);