-- ============================================================
-- Migration 0004: drop bin_location (Phase 2.2 cleanup)
-- ------------------------------------------------------------
-- The bin field was removed from the product form; the column
-- has no remaining purpose. Hand-written DROP COLUMN (see 0001).
-- ============================================================

ALTER TABLE `products` DROP COLUMN `bin_location`;
