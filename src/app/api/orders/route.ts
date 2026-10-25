// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb, queryInChunks } from "@/db";
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
//   2. replay-safe: an idempotency id from the client dedups
//      double-taps / retries / outbox replays to ONE order
//   3. atomically allocate the daily sequential order number
//   4. run ONE D1 batch (implicit transaction): order + snapshot
//      items + timeline event
//   5. return the full order detail
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
    const productRows = await queryInChunks(productIds, (ids) =>
      db.select().from(products).where(inArray(products.id, ids))
    );
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

    // -- Idempotency: the client mints the order id, so a double-tap,
    //    a retry or an offline-outbox replay carrying the SAME id
    //    returns the existing order instead of creating a duplicate.
    //    Checked BEFORE the daily-number allocation — replays waste
    //    no numbers. --
    const orderId = input.id ?? crypto.randomUUID();
    if (input.id) {
      const [existing] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.id, input.id))
        .limit(1);
      if (existing) {
        return NextResponse.json(await getOrderDetail(db, existing.id));
      }
    }

    // -- Daily sequential number (atomic upsert + returning) --
    const numberAllocation = await allocateDailyNumber(db, getBusinessDate());

    // -- Assemble the atomic batch --
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

    try {
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
        // One statement per line: a multi-row insert passes D1's 100-parameter cap at 7 lines.
        ...itemValues.map((item) => db.insert(orderItems).values(item)),
        db.insert(orderEvents).values({
          id: crypto.randomUUID(),
          orderId,
          fromStatus: null,
          toStatus: "placed",
          userId: user.id,
          note: `Customer: ${customer.name}`,
        }),
      ]);
    } catch (error) {
      // Lost a microsecond race against an identical request (same
      // id): this batch rolled back whole — return the winner's
      // order instead of a UNIQUE-constraint 500.
      const detail = await getOrderDetail(db, orderId).catch(() => null);
      if (detail) return NextResponse.json(detail);
      throw error;
    }

    // -- Return the assembled detail for immediate navigation --
    const detail = await getOrderDetail(db, orderId);
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
