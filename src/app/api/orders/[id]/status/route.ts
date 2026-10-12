// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { asBatch, getDb } from "@/db";
import {
  orderEvents,
  orderItems,
  orders,
  products,
  stockMovements,
  type OrderStatus,
} from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import { parseJsonBody, statusUpdateSchema } from "@/lib/validation";
import { canTransition, isTerminal } from "@/lib/order-status";
import { getActiveItems, getOrder, getOrderDetail } from "@/lib/order-service";
import { getSettings } from "@/lib/settings";

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

    // -- Cancellation: void the lines so totals go to zero; stock is
    // handed back ONLY in sell-from-stock mode (build-to-order never
    // deducted anything — production makes the goods). --
    const settings = await getSettings(db);
    const isCancel = targetStatus === "cancelled";
    const statements: BatchItem<"sqlite">[] = [
      db.update(orders).set(orderUpdate).where(eq(orders.id, orderId)),
    ];

    if (isCancel) {
      const activeItems = await getActiveItems(db, orderId);
      if (activeItems.length > 0) {
        // 1. Void all active lines with the shared audit fields.
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

        // 2. Sell-from-stock only: return quantities to the shelf.
        if (!settings.buildToOrder) {
          const quantityByProduct = new Map<string, number>();
          for (const item of activeItems) {
            quantityByProduct.set(
              item.productId,
              (quantityByProduct.get(item.productId) ?? 0) + item.quantity
            );
          }
          for (const [productId, qty] of quantityByProduct) {
            statements.push(
              db
                .update(products)
                .set({ stockQuantity: sql`${products.stockQuantity} + ${qty}` })
                .where(eq(products.id, productId))
            );
            statements.push(
              db.insert(stockMovements).values({
                id: crypto.randomUUID(),
                productId,
                delta: qty,
                reason: `cancel:${order.orderNumber}`,
                orderId,
                userId: user.id,
              })
            );
          }
        }

        // 3. Cancelled orders carry no value in the totals column.
        statements.push(
          db.update(orders).set({ totalCents: 0 }).where(eq(orders.id, orderId))
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
