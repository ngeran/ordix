// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  orderEvents,
  orderItems,
  orders,
  products,
  stockMovements,
} from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import { orderScopeSchema, parseJsonBody, placeOrderSchema } from "@/lib/validation";
import { allocateDailyNumber, getOrderDetail, listOrders } from "@/lib/order-service";
import { getSettings } from "@/lib/settings";
import { getBusinessDate } from "@/lib/utils";

// ============================================================
// SECTION: GET /api/orders — board & history lists
// ------------------------------------------------------------
// Query params: scope=active|history|all (default all),
//               status=…, date=YYYY-MM-DD
// ============================================================

export async function GET(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const { searchParams } = new URL(request.url);

    const scope = orderScopeSchema.parse(searchParams.get("scope") ?? "all");
    const status = searchParams.get("status");
    const date = searchParams.get("date");

    const result = await listOrders(db, {
      scope,
      status: status ? (status as never) : undefined,
      businessDate: date ?? undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

// ============================================================
// SECTION: POST /api/orders — place an order (the critical path)
// ------------------------------------------------------------
// Steps, in order:
//   1. validate the payload (Zod) and load the referenced products
//   2. enforce availability unless overselling is allowed
//   3. atomically allocate the daily sequential order number
//   4. run ONE D1 batch (implicit transaction): order + items +
//      stock deductions + stock movements + timeline event
//   5. return the full order detail
//
// The batch makes placement all-or-nothing: a mid-flight failure
// leaves no orphan order, no half-deducted stock, no stray
// counter increment visible to users (the counter row may burn a
// number on a rare crash — acceptable and invisible, since
// numbers only need to be unique, not gapless).
// ============================================================

export async function POST(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const user = guard.user;

  try {
    const db = await getDb();
    const input = await parseJsonBody(request, placeOrderSchema);

    // -- 1. Load products referenced by the ticket --
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const productRows = await db
      .select()
      .from(products)
      .where(inArray(products.id, productIds));
    const productById = new Map(productRows.map((row) => [row.id, row]));

    // -- 2. Validate availability & state --
    const settings = await getSettings(db);
    for (const item of input.items) {
      const product = productById.get(item.productId);
      if (!product) {
        return NextResponse.json(
          { error: "Unknown product in order" },
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

    // -- 3. Daily sequential number (atomic upsert + returning) --
    const numberAllocation = await allocateDailyNumber(
      db,
      getBusinessDate()
    );

    // -- 4. Assemble the atomic batch --
    const orderId = crypto.randomUUID();
    const placedAt = new Date();

    // Item rows snapshot name/price so tickets survive catalog edits.
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
        round: 1,
      };
    });

    // Stock is decremented once per product (merged quantities) and
    // guarded: `stock_quantity >= qty` refuses to go negative even
    // if a concurrent order won the race after our pre-check.
    const quantityByProduct = new Map<string, number>();
    for (const item of input.items) {
      quantityByProduct.set(
        item.productId,
        (quantityByProduct.get(item.productId) ?? 0) + item.quantity
      );
    }

    const stockStatements = [...quantityByProduct].map(([productId, qty]) =>
      db
        .update(products)
        .set({ stockQuantity: sql`${products.stockQuantity} - ${qty}` })
        .where(
          and(
            eq(products.id, productId),
            sql`${products.stockQuantity} >= ${qty}`
          )
        )
    );

    const movementValues = [...quantityByProduct].map(([productId, qty]) => ({
      id: crypto.randomUUID(),
      productId,
      delta: -qty,
      reason: `order:${numberAllocation.orderNumber}`,
      orderId,
      userId: user.id,
    }));

    await db.batch([
      db.insert(orders).values({
        id: orderId,
        businessDate: numberAllocation.businessDate,
        dailyNumber: numberAllocation.dailyNumber,
        orderNumber: numberAllocation.orderNumber,
        status: "placed",
        customerName: input.customerName ?? null,
        notes: input.notes ?? null,
        totalCents: itemValues.reduce(
          (sum, item) => sum + item.unitPriceCents * item.quantity,
          0
        ),
        createdById: user.id,
        placedAt,
      }),
      db.insert(orderItems).values(itemValues),
      ...stockStatements,
      db.insert(stockMovements).values(movementValues),
      db.insert(orderEvents).values({
        id: crypto.randomUUID(),
        orderId,
        fromStatus: null,
        toStatus: "placed",
        userId: user.id,
        note: null,
      }),
    ]);

    // -- 5. Return the assembled detail for immediate navigation --
    const detail = await getOrderDetail(db, orderId);
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
