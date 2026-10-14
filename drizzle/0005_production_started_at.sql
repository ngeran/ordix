-- ============================================================
-- Migration 0005: production start timestamp (order board timers)
-- ------------------------------------------------------------
-- Stamped when the order enters in_production (first item sent
-- or explicit transition). Hand-written ADD COLUMN (see 0001).
-- ============================================================

ALTER TABLE `orders` ADD `production_started_at` integer;
