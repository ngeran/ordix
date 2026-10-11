// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { asBatch, getDb } from "@/db";
import { orderEvents, orderItems, orders, products, stockMovements } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import { appendItemsSchema, parseJsonBody } from "@/lib/validation";
import { getOrder, getOrderDetail, recalculateOrderTotal } from "@/lib/order-service";
import { getSettings } from "@/lib/settings";

// ============================================================
// SECTION: Order stages that still accept appended rounds
// ------------------------------------------------------------
// Once the box is sealed for the courier (ready), the order is
// frozen — new items belong on a new order.
// ============================================================

const APPENDABLE_STATUSES = ["placed", "preparing", "prepared", "boxed", "on_hold"];

// ============================================================
// SECTION: POST /api/orders/[id]/items — append a round
// ------------------------------------------------------------
// Manolis-POS "rounds": add more items to an open order. Each
// append gets the next round number, stock is deducted exactly
// like on placement, and the order total is recomputed.
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
    const input = await parseJsonBody(request, appendItemsSchema);

    const order = await getOrder(db, orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (!APPENDABLE_STATUSES.includes(order.status)) {
      return NextResponse.json(
        { error: `Items cannot be appended to a ${order.status} order` },
        { status: 409 }
      );
    }

    // -- Load & validate products (same rules as placement) --
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const productRows = await db
      .select()
      .from(products)
      .where(inArray(products.id, productIds));
    const productById = new Map(productRows.map((row) => [row.id, row]));

    const settings = await getSettings(db);
    for (const item of input.items) {
      const product = productById.get(item.productId);
      if (!product) {
        return NextResponse.json(
          { error: "Unknown product in round" },
          { status: 400 }
        );
      }
      if (!product.isActive) {
        return NextResponse.json(
          { error: `Product unavailable: ${product.name}` },
          { status: 400 }
        );
      }
      if (!settings.allowOversell && product.stockQuantity < item.quantity) {
        return NextResponse.json(
          {
            error: `Not enough stock for ${product.name} (available: ${product.stockQuantity})`,
          },
          { status: 409 }
        );
      }
    }

    // -- Next round number for this order --
    const [roundRow] = await db
      .select({ maxRound: sql<number>`coalesce(max(${orderItems.round}), 0)` })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    const nextRound = Number(roundRow?.maxRound ?? 0) + 1;

    // -- Batch: items + guarded stock deduction + movements + event --
    const itemValues = input.items.map((item) => {
      const product = productById.get(item.productId)!;
      return {
        id: crypto.randomUUID(),
        orderId,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCents: product.priceCents,
        name: product.name,
        partNumber: product.partNumber,
        note: item.note ?? null,
        round: nextRound,
      };
    });

    const quantityByProduct = new Map<string, number>();
    for (const item of input.items) {
      quantityByProduct.set(
        item.productId,
        (quantityByProduct.get(item.productId) ?? 0) + item.quantity
      );
    }

    const statements: BatchItem<"sqlite">[] = [
      db.insert(orderItems).values(itemValues),
      ...[...quantityByProduct].map(([productId, qty]) =>
        db
          .update(products)
          .set({ stockQuantity: sql`${products.stockQuantity} - ${qty}` })
          .where(
            and(
              eq(products.id, productId),
              sql`${products.stockQuantity} >= ${qty}`
            )
          )
      ),
      db.insert(stockMovements).values(
        [...quantityByProduct].map(([productId, qty]) => ({
          id: crypto.randomUUID(),
          productId,
          delta: -qty,
          reason: `round:${order.orderNumber}`,
          orderId,
          userId: user.id,
        }))
      ),
      db.insert(orderEvents).values({
        id: crypto.randomUUID(),
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        userId: user.id,
        note: `Round ${nextRound} added (${input.items.length} item(s))`,
      }),
    ];

    await db.batch(asBatch(statements));

    // -- Recompute the stored total from the new item set --
    await recalculateOrderTotal(db, orderId);

    const detail = await getOrderDetail(db, orderId);
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
