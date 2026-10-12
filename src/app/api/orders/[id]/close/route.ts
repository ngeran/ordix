// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orderEvents, orderItems, orders } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import { closeOrderSchema, parseJsonBody } from "@/lib/validation";
import { getActiveItems, getOrder, getOrderDetail } from "@/lib/order-service";

// ============================================================
// SECTION: POST /api/orders/[id]/close — the cashier's action
// ------------------------------------------------------------
// Closes a finished build-to-order after collecting payment:
//   status → completed (Ολοκληρώθηκε), paidAt + method stamped.
// Guardrails:
//   - order must be production_complete
//   - every active line must be production-completed
//     (admin may pass force:true in exceptional cases — the
//     forced close is written to the timeline)
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
    const input = await parseJsonBody(request, closeOrderSchema);

    const order = await getOrder(db, orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.status !== "production_complete") {
      return NextResponse.json(
        { error: "Only orders with completed production can be closed" },
        { status: 409 }
      );
    }

    // -- All-lines-produced rule (admin force bypasses, loudly) --
    if (!input.force || user.role !== "admin") {
      const activeItems = await getActiveItems(db, orderId);
      const unfinished = activeItems.filter(
        (item) => item.productionStatus !== "completed"
      );
      if (unfinished.length > 0) {
        return NextResponse.json(
          {
            error: `${unfinished.length} item(s) are not finished in production yet`,
          },
          { status: 409 }
        );
      }
    }

    const now = new Date();
    await db.batch([
      db
        .update(orders)
        .set({
          status: "completed",
          completedAt: now,
          paidAt: now,
          paymentMethod: input.paymentMethod ?? null,
          paymentNote: input.paymentNote ?? null,
          closedById: user.id,
          updatedAt: now,
        })
        .where(eq(orders.id, orderId)),
      db.insert(orderEvents).values({
        id: crypto.randomUUID(),
        orderId,
        fromStatus: "production_complete",
        toStatus: "completed",
        userId: user.id,
        note: `Payment collected${input.paymentMethod ? ` (${input.paymentMethod})` : ""}${
          input.force ? " — FORCED close" : ""
        }`,
      }),
    ]);

    const detail = await getOrderDetail(db, orderId);
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
