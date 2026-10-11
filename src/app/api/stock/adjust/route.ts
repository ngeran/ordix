// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/api-auth";
import { parseJsonBody, stockAdjustSchema } from "@/lib/validation";
import { applyStockDelta } from "@/lib/inventory";

// ============================================================
// SECTION: POST /api/stock/adjust — manual stock correction
// ------------------------------------------------------------
// Admin-only. Accepts either a signed `delta` or an absolute
// `newQuantity` (converted to a delta against the current value
// so the audit trail always records a movement, never an
// overwrite). The reason is mandatory and lands in
// `stock_movements` next to the acting user.
// ============================================================

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const user = guard.user;

  try {
    const db = await getDb();
    const input = await parseJsonBody(request, stockAdjustSchema);

    // Absolute set → relative delta against the current value.
    let delta = input.delta;
    if (input.newQuantity !== undefined) {
      const [product] = await db
        .select({ stockQuantity: products.stockQuantity })
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);
      if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
      delta = input.newQuantity - product.stockQuantity;
    }
    if (delta === undefined || delta === 0) {
      return NextResponse.json(
        { error: "Nothing to adjust (delta is zero)" },
        { status: 400 }
      );
    }

    const result = await applyStockDelta(db, {
      productId: input.productId,
      delta,
      reason: input.reason,
      userId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.error === "insufficient_stock"
              ? "Adjustment would push stock below zero"
              : "Product not found",
        },
        { status: result.error === "insufficient_stock" ? 409 : 404 }
      );
    }

    return NextResponse.json({
      productId: input.productId,
      newQuantity: result.newQuantity,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
