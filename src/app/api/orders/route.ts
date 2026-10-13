// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, orderEvents, orderItems, orders, products } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import {
  orderListQuerySchema,
  parseJsonBody,
  parseSearchParams,
  placeOrderSchema,
} from "@/lib/validation";
import { allocateDailyNumber, getOrderDetail, listOrders } from "@/lib/order-service";
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

    const query = parseSearchParams(searchParams, orderListQuerySchema);

    const result = await listOrders(db, {
      scope: query.scope,
      status: query.status,
      businessDate: query.date,
      from: query.from,
      to: query.to,
      search: query.q,
      includeItems: query.include === "items",
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

// ============================================================
// SECTION: POST /api/orders — place a build-to-order order
// ------------------------------------------------------------
// Build-to-order: the order goes straight to production. No stock
// is touched (products are unpriced identifiers — the PRICE of
// each line is quoted manually by the order taker, who is also
// the cashier).
//
// Steps:
//   1. validate payload (Zod) + load the customer + products
//   2. atomically allocate the daily sequential order number
//   3. run ONE D1 batch (implicit transaction): order + snapshot
//      items + timeline event
//   4. return the full order detail
// All lines start productionStatus = "pending".
// ============================================================

export async function POST(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const user = guard.user;

  try {
    const db = await getDb();
    const input = await parseJsonBody(request, placeOrderSchema);

    // -- Customer: mandatory in the build-to-order flow --
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .limit(1);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 400 });
    }
    if (!customer.isActive) {
      return NextResponse.json(
        { error: `Customer is inactive: ${customer.name}` },
        { status: 400 }
      );
    }

    // -- Load products referenced by the ticket --
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const productRows = await db
      .select()
      .from(products)
      .where(inArray(products.id, productIds));
    const productById = new Map(productRows.map((row) => [row.id, row]));

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
    }

    // -- Daily sequential number (atomic upsert + returning) --
    const numberAllocation = await allocateDailyNumber(db, getBusinessDate());

    // -- Assemble the atomic batch --
    const orderId = crypto.randomUUID();
    const placedAt = new Date();

    // Item rows snapshot name + the quoted line price, so tickets
    // render (and totals survive) catalog edits forever.
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
        round: 1,
      };
    });

    await db.batch([
      db.insert(orders).values({
        id: orderId,
        businessDate: numberAllocation.businessDate,
        dailyNumber: numberAllocation.dailyNumber,
        orderNumber: numberAllocation.orderNumber,
        status: "placed",
        customerId: customer.id,
        customerName: customer.name,
        notes: input.notes ?? null,
        totalCents: itemValues.reduce(
          (sum, item) => sum + item.lineTotalCents,
          0
        ),
        createdById: user.id,
        placedAt,
      }),
      db.insert(orderItems).values(itemValues),
      db.insert(orderEvents).values({
        id: crypto.randomUUID(),
        orderId,
        fromStatus: null,
        toStatus: "placed",
        userId: user.id,
        note: `Customer: ${customer.name}`,
      }),
    ]);

    // -- Return the assembled detail for immediate navigation --
    const detail = await getOrderDetail(db, orderId);
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
