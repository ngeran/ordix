// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { and, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/api-auth";
import { customerCreateSchema, parseJsonBody } from "@/lib/validation";

// ============================================================
// SECTION: GET /api/customers — picker list & search
// ------------------------------------------------------------
// Query params:
//   q        — case-insensitive search on name + phone
//   active   — "true" → active only (default for the picker)
// Ordered by name; used by the order screen's customer step.
// ============================================================

export async function GET(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const { searchParams } = new URL(request.url);

    const q = searchParams.get("q")?.trim().toLowerCase();
    const active = searchParams.get("active");

    const predicates = [
      q
        ? or(
            sql`lower(${customers.name}) like ${`%${q}%`}`,
            sql`lower(coalesce(${customers.phone}, '')) like ${`%${q}%`}`
          )
        : undefined,
      active === "true" ? eq(customers.isActive, true) : undefined,
    ].filter(Boolean);

    const rows = await db
      .select()
      .from(customers)
      .where(predicates.length ? and(...predicates) : undefined)
      .orderBy(customers.name)
      .limit(200);

    return NextResponse.json(rows);
  } catch (error) {
    return errorResponse(error);
  }
}

// ============================================================
// SECTION: POST /api/customers — create (any signed-in user:
// order takers create new customers mid-order by design)
// ============================================================

export async function POST(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const input = await parseJsonBody(request, customerCreateSchema);

    const [created] = await db
      .insert(customers)
      .values({ id: crypto.randomUUID(), ...input })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
