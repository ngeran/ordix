-- ============================================================
-- Migration 0003: box sizes + bin locations (Tactile Warehouse OS)
-- ------------------------------------------------------------
-- The order calculator needs each product's sealed-box quantity
-- ("1 box = 25 pcs") and cards show the physical storage spot.
-- Hand-written ADD COLUMNs (D1 remote FK enforcement — see 0001).
-- ============================================================

ALTER TABLE `products` ADD `items_per_box` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `bin_location` text;
