// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { asBatch, getDb } from "@/db";
import { orderEvents, orderItems, orders } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import { closeOrderSchema, parseJsonBody } from "@/lib/validation";
import { getActiveItems, getOrder, getOrderDetail } from "@/lib/order-service";

// ============================================================
// SECTION: POST /api/orders/[id]/close — the cashier's action
// ------------------------------------------------------------
// Closes a finished build-to-order: status → completed
// (Ολοκληρώθηκε), paidAt stamped. Any items the production
// manager didn't individually click through are auto-completed
// here (stamped with the closer, noted on the timeline) — the
// cashier can never be blocked by leftover production states.
// Accepts orders in production_complete or in_production.
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
    // Acceptable starting points: production_complete (normal) or
    // in_production (the manager skipped the explicit hand-off —
    // closing implies production is done).
    if (
      order.status !== "production_complete" &&
      order.status !== "in_production"
    ) {
      return NextResponse.json(
        { error: "Only orders with completed production can be closed" },
        { status: 409 }
      );
    }

    // -- Any items the manager didn't individually click through
    // are auto-completed at close (stamped with the closer) — the
    // cashier can NEVER be blocked by leftover production states. --
    const now = new Date();
    // Raw sql template: D1 needs epoch seconds, not a Date object.
    const nowEpoch = Math.floor(now.getTime() / 1000);
    const activeItems = await getActiveItems(db, orderId);
    const unfinished = activeItems.filter(
      (item) => item.productionStatus !== "completed"
    );

    const statements: BatchItem<"sqlite">[] = [
      db
        .update(orders)
        .set({
          status: "completed",
          completedAt: now,
          paidAt: now,
          closedById: user.id,
          updatedAt: now,
        })
        .where(eq(orders.id, orderId)),
    ];

    if (unfinished.length > 0) {
      statements.push(
        db
          .update(orderItems)
          .set({
            productionStatus: "completed",
            sentToProductionAt: sql`coalesce(${orderItems.sentToProductionAt}, ${nowEpoch})`,
            sentToProductionById: sql`coalesce(${orderItems.sentToProductionById}, ${user.id})`,
            productionCompletedAt: now,
            productionCompletedById: user.id,
          })
          .where(
            and(
              eq(orderItems.orderId, orderId),
              eq(orderItems.status, "active"),
              eq(orderItems.productionStatus, "pending")
            )
          ),
        db
          .update(orderItems)
          .set({
            productionStatus: "completed",
            productionCompletedAt: now,
            productionCompletedById: user.id,
          })
          .where(
            and(
              eq(orderItems.orderId, orderId),
              eq(orderItems.status, "active"),
              eq(orderItems.productionStatus, "in_production")
            )
          ),
        db.insert(orderEvents).values({
          id: crypto.randomUUID(),
          orderId,
          fromStatus: order.status,
          toStatus: order.status,
          userId: user.id,
          note: `${unfinished.length} item(s) auto-completed at close`,
        })
      );
    }

    statements.push(
      db.insert(orderEvents).values({
        id: crypto.randomUUID(),
        orderId,
        fromStatus: order.status,
        toStatus: "completed",
        userId: user.id,
        note: `Order completed — closed by cashier`,
      })
    );

    await db.batch(asBatch(statements));

    const detail = await getOrderDetail(db, orderId);
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
