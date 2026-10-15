// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { asBatch, getDb, queryInChunks } from "@/db";
import { orderEvents, orderItems, products } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import { appendItemsSchema, parseJsonBody } from "@/lib/validation";
import { getOrder, getOrderDetail, recalculateOrderTotal } from "@/lib/order-service";

// ============================================================
// SECTION: Order stages that still accept appended rounds
// ============================================================

const APPENDABLE_STATUSES = ["placed", "in_production", "on_hold"];

// ============================================================
// SECTION: POST /api/orders/[id]/items — append a round
// ------------------------------------------------------------
// Same rules as placement: boxes + items per line, manual quoted
// price, snapshots on write, production status starts "pending".
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

    // -- Load & validate products --
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const productRows = await queryInChunks(productIds, (ids) =>
      db.select().from(products).where(inArray(products.id, ids))
    );
    const productById = new Map(productRows.map((row) => [row.id, row]));

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
    }

    // -- Next round number for this order --
    const [roundRow] = await db
      .select({ maxRound: sql<number>`coalesce(max(${orderItems.round}), 0)` })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    const nextRound = Number(roundRow?.maxRound ?? 0) + 1;

    // -- Batch: items + event --
    const itemValues = input.items.map((item) => {
      const product = productById.get(item.productId)!;
      return {
        id: crypto.randomUUID(),
        orderId,
        productId: item.productId,
        quantity: item.quantityBoxes + item.quantityItems,
        quantityBoxes: item.quantityBoxes,
        quantityItems: item.quantityItems,
        lineTotalCents: item.linePriceCents,
        name: product.name,
        partNumber: product.partNumber,
        note: item.note ?? null,
        round: nextRound,
      };
    });

    await db.batch(
      asBatch([
        // One statement per line: a multi-row insert passes D1's 100-parameter cap at 7 lines.
        ...itemValues.map((item) => db.insert(orderItems).values(item)),
        db.insert(orderEvents).values({
          id: crypto.randomUUID(),
          orderId,
          fromStatus: order.status,
          toStatus: order.status,
          userId: user.id,
          note: `Round ${nextRound} added (${input.items.length} item(s))`,
        }),
      ])
    );

    // -- Recompute the stored total from the new item set --
    await recalculateOrderTotal(db, orderId);

    const detail = await getOrderDetail(db, orderId);
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
