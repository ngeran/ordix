// ============================================================
// SECTION: Imports
// ============================================================

import { eq, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { products, stockMovements } from "@/db/schema";

// ============================================================
// SECTION: Inventory service (server-side)
// ------------------------------------------------------------
// All stock mutations funnelling through this module guarantees
// two invariants:
//   1. Stock can never go below zero (guarded UPDATE … WHERE).
//   2. Every change is logged to `stock_movements` with a reason
//      and the acting user — the audit trail admins rely on.
// The order-placement fast path uses an explicit D1 batch
// instead (see src/app/api/orders/route.ts) for atomicity.
// ============================================================

type Database = ReturnType<typeof drizzle>;

export interface StockAdjustment {
  productId: string;
  /** Signed delta: negative removes stock, positive adds back. */
  delta: number;
  /** Human-readable reason (required for manual adjustments). */
  reason: string;
  userId: string;
  orderId?: string;
}

export interface StockAdjustmentResult {
  ok: boolean;
  /** Stock value after the change — only set when `ok`. */
  newQuantity?: number;
  /** Set when the guarded update refused (insufficient stock). */
  error?: "insufficient_stock" | "product_not_found";
}

/**
 * Apply a single signed stock delta, guarded against going
 * negative, and log a movement row. Used by manual adjustments
 * and void-restock (order placement uses the batch path).
 */
export async function applyStockDelta(
  db: Database,
  adjustment: StockAdjustment
): Promise<StockAdjustmentResult> {
  // Guarded decrement: the WHERE clause fails the update instead of
  // letting stock dip below zero. Returns the new quantity to verify.
  const updated = await db
    .update(products)
    .set({
      stockQuantity: sql`${products.stockQuantity} + ${adjustment.delta}`,
      updatedAt: new Date(),
    })
    .where(
      sql`${products.id} = ${adjustment.productId} and ${products.stockQuantity} + ${adjustment.delta} >= 0`
    )
    .returning({ newQuantity: products.stockQuantity });

  if (updated.length === 0) {
    // Either the product is gone or the delta would underflow —
    // distinguish the two so callers can show the right message.
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, adjustment.productId))
      .limit(1);
    return existing
      ? { ok: false, error: "insufficient_stock" }
      : { ok: false, error: "product_not_found" };
  }

  await db.insert(stockMovements).values({
    id: crypto.randomUUID(),
    productId: adjustment.productId,
    delta: adjustment.delta,
    reason: adjustment.reason,
    orderId: adjustment.orderId ?? null,
    userId: adjustment.userId,
  });

  return { ok: true, newQuantity: updated[0].newQuantity };
}
