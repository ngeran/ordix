// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { asBatch, getDb } from "@/db";
import { orderEvents, orderItems, orders } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import {
  itemActionSchema,
  itemEditSchema,
  parseJsonBody,
} from "@/lib/validation";
import { getOrder, getOrderDetail, recalculateOrderTotal } from "@/lib/order-service";

// ============================================================
// SECTION: Item actions — production clicks + edits
// ------------------------------------------------------------
//   send_to_production : pending   → in_production  (manager click 1)
//   complete_production: in_production → completed   (manager click 2)
//   void               : only while still pending (audit trail)
// Sending the first item auto-advances a "placed" order to
// in_production so the boards stay truthful without a second tap.
// Build-to-order: voids never touch stock — nothing was deducted.
// ============================================================

const VOIDABLE_STATUSES = ["placed", "in_production", "on_hold"];

// ============================================================
// SECTION: PATCH — edit quantities of a pending line
// ------------------------------------------------------------
// The order taker can correct κουτιά / τεμάχια numbers until the
// production manager sends the line to production. The order
// total is recomputed after every edit.
// ============================================================

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const user = guard.user;
  const { id: orderId, itemId } = await params;

  try {
    const db = await getDb();
    const input = await parseJsonBody(request, itemEditSchema);

    const order = await getOrder(db, orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (!VOIDABLE_STATUSES.includes(order.status)) {
      return NextResponse.json(
        { error: `Items cannot be edited while the order is ${order.status}` },
        { status: 409 }
      );
    }

    const [item] = await db
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))
      .limit(1);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (item.status !== "active" || item.productionStatus !== "pending") {
      return NextResponse.json(
        { error: "Item is already in production and cannot be edited" },
        { status: 409 }
      );
    }

    await db.batch(
      asBatch([
        db
          .update(orderItems)
          .set({
            quantityBoxes: input.quantityBoxes,
            quantityItems: input.quantityItems,
            quantity: input.quantityBoxes + input.quantityItems,
          })
          .where(eq(orderItems.id, itemId)),
        db.insert(orderEvents).values({
          id: crypto.randomUUID(),
          orderId,
          fromStatus: order.status,
          toStatus: order.status,
          userId: user.id,
          note: `Edited: ${item.name} → ${input.quantityBoxes} boxes + ${input.quantityItems} items`,
        }),
      ])
    );
    await recalculateOrderTotal(db, orderId);

    const detail = await getOrderDetail(db, orderId);
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

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
    // SECTION: Void a single item (with reason → audit)
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

      await db.batch(
        asBatch([
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
            note: `Voided: ${item.name} — ${input.reason}`,
          }),
        ])
      );
      await recalculateOrderTotal(db, orderId);

      const detail = await getOrderDetail(db, orderId);
      return NextResponse.json(detail);
    }

    // Discriminated union makes this unreachable; kept for exhaustiveness.
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
