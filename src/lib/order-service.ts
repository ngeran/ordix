// ============================================================
// SECTION: Imports
// ============================================================

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import {
  orderCounters,
  orderEvents,
  orderItems,
  orders,
  users,
  type Order,
  type OrderItem,
  type OrderStatus,
} from "@/db/schema";
import { formatOrderNumber } from "@/lib/order-status";
import { getBusinessDate } from "@/lib/utils";
import { ACTIVE_ORDER_STATUSES } from "@/lib/order-status";
import type { OrderDetail, OrderSummary } from "@/types";

// ============================================================
// SECTION: Order service (server-side)
// ------------------------------------------------------------
// Shared query/mutation building blocks used by the order API
// routes, kept here so route files stay thin and the rules
// (number allocation, total recomputation) live in one place.
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
// voided) items — recomputed after placement, appends and voids
// so a stale client can never persist a wrong total.
// ============================================================

export async function recalculateOrderTotal(
  db: Database,
  orderId: string
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${orderItems.unitPriceCents} * ${orderItems.quantity}), 0)`,
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
 * Board/history list: orders with item aggregates and the
 * creator's name. `scope` splits the live board (active) from
 * history without duplicating filter logic in clients.
 */
export async function listOrders(
  db: Database,
  options: {
    scope: "active" | "history" | "all";
    status?: OrderStatus;
    businessDate?: string;
    limit?: number;
  }
): Promise<OrderSummary[]> {
  const { scope, status, businessDate, limit = 200 } = options;

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
  const dateClause = businessDate ? eq(orders.businessDate, businessDate) : undefined;

  const rows = await db
    .select({
      order: orders,
      createdByName: users.name,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.createdById))
    .where(and(scopeClause, statusClause, dateClause))
    .orderBy(scope === "active" ? orders.placedAt : desc(orders.placedAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // -- Aggregate items per order in one grouped query --
  const orderIds = rows.map((row) => row.order.id);
  const aggregates = await db
    .select({
      orderId: orderItems.orderId,
      itemCount: sql<number>`count(*)`,
      totalUnits: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
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

  return rows.map((row) => ({
    ...row.order,
    createdByName: row.createdByName ?? null,
    itemCount: Number(aggByOrder.get(row.order.id)?.itemCount ?? 0),
    totalUnits: Number(aggByOrder.get(row.order.id)?.totalUnits ?? 0),
  }));
}

/** Full detail for the order page: items + timeline with actor names. */
export async function getOrderDetail(
  db: Database,
  orderId: string
): Promise<OrderDetail | null> {
  const [orderRow] = await db
    .select({ order: orders, createdByName: users.name })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.createdById))
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

  const actorIds = [
    ...new Set(rawEvents.map((event) => event.userId).filter(Boolean)),
  ] as string[];
  const actors = actorIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, actorIds))
    : [];
  const nameById = new Map(actors.map((actor) => [actor.id, actor.name]));

  return {
    ...orderRow.order,
    createdByName: orderRow.createdByName ?? null,
    items,
    events: rawEvents.map((event) => ({
      ...event,
      userId: undefined,
      userName: event.userId ? nameById.get(event.userId) ?? null : null,
    })),
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
