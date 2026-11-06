CREATE TABLE `rate_limit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_events_owner_created_idx` ON `rate_limit_events` (`owner_id`,`created_at`);