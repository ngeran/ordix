// ============================================================
// SECTION: Imports
// ============================================================

import { and, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { getDb } from "@/db";
import { customers, orderItems, orders, users } from "@/db/schema";
import type { OrderItem } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/api-auth";
import { parseSearchParams } from "@/lib/validation";
import { getBusinessDate } from "@/lib/utils";
import { businessName } from "@/lib/settings";
import { getAppSettings } from "@/lib/settings-server";
import {
  centsToAmount,
  ordersExportJson,
  ordersExportXml,
  type OrdersExport,
} from "@/lib/order-export";

// ============================================================
// SECTION: GET /api/export/orders — completed orders as a file (admin)
// ------------------------------------------------------------
// Query: from=YYYY-MM-DD, to=YYYY-MM-DD (inclusive), format=json|xml
//
// Range is on the COMPLETION day in APP_TIMEZONE (when the cashier
// closed the order), which is what accounting reconciles against.
// SQL pre-filters a ±1-day UTC window; the exact business-day test
// runs in JS so timezone/DST edges are always right.
// Responds with Content-Disposition: attachment + X-Order-Count.
// ============================================================

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD");

const exportQuerySchema = z
  .object({
    from: isoDay,
    to: isoDay,
    format: z.enum(["json", "xml"]).default("json"),
  })
  .refine((query) => query.from <= query.to, "“From” must be on or before “To”");

const DAY_SECONDS = 86_400;
/** D1 caps bound parameters per statement at 100. */
const ID_CHUNK = 90;

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const query = parseSearchParams(new URL(request.url).searchParams, exportQuerySchema);

    const doneAt = sql<number>`coalesce(${orders.completedAt}, ${orders.paidAt}, ${orders.updatedAt})`;
    const windowStart = Date.parse(`${query.from}T00:00:00Z`) / 1000 - DAY_SECONDS;
    const windowEnd = Date.parse(`${query.to}T23:59:59Z`) / 1000 + DAY_SECONDS;

    const closer = alias(users, "closer");
    const rows = await db
      .select({
        order: orders,
        customer: {
          name: customers.name,
          phone: customers.phone,
          email: customers.email,
          address: customers.address,
        },
        createdBy: users.name,
        closedBy: closer.name,
      })
      .from(orders)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(users, eq(users.id, orders.createdById))
      .leftJoin(closer, eq(closer.id, orders.closedById))
      .where(
        and(
          eq(orders.status, "completed"),
          sql`${doneAt} between ${windowStart} and ${windowEnd}`
        )
      )
      .orderBy(doneAt);

    const inRange = rows.filter((row) => {
      const at = row.order.completedAt ?? row.order.paidAt ?? row.order.updatedAt;
      const day = getBusinessDate(at);
      return day >= query.from && day <= query.to;
    });

    // -- Active lines, fetched in parameter-safe chunks --
    const itemsByOrder = new Map<string, OrderItem[]>();
    const ids = inRange.map((row) => row.order.id);
    for (let start = 0; start < ids.length; start += ID_CHUNK) {
      const items = await db
        .select()
        .from(orderItems)
        .where(
          and(
            inArray(orderItems.orderId, ids.slice(start, start + ID_CHUNK)),
            eq(orderItems.status, "active")
          )
        )
        .orderBy(orderItems.round, orderItems.createdAt);
      for (const item of items) {
        const list = itemsByOrder.get(item.orderId) ?? [];
        list.push(item);
        itemsByOrder.set(item.orderId, list);
      }
    }

    const iso = (value: Date | null) => (value ? value.toISOString() : null);
    const data: OrdersExport = {
      business: businessName(await getAppSettings()),
      exportedAt: new Date().toISOString(),
      from: query.from,
      to: query.to,
      count: inRange.length,
      orders: inRange.map(({ order, customer, createdBy, closedBy }) => ({
        orderNumber: order.orderNumber,
        businessDate: order.businessDate,
        placedAt: order.placedAt.toISOString(),
        completedAt: iso(order.completedAt),
        paidAt: iso(order.paidAt),
        paymentMethod: order.paymentMethod,
        paymentNote: order.paymentNote,
        total: centsToAmount(order.totalCents),
        currency: "EUR",
        notes: order.notes,
        createdBy,
        closedBy,
        customer: {
          // Legacy orders carry a free-text name only.
          name: customer?.name ?? order.customerName,
          phone: customer?.phone ?? null,
          email: customer?.email ?? null,
          address: customer?.address ?? null,
        },
        items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
          partNumber: item.partNumber,
          name: item.name,
          boxes: item.quantityBoxes,
          // Legacy rows only recorded a plain piece count.
          pieces: item.quantityBoxes || item.quantityItems ? item.quantityItems : item.quantity,
          lineTotal: centsToAmount(item.lineTotalCents),
          note: item.note,
        })),
      })),
    };

    const body = query.format === "xml" ? ordersExportXml(data) : ordersExportJson(data);
    const filename = `ordix-completed-orders_${query.from}_${query.to}.${query.format}`;

    return new Response(body, {
      headers: {
        "Content-Type":
          query.format === "xml" ? "application/xml; charset=utf-8" : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Order-Count": String(data.count),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
