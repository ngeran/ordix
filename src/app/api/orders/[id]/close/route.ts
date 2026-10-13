// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orderEvents, orders } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import { closeOrderSchema, parseJsonBody } from "@/lib/validation";
import {
  allItemsProduced,
  isClosableStatus,
} from "@/lib/order-status";
import { getActiveItems, getOrder, getOrderDetail } from "@/lib/order-service";

// ============================================================
// SECTION: POST /api/orders/[id]/close — department closure
// ------------------------------------------------------------
// The ONLY path to `completed` (Ολοκληρώθηκε). Rules:
//   - order must be closable: production_complete, or
//     in_production with every active item produced (edge case)
//   - the close is a conditional UPDATE … RETURNING: if another
//     request changed the status first, 0 rows change → 409
//   - legacy payment columns (paidAt etc.) are NEVER written
//   - timeline note: "Closed by department"
// ============================================================

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const user = guard.user;
  const { id: orderId } = await params;

  try {
    const db = await getDb();
    await parseJsonBody(request, closeOrderSchema);

    const order = await getOrder(db, orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (!isClosableStatus(order.status)) {
      return NextResponse.json(
        {
          error:
            "Only returned orders (production complete) can be closed by the department",
        },
        { status: 409 }
      );
    }

    // Edge case: closing while still in_production requires every
    // active item to be produced already.
    if (order.status === "in_production") {
      const items = await getActiveItems(db, orderId);
      if (!allItemsProduced(items)) {
        return NextResponse.json(
          { error: "Not every item has been produced yet" },
          { status: 409 }
        );
      }
    }

    const now = new Date();
    // Conditional close: only fires while the status is unchanged,
    // so two concurrent closes produce exactly one 200 + one 409.
    const closed = await db
      .update(orders)
      .set({
        status: "completed",
        completedAt: now,
        closedById: user.id,
        updatedAt: now,
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, order.status)))
      .returning({ id: orders.id });

    if (closed.length === 0) {
      return NextResponse.json(
        { error: "The order changed meanwhile — refresh and try again" },
        { status: 409 }
      );
    }

    await db.insert(orderEvents).values({
      id: crypto.randomUUID(),
      orderId,
      fromStatus: order.status,
      toStatus: "completed",
      userId: user.id,
      note: "Closed by department",
    });

    const detail = await getOrderDetail(db, orderId);
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
