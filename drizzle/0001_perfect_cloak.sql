-- ============================================================
-- Migration 0001: Phase 2 — build-to-order
-- (hand-written: the drizzle-generated table-rebuild for
-- order_items trips D1's per-statement FK enforcement; plain
-- ADD COLUMN statements achieve the identical final schema
-- without touching existing rows)
-- ============================================================

PRAGMA defer_foreign_keys = TRUE;

-- Customers: every build-to-order order belongs to one.
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`phone` text,
	`email` text,
	`comments` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint

-- Orders: customer link + cashier close audit.
ALTER TABLE `orders` ADD `customer_id` text REFERENCES customers(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `paid_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_method` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_note` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `closed_by_id` text REFERENCES users(id);--> statement-breakpoint

-- Order items: κουτιά / τεμάχια quantities, price snapshots,
-- authoritative line totals, and the production two-tap states.
ALTER TABLE `order_items` ADD `quantity_boxes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `quantity_items` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `unit_price_box_cents` integer;--> statement-breakpoint
ALTER TABLE `order_items` ADD `unit_price_item_cents` integer;--> statement-breakpoint
ALTER TABLE `order_items` ADD `line_total_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `production_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `sent_to_production_at` integer;--> statement-breakpoint
ALTER TABLE `order_items` ADD `sent_to_production_by_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `order_items` ADD `production_completed_at` integer;--> statement-breakpoint
ALTER TABLE `order_items` ADD `production_completed_by_id` text REFERENCES users(id);--> statement-breakpoint

-- Products: box relations and per-box/per-piece prices.
ALTER TABLE `products` ADD `items_per_box` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `price_per_box_cents` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `price_per_item_cents` integer;--> statement-breakpoint

-- Backfill: legacy lines had no line_total_cents — derive from the
-- classic quantity × unit price so totals survive the new formula.
UPDATE `order_items` SET `line_total_cents` = `unit_price_cents` * `quantity` WHERE `line_total_cents` = 0;
