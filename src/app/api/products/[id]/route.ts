// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { orderItems, products } from "@/db/schema";
import { customValuesForUpdate } from "@/lib/custom-fields-server";
import { errorResponse, requireAdmin } from "@/lib/api-auth";
import { parseJsonBody, productUpdateSchema } from "@/lib/validation";

// ============================================================
// SECTION: PATCH /api/products/[id] — update (admin only)
// ============================================================

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  try {
    const db = await getDb();
    const input = await parseJsonBody(request, productUpdateSchema);

    const { extra, ...fields } = input;
    const customValues = await customValuesForUpdate(db, "products", extra, async () => {
      const [row] = await db.select({ extra: products.extra }).from(products).where(eq(products.id, id)).limit(1);
      return row?.extra;
    });
    const [updated] = await db
      .update(products)
      .set({ ...fields, ...customValues, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

// ============================================================
// SECTION: DELETE /api/products/[id] — delete (admin only)
// ------------------------------------------------------------
// Products referenced by orders or stock history are never hard-
// deleted (that would corrupt tickets and the audit trail);
// they are deactivated instead, and the response says which
// path was taken so the UI can explain it.
// ============================================================

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  try {
    const db = await getDb();

    // -- Referential check: orders pin the product --
    const [orderRef] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orderItems)
      .where(eq(orderItems.productId, id));

    const isReferenced = Number(orderRef?.count ?? 0) > 0;

    if (isReferenced) {
      // Soft delete: keep history intact, hide from ordering.
      const [deactivated] = await db
        .update(products)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(products.id, id))
        .returning({ id: products.id });
      if (!deactivated) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
      return NextResponse.json({ deleted: false, deactivated: true });
    }

    // Truly unused product — safe to remove outright.
    const deleted = await db
      .delete(products)
      .where(eq(products.id, id))
      .returning({ id: products.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, deactivated: false });
  } catch (error) {
    return errorResponse(error);
  }
}
