// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, orders } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/api-auth";
import { customerUpdateSchema, parseJsonBody } from "@/lib/validation";

// ============================================================
// SECTION: PATCH /api/customers/[id] — update (admin only)
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
    const input = await parseJsonBody(request, customerUpdateSchema);

    const [updated] = await db
      .update(customers)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

// ============================================================
// SECTION: DELETE /api/customers/[id] — delete (admin only)
// ------------------------------------------------------------
// Customers with order history are deactivated instead of
// deleted — their orders must keep rendering the contact info.
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

    const [ref] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.customerId, id));

    if (Number(ref?.count ?? 0) > 0) {
      const [deactivated] = await db
        .update(customers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(customers.id, id))
        .returning({ id: customers.id });
      if (!deactivated) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }
      return NextResponse.json({ deleted: false, deactivated: true });
    }

    const deleted = await db
      .delete(customers)
      .where(eq(customers.id, id))
      .returning({ id: customers.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, deactivated: false });
  } catch (error) {
    return errorResponse(error);
  }
}
