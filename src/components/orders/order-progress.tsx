"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import type { OrderSummary } from "@/types";
import { summaryProgress } from "@/lib/order-status";
import { ProgressBar } from "@/components/orders/order-visuals";

// ============================================================
// SECTION: Order progress bar (list rows)
// ------------------------------------------------------------
// Thin adapter: list aggregates → the shared ProgressBar, so
// list screens and the detail page use one formula.
// ============================================================

interface OrderProgressProps {
  order: Pick<OrderSummary, "itemCount" | "producedCount" | "inProductionCount">;
  size?: "sm" | "md" | "lg";
}

export function OrderProgress({ order, size = "sm" }: OrderProgressProps) {
  return <ProgressBar progress={summaryProgress(order)} size={size} />;
}
