import { NextResponse } from "next/server";
import { ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  customers,
  orderCounters,
  orderEvents,
  orderItems,
  orders,
  products,
  users,
} from "@/db/schema";
import { errorResponse, requireOwner } from "@/lib/api-auth";
import { checkPassword } from "@/lib/user-service";
import { parseJsonBody, systemResetSchema } from "@/lib/validation";

// POST /api/system/reset — owner only, re-confirmed with the owner's password.
//   scope "orders": every order (+ items, events, daily counters)
//   scope "all":    the above + products, categories, customers, non-owner users
// Settings, custom field definitions and owner accounts always survive.
// One D1 batch = all-or-nothing.
export async function POST(request: Request) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  try {
    const input = await parseJsonBody(request, systemResetSchema);
    const db = await getDb();

    if (!(await checkPassword(db, guard.user.id, input.password))) {
      return NextResponse.json({ error: "Wrong password" }, { status: 403 });
    }

    const clearOrders = [
      db.delete(orderEvents),
      db.delete(orderItems),
      db.delete(orders),
      db.delete(orderCounters),
    ] as const;

    if (input.scope === "orders") {
      await db.batch(clearOrders);
    } else {
      await db.batch([
        ...clearOrders,
        db.delete(products),
        db.delete(categories),
        db.delete(customers),
        db.delete(users).where(ne(users.role, "owner")),
      ]);
    }

    console.warn(`[system] database reset (scope=${input.scope}) by ${guard.user.username}`);
    return NextResponse.json({ ok: true, scope: input.scope });
  } catch (error) {
    return errorResponse(error);
  }
}
