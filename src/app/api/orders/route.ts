// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  customers,
  orderEvents,
  orderItems,
  orders,
  products,
  stockMovements,
} from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import { orderScopeSchema, parseJsonBody, placeOrderSchema } from "@/lib/validation";
import {
  allocateDailyNumber,
  computeLinePricing,
  getOrderDetail,
  listOrders,
} from "@/lib/order-service";
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
// SECTION: POST /api/orders — place a build-to-order order
// ------------------------------------------------------------
// Steps, in order:
//   1. validate payload (Zod) + load customer and products
//   2. enforce shelf availability ONLY in sell-from-stock mode
//      (build-to-order manufactures the goods — no deduction)
//   3. atomically allocate the daily sequential order number
//   4. run ONE D1 batch (implicit transaction): order + snapshot
//      items (κουτιά/τεμάχια pricing) + [stock deductions] +
//      [movements] + timeline event
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
    const settings = await getSettings(db);

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

    // -- Validate products (and stock only in sell-from-stock mode) --
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
      if (!settings.buildToOrder && !settings.allowOversell) {
        const needed =
          item.quantityBoxes * Math.max(1, product.itemsPerBox ?? 1) +
          item.quantityItems;
        if (product.stockQuantity < needed) {
          return NextResponse.json(
            {
              error: `Not enough stock for ${product.name} (available: ${product.stockQuantity})`,
            },
            { status: 409 }
          );
        }
      }
    }

    // -- Daily sequential number (atomic upsert + returning) --
    const numberAllocation = await allocateDailyNumber(db, getBusinessDate());

    // -- Assemble the atomic batch --
    const orderId = crypto.randomUUID();
    const placedAt = new Date();

    // Item rows snapshot name + both unit prices + the computed line
    // total, so tickets render (and totals survive) catalog edits.
    const itemValues = input.items.map((item) => {
      const product = productById.get(item.productId)!;
      const pricing = computeLinePricing(
        product,
        item.quantityBoxes,
        item.quantityItems
      );
      return {
        id: crypto.randomUUID(),
        orderId,
        productId: item.productId,
        quantity: pricing.totalUnits,
        quantityBoxes: item.quantityBoxes,
        quantityItems: item.quantityItems,
        unitPriceCents: pricing.piecePriceCents,
        unitPriceBoxCents: pricing.boxPriceCents,
        unitPriceItemCents: pricing.piecePriceCents,
        lineTotalCents: pricing.lineTotalCents,
        name: product.name,
        partNumber: product.partNumber,
        note: item.note ?? null,
        round: 1,
      };
    });

    // Piece-equivalent stock is merged per product and only touched
    // in sell-from-stock mode; guarded against going negative.
    const quantityByProduct = new Map<string, number>();
    if (!settings.buildToOrder) {
      for (const item of input.items) {
        const product = productById.get(item.productId)!;
        const units =
          item.quantityBoxes * Math.max(1, product.itemsPerBox ?? 1) +
          item.quantityItems;
        quantityByProduct.set(
          item.productId,
          (quantityByProduct.get(item.productId) ?? 0) + units
        );
      }
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

    const movementValues = settings.buildToOrder
      ? []
      : [...quantityByProduct].map(([productId, qty]) => ({
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
      ...stockStatements,
      ...(movementValues.length
        ? [db.insert(stockMovements).values(movementValues)]
        : []),
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
