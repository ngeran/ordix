// ============================================================
// SECTION: Imports
// ============================================================

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { alias } from "drizzle-orm/sqlite-core";
import {
  customers,
  orderCounters,
  orderEvents,
  orderItems,
  orders,
  products,
  users,
  type Order,
  type OrderItem,
  type OrderStatus,
} from "@/db/schema";
import {
  ACTIVE_ORDER_STATUSES,
  formatOrderNumber,
} from "@/lib/order-status";
import { getBusinessDate } from "@/lib/utils";
import type { OrderDetail, OrderSummary } from "@/types";

// ============================================================
// SECTION: Order service (server-side)
// ------------------------------------------------------------
// Shared query/mutation building blocks used by the order API
// routes, kept here so route files stay thin and the rules
// (number allocation, total recomputation) live in one place.
// Build-to-order: products are unpriced identifiers — the PRICE
// of each line is quoted manually and stored as lineTotalCents.
// ============================================================

type Database = ReturnType<typeof drizzle>;

// ============================================================
// SECTION: Daily order-number allocation
// ------------------------------------------------------------
// Single atomic UPSERT … RETURNING against `order_counters`:
// first order of the day inserts lastNumber=1, later ones
// increment. SQLite (D1) serializes writes, so two concurrent
// placements can never observe the same number.
// ============================================================

export async function allocateDailyNumber(
  db: Database,
  businessDate: string
): Promise<{ businessDate: string; dailyNumber: number; orderNumber: string }> {
  const [row] = await db
    .insert(orderCounters)
    .values({ businessDate, lastNumber: 1 })
    .onConflictDoUpdate({
      target: orderCounters.businessDate,
      set: { lastNumber: sql`${orderCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: orderCounters.lastNumber });

  const dailyNumber = row.lastNumber;
  return {
    businessDate,
    dailyNumber,
    orderNumber: formatOrderNumber(businessDate, dailyNumber),
  };
}

// ============================================================
// SECTION: Total recomputation
// ------------------------------------------------------------
// The stored `totalCents` is always the sum of *active* (non-
// voided) line totals — recomputed after placement, appends,
// voids and production edits so a stale client can never persist
// a wrong total.
// ============================================================

export async function recalculateOrderTotal(
  db: Database,
  orderId: string
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${orderItems.lineTotalCents}), 0)`,
    })
    .from(orderItems)
    .where(
      and(eq(orderItems.orderId, orderId), eq(orderItems.status, "active"))
    );

  const totalCents = Number(row?.total ?? 0);
  await db
    .update(orders)
    .set({ totalCents, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
  return totalCents;
}

// ============================================================
// SECTION: Read models — list & detail
// ============================================================

/** Load an order row or null. */
export async function getOrder(db: Database, orderId: string): Promise<Order | null> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return order ?? null;
}

/**
 * Escapes LIKE wildcards in user input so a search for "100%"
 * doesn't turn into a full-table match.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export interface ListOrdersOptions {
  scope: "active" | "history" | "all";
  status?: OrderStatus;
  businessDate?: string;
  /** Inclusive lower bound on placedAt (YYYY-MM-DD or full ISO). */
  from?: string;
  /** Inclusive upper bound on placedAt. */
  to?: string;
  /** Matches order number, customer name or part number. */
  search?: string;
  /** Attach the active items (one extra query — no N+1). */
  includeItems?: boolean;
  limit?: number;
}

/**
 * Board/history list: orders with item aggregates, the creator's
 * name and the customer name (customer record preferred, legacy
 * free-text as fallback). Production aggregates
 * (produced/in-production counts) drive the progress bars.
 */
export async function listOrders(
  db: Database,
  options: ListOrdersOptions
): Promise<OrderSummary[]> {
  const { scope, status, businessDate, from, to, search, limit = 200 } =
    options;

  // -- Base filter by scope --
  const activeStatuses = Array.from(ACTIVE_ORDER_STATUSES);
  let scopeClause;
  if (scope === "active") {
    scopeClause = inArray(orders.status, activeStatuses);
  } else if (scope === "history") {
    scopeClause = sql`${orders.status} not in ${activeStatuses}`;
  }

  // -- Optional refinements --
  const statusClause = status ? eq(orders.status, status) : undefined;
  const dateClause = businessDate
    ? eq(orders.businessDate, businessDate)
    : undefined;
  // Date range on placedAt: `to` is inclusive, so it runs to the
  // end of that day (or of the ISO timestamp provided).
  const fromClause = from
    ? sql`${orders.placedAt} >= ${unixEpoch(from)}`
    : undefined;
  const toClause = to
    ? sql`${orders.placedAt} <= ${unixEpoch(`${to.slice(0, 10)}T23:59:59Z`)}`
    : undefined;

  // -- Search across order number, customer name AND part numbers
  // (escaped LIKE; part numbers via EXISTS on order_items) --
  const q = search?.trim().toLowerCase();
  const searchClause = q
    ? or(
        sql`lower(${orders.orderNumber}) like ${`%${escapeLike(q)}%`} escape '\\'`,
        sql`lower(coalesce(${customers.name}, ${orders.customerName})) like ${`%${escapeLike(q)}%`} escape '\\'`,
        sql`exists (select 1 from ${orderItems} oi join ${products} p on p.id = oi.product_id where oi.order_id = ${orders.id} and (lower(oi.part_number) like ${`%${escapeLike(q)}%`} escape '\\' or lower(p.name) like ${`%${escapeLike(q)}%`} escape '\\'))`
      )
    : undefined;

  const closer = alias(users, "closer");
  const rows = await db
    .select({
      order: orders,
      createdByName: users.name,
      closedByName: closer.name,
      customerRecordName: customers.name,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.createdById))
    .leftJoin(closer, eq(closer.id, orders.closedById))
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(scopeClause, statusClause, dateClause, fromClause, toClause, searchClause)
    )
    .orderBy(scope === "active" ? orders.placedAt : desc(orders.placedAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // -- Aggregate items per order in one grouped query.
  // `quantity` is the piece-equivalent total on every row (legacy
  // rows were placed with it; new rows store the expanded count),
  // so a plain sum covers both eras. --
  const orderIds = rows.map((row) => row.order.id);
  const aggregates = await db
    .select({
      orderId: orderItems.orderId,
      itemCount: sql<number>`count(*)`,
      totalUnits: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
      producedCount: sql<number>`coalesce(sum(case when ${orderItems.productionStatus} = 'completed' then 1 else 0 end), 0)`,
      inProductionCount: sql<number>`coalesce(sum(case when ${orderItems.productionStatus} = 'in_production' then 1 else 0 end), 0)`,
    })
    .from(orderItems)
    .where(
      and(
        inArray(orderItems.orderId, orderIds),
        eq(orderItems.status, "active")
      )
    )
    .groupBy(orderItems.orderId);

  const aggByOrder = new Map(aggregates.map((agg) => [agg.orderId, agg]));

  const result: OrderSummary[] = rows.map((row) => ({
    ...row.order,
    customerName: row.customerRecordName ?? row.order.customerName ?? null,
    createdByName: row.createdByName ?? null,
    closedByName: row.closedByName ?? null,
    itemCount: Number(aggByOrder.get(row.order.id)?.itemCount ?? 0),
    totalUnits: Number(aggByOrder.get(row.order.id)?.totalUnits ?? 0),
    producedCount: Number(aggByOrder.get(row.order.id)?.producedCount ?? 0),
    inProductionCount: Number(
      aggByOrder.get(row.order.id)?.inProductionCount ?? 0
    ),
  }));

  // -- Active items attached for screens that render them
  // (production board, cashier) — a single extra query, no N+1. --
  if (options.includeItems && orderIds.length > 0) {
    const items = await db
      .select()
      .from(orderItems)
      .where(
        and(
          inArray(orderItems.orderId, orderIds),
          eq(orderItems.status, "active")
        )
      );
    const itemsByOrder = new Map<string, OrderItem[]>();
    for (const item of items) {
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push(item);
      itemsByOrder.set(item.orderId, list);
    }
    for (const entry of result) {
      entry.items = itemsByOrder.get(entry.id) ?? [];
    }
  }

  return result;
}

/** "YYYY-MM-DD[THH:MM:SSZ]" → unix epoch seconds for the integer columns. */
function unixEpoch(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

/** Full detail for the order page: items + timeline with actor names. */
export async function getOrderDetail(
  db: Database,
  orderId: string
): Promise<OrderDetail | null> {
  const [orderRow] = await db
    .select({
      order: orders,
      createdByName: users.name,
      customerRecordName: customers.name,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.createdById))
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!orderRow) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(orderItems.round, orderItems.createdAt);

  // -- Timeline with actor display names (two queries + join in JS;
  //    event counts are small so this stays simple and portable) --
  const rawEvents = await db
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(orderEvents.createdAt);

  // Everyone who touched the order: timeline actors, the closer,
  // and who started / finished each line in production.
  const actorIds = [
    ...new Set(
      [
        ...rawEvents.map((event) => event.userId),
        orderRow.order.closedById,
        ...items.flatMap((item) => [item.sentToProductionById, item.productionCompletedById]),
      ].filter(Boolean)
    ),
  ] as string[];
  const actors = actorIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, actorIds))
    : [];
  const nameById = new Map(actors.map((actor) => [actor.id, actor.name]));

  // -- Customer record (address/phone shown on the detail page) --
  let customer = null;
  if (orderRow.order.customerId) {
    const [record] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, orderRow.order.customerId))
      .limit(1);
    customer = record ?? null;
  }

  return {
    ...orderRow.order,
    customerName: orderRow.customerRecordName ?? orderRow.order.customerName ?? null,
    createdByName: orderRow.createdByName ?? null,
    closedByName: orderRow.order.closedById
      ? nameById.get(orderRow.order.closedById) ?? null
      : null,
    userNames: Object.fromEntries(nameById),
    items,
    events: rawEvents.map((event) => ({
      ...event,
      userId: undefined,
      userName: event.userId ? nameById.get(event.userId) ?? null : null,
    })),
    customer: customer
      ? {
          id: customer.id,
          name: customer.name,
          address: customer.address,
          phone: customer.phone,
          email: customer.email,
          comments: customer.comments,
        }
      : null,
  };
}

/** Load active items of an order (cancel restock, packing math). */
export async function getActiveItems(
  db: Database,
  orderId: string
): Promise<OrderItem[]> {
  return db
    .select()
    .from(orderItems)
    .where(
      and(eq(orderItems.orderId, orderId), eq(orderItems.status, "active"))
    );
}
