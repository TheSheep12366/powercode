CREATE TABLE `directory_visibility` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`directory_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`directory_id`) REFERENCES `directories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `directory_visibility_uk` ON `directory_visibility` (`directory_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `directories` ADD `visible_to_all` integer DEFAULT true NOT NULL;