-- ============================================================
-- Migration 0006: usernames, user deactivation, app settings
-- ------------------------------------------------------------
-- Hand-written ADD COLUMN (see 0001): rebuilding `users` would
-- trip D1's per-statement FK checks — every order references it.
-- `email` therefore stays NOT NULL UNIQUE in SQL; users created
-- in the app without an email get a reserved placeholder
-- (<username>@users.invalid) the UI never shows.
--
-- Existing users get their email's local part as username
-- (admin@ordix.local → "admin"); on a clash, later accounts fall
-- back to the full email so the unique index always builds.
-- ============================================================

ALTER TABLE `users` ADD `username` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `users` SET `username` = lower(trim(CASE WHEN instr(`email`, '@') > 1 THEN substr(`email`, 1, instr(`email`, '@') - 1) ELSE `email` END));--> statement-breakpoint
UPDATE `users` SET `username` = lower(`email`) WHERE `id` IN (
  SELECT `id` FROM (
    SELECT `id`, row_number() OVER (PARTITION BY `username` ORDER BY `created_at`, `id`) AS `rn` FROM `users`
  ) WHERE `rn` > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
ALTER TABLE `users` ADD `is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint

-- App-wide settings: one JSON document per key (currently "app").
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
