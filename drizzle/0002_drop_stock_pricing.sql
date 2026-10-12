-- ============================================================
-- Migration 0002: products become pure identifiers (Phase 2.1)
-- ------------------------------------------------------------
-- Everything is built to order — no stock, no catalog prices.
-- Hand-written DROP COLUMN statements (D1 remote enforces FKs
-- per statement, so table rebuilds are avoided — see 0001).
-- ============================================================

-- Stock tracking is gone; the audit table goes with it.
DROP TABLE `stock_movements`;--> statement-breakpoint
DROP TABLE `app_settings`;--> statement-breakpoint

ALTER TABLE `products` DROP COLUMN `stock_quantity`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `min_stock`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `price_cents`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `items_per_box`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `price_per_box_cents`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `price_per_item_cents`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `unit`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `weight_grams`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `supplier`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `notes`;
