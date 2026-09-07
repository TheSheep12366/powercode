CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`can_manage_users` integer DEFAULT false NOT NULL,
	`can_manage_directories` integer DEFAULT false NOT NULL,
	`can_view_audit` integer DEFAULT false NOT NULL,
	`workspace_mode` text DEFAULT 'all' NOT NULL,
	`workspace_level` text DEFAULT 'rw' NOT NULL,
	`workspace_dir_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_uk` ON `roles` (`name`);--> statement-breakpoint
ALTER TABLE `users` ADD `role_id` integer REFERENCES roles(id);