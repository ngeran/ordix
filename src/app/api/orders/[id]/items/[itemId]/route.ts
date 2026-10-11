// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { asBatch, getDb } from "@/db";
import { orderEvents, orderItems, orders, products, stockMovements } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import { itemActionSchema, parseJsonBody } from "@/lib/validation";
import { getOrder, getOrderDetail, recalculateOrderTotal } from "@/lib/order-service";
import { getSettings } from "@/lib/settings";

// ============================================================
// SECTION: Stages where single items may still be voided
// ------------------------------------------------------------
// Voids are for pre-dispatch corrections; once the courier has
// the box the order is immutable (disputes go through admin).
// ============================================================

const VOIDABLE_STATUSES = ["placed", "preparing", "prepared", "boxed"];
/** Stages where the packing checklist can be ticked. */
const CHECKABLE_STATUSES = ["prepared", "boxed", "ready"];

// ============================================================
// SECTION: POST /api/orders/[id]/items/[itemId] — item actions
// ------------------------------------------------------------
// action = "void":  reason + who + when are mandatory (audit),
//                   stock optionally returns per the setting.
// action = "check": toggles the packing checklist tick.
// ============================================================

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

      // Optionally hand the quantity back to the shelf.
      if (settings.restockOnVoid) {
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
    // SECTION: Toggle the packing checklist tick
    // ============================================================
    if (input.action === "check") {
      if (item.status !== "active") {
        return NextResponse.json(
          { error: "Voided items cannot be checked" },
          { status: 409 }
        );
      }
      if (!CHECKABLE_STATUSES.includes(order.status)) {
        return NextResponse.json(
          { error: `Packing checklist is not active while the order is ${order.status}` },
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
