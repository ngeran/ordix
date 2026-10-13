// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { asBatch, getDb } from "@/db";
import {
  orderEvents,
  orderItems,
  orders,
  type OrderStatus,
} from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import { parseJsonBody, statusUpdateSchema } from "@/lib/validation";
import {
  allItemsProduced,
  canTransition,
  isTerminal,
} from "@/lib/order-status";
import { getActiveItems, getOrder, getOrderDetail } from "@/lib/order-service";

// ============================================================
// SECTION: Lifecycle timestamp map
// ------------------------------------------------------------
// Entering a stage stamps its `…At` column — the timeline on the
// detail page and any future reporting build on these.
// ============================================================

const STAGE_TIMESTAMP_COLUMN = {
  placed: "placedAt",
  in_production: null, // stamped per-item; the timeline event covers the order
  production_complete: null,
  preparing: "preparingAt",
  prepared: "preparedAt",
  boxed: "boxedAt",
  ready: "readyAt",
  dispatched: "dispatchedAt",
  completed: "completedAt",
  cancelled: "cancelledAt",
  on_hold: null, // hold is a pause, not a stage — no column
} as const satisfies Record<OrderStatus, string | null>;

// ============================================================
// SECTION: POST /api/orders/[id]/status — transition the order
// ------------------------------------------------------------
// Server-side status recomputation: the transition is validated
// against the state machine (src/lib/order-status.ts) regardless
// of what the client believes. Cancelling additionally restocks
// every active item (stock never left for a cancelled order).
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
    const input = await parseJsonBody(request, statusUpdateSchema);
    const targetStatus = input.status;

    const order = await getOrder(db, orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (isTerminal(order.status)) {
      return NextResponse.json(
        { error: `Order is already ${order.status} and cannot change` },
        { status: 409 }
      );
    }
    if (!canTransition(order.status, targetStatus)) {
      return NextResponse.json(
        { error: `Cannot move order from ${order.status} to ${targetStatus}` },
        { status: 409 }
      );
    }

    // -- Base update: status + stage timestamp --
    const timestampColumn = STAGE_TIMESTAMP_COLUMN[targetStatus];
    const orderUpdate: Record<string, unknown> = {
      status: targetStatus,
      updatedAt: new Date(),
    };
    if (timestampColumn) orderUpdate[timestampColumn] = new Date();
    if (targetStatus === "cancelled") {
      orderUpdate.cancelledById = user.id;
      orderUpdate.cancelReason = input.note ?? null;
    }

    // -- Cancellation: void the lines so the order carries no value.
    // Build-to-order: nothing was ever deducted from stock, so
    // there is nothing to hand back. --
    const isCancel = targetStatus === "cancelled";
    const statements: BatchItem<"sqlite">[] = [
      db.update(orders).set(orderUpdate).where(eq(orders.id, orderId)),
    ];

    if (isCancel) {
      statements.push(
        db
          .update(orderItems)
          .set({
            status: "voided",
            voidReason: "order_cancelled",
            voidNote: input.note ?? null,
            voidedById: user.id,
            voidedAt: new Date(),
          })
          .where(
            and(
              eq(orderItems.orderId, orderId),
              eq(orderItems.status, "active")
            )
          )
      );
      statements.push(
        db.update(orders).set({ totalCents: 0 }).where(eq(orders.id, orderId))
      );
    }

    // -- Handoff to the department requires EVERY active item to be
    // produced. Otherwise → 409 with the count; the production
    // board is where the remaining items get finished. --
    if (targetStatus === "production_complete") {
      const items = await getActiveItems(db, orderId);
      if (!allItemsProduced(items)) {
        const remaining = items.filter(
          (item) => item.productionStatus !== "completed"
        ).length;
        return NextResponse.json(
          {
            error: `${remaining} item(s) still in production`,
          },
          { status: 409 }
        );
      }
    }

    // -- Timeline event (both hold and resume are visible) --
    statements.push(
      db.insert(orderEvents).values({
        id: crypto.randomUUID(),
        orderId,
        fromStatus: order.status,
        toStatus: targetStatus,
        userId: user.id,
        note: input.note ?? null,
      })
    );

    await db.batch(asBatch(statements));

    const detail = await getOrderDetail(db, orderId);
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
