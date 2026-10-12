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
} from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import { itemActionSchema, parseJsonBody } from "@/lib/validation";
import { getOrder, getOrderDetail, recalculateOrderTotal } from "@/lib/order-service";
import { getSettings } from "@/lib/settings";

// ============================================================
// SECTION: Item actions — production clicks + edits
// ------------------------------------------------------------
//   send_to_production : pending   → in_production  (manager click 1)
//   complete_production: in_production → completed   (manager click 2)
//   void               : only while still pending (audit + optional
//                        restock in sell-from-stock mode)
//   check              : legacy packing tick (harmless if unused)
// Sending the first item auto-advances a "placed" order to
// in_production so the boards stay truthful without a second tap.
// ============================================================

const VOIDABLE_STATUSES = ["placed", "in_production", "on_hold"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const user = guard.user;
  const { id: orderId, itemId } = await params;

  try {
    const db = await getDb();
    const input = await parseJsonBody(request, itemActionSchema);

    const order = await getOrder(db, orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const [item] = await db
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))
      .limit(1);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // ============================================================
    // SECTION: Send to production (pending → in_production)
    // ============================================================
    if (input.action === "send_to_production") {
      if (item.status !== "active" || item.productionStatus !== "pending") {
        return NextResponse.json(
          { error: "Item is not waiting for production" },
          { status: 409 }
        );
      }
      const now = new Date();
      const statements: BatchItem<"sqlite">[] = [
        db
          .update(orderItems)
          .set({
            productionStatus: "in_production",
            sentToProductionAt: now,
            sentToProductionById: user.id,
          })
          .where(eq(orderItems.id, itemId)),
      ];

      // First click moves the whole order out of "placed".
      if (order.status === "placed") {
        statements.push(
          db
            .update(orders)
            .set({ status: "in_production", updatedAt: now })
            .where(eq(orders.id, orderId))
        );
        statements.push(
          db.insert(orderEvents).values({
            id: crypto.randomUUID(),
            orderId,
            fromStatus: "placed",
            toStatus: "in_production",
            userId: user.id,
            note: `Sent to production: ${item.name}`,
          })
        );
      } else {
        statements.push(
          db.insert(orderEvents).values({
            id: crypto.randomUUID(),
            orderId,
            fromStatus: order.status,
            toStatus: order.status,
            userId: user.id,
            note: `Sent to production: ${item.name}`,
          })
        );
      }

      await db.batch(asBatch(statements));
      const detail = await getOrderDetail(db, orderId);
      return NextResponse.json(detail);
    }

    // ============================================================
    // SECTION: Complete production (in_production → completed)
    // ============================================================
    if (input.action === "complete_production") {
      if (item.productionStatus !== "in_production") {
        return NextResponse.json(
          { error: "Item is not in production" },
          { status: 409 }
        );
      }
      const now = new Date();
      await db.batch(
        asBatch([
          db
            .update(orderItems)
            .set({
              productionStatus: "completed",
              productionCompletedAt: now,
              productionCompletedById: user.id,
            })
            .where(eq(orderItems.id, itemId)),
          db.insert(orderEvents).values({
            id: crypto.randomUUID(),
            orderId,
            fromStatus: order.status,
            toStatus: order.status,
            userId: user.id,
            note: `Production completed: ${item.name}`,
          }),
        ])
      );
      const detail = await getOrderDetail(db, orderId);
      return NextResponse.json(detail);
    }

    // ============================================================
    // SECTION: Void a single item (with reason → audit + restock)
    // ============================================================
    if (input.action === "void") {
      if (item.status !== "active") {
        return NextResponse.json(
          { error: "Item is already voided" },
          { status: 409 }
        );
      }
      if (!VOIDABLE_STATUSES.includes(order.status)) {
        return NextResponse.json(
          { error: `Items cannot be voided while the order is ${order.status}` },
          { status: 409 }
        );
      }
      // Produced goods are physical reality — they can't be voided
      // away, only cancelled via the order.
      if (item.productionStatus !== "pending") {
        return NextResponse.json(
          { error: "Item already sent to production — cancel the order instead" },
          { status: 409 }
        );
      }

      const settings = await getSettings(db);
      const statements: BatchItem<"sqlite">[] = [
        db
          .update(orderItems)
          .set({
            status: "voided",
            voidReason: input.reason,
            voidNote: input.note ?? null,
            voidedById: user.id,
            voidedAt: new Date(),
          })
          .where(eq(orderItems.id, itemId)),
        db.insert(orderEvents).values({
          id: crypto.randomUUID(),
          orderId,
          fromStatus: order.status,
          toStatus: order.status,
          userId: user.id,
          note: `Voided: ${item.name} ×${item.quantity} — ${input.reason}`,
        }),
      ];

      // Restock only matters in sell-from-stock mode.
      if (!settings.buildToOrder && settings.restockOnVoid) {
        statements.push(
          db
            .update(products)
            .set({ stockQuantity: sql`${products.stockQuantity} + ${item.quantity}` })
            .where(eq(products.id, item.productId))
        );
        statements.push(
          db.insert(stockMovements).values({
            id: crypto.randomUUID(),
            productId: item.productId,
            delta: item.quantity,
            reason: `void:${order.orderNumber}`,
            orderId,
            userId: user.id,
          })
        );
      }

      await db.batch(asBatch(statements));
      await recalculateOrderTotal(db, orderId);

      const detail = await getOrderDetail(db, orderId);
      return NextResponse.json(detail);
    }

    // ============================================================
    // SECTION: Toggle the (legacy) packing checklist tick
    // ============================================================
    if (input.action === "check") {
      if (item.status !== "active") {
        return NextResponse.json(
          { error: "Voided items cannot be checked" },
          { status: 409 }
        );
      }
      await db
        .update(orderItems)
        .set({
          isChecked: input.isChecked,
          checkedAt: input.isChecked ? new Date() : null,
          checkedById: input.isChecked ? user.id : null,
        })
        .where(eq(orderItems.id, itemId));

      const detail = await getOrderDetail(db, orderId);
      return NextResponse.json(detail);
    }

    // Discriminated union makes this unreachable; kept for exhaustiveness.
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
