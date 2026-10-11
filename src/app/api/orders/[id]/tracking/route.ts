// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orderEvents, orders } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import { parseJsonBody, trackingSchema } from "@/lib/validation";
import { getOrder, getOrderDetail } from "@/lib/order-service";

// ============================================================
// SECTION: Stages where courier info can be recorded
// ------------------------------------------------------------
// From "ready for courier" onwards — including corrections after
// dispatch (typo in the tracking number, courier switched).
// ============================================================

const TRACKABLE_STATUSES = ["ready", "dispatched", "completed"];

// ============================================================
// SECTION: POST /api/orders/[id]/tracking — courier hand-off
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
    const input = await parseJsonBody(request, trackingSchema);

    const order = await getOrder(db, orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (!TRACKABLE_STATUSES.includes(order.status)) {
      return NextResponse.json(
        { error: `Courier info can be recorded from "ready" onwards` },
        { status: 409 }
      );
    }

    await db.batch([
      db
        .update(orders)
        .set({
          courierName: input.courierName ?? order.courierName,
          trackingNumber: input.trackingNumber ?? order.trackingNumber,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId)),
      db.insert(orderEvents).values({
        id: crypto.randomUUID(),
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        userId: user.id,
        note: `Courier info: ${input.courierName ?? order.courierName ?? "—"} · ${
          input.trackingNumber ?? order.trackingNumber ?? "—"
        }`,
      }),
    ]);

    const detail = await getOrderDetail(db, orderId);
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
