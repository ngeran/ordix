-- ============================================================
-- Migration 0007: owner-defined custom fields
-- ------------------------------------------------------------
-- Definitions live in `custom_fields`; values are a JSON object in a
-- nullable `extra` column on products / customers / categories, so
-- adding or hiding a field never needs another migration.
-- (Also re-baselines drizzle/meta: 0007_snapshot.json = full schema.)
-- ============================================================

CREATE TABLE `custom_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`key` text NOT NULL,
	`label_en` text NOT NULL,
	`label_el` text,
	`type` text DEFAULT 'text' NOT NULL,
	`options` text,
	`required` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `custom_fields_entity_key_unique` ON `custom_fields` (`entity`,`key`);--> statement-breakpoint
ALTER TABLE `products` ADD `extra` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `extra` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `extra` text;
