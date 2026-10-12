// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { and, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, products } from "@/db/schema";
import { errorResponse, requireAdmin, requireUser } from "@/lib/api-auth";
import { parseJsonBody, productCreateSchema } from "@/lib/validation";
import type { ProductWithCategory } from "@/types";

// ============================================================
// SECTION: GET /api/products — catalog for POS grid & admin table
// ------------------------------------------------------------
// Query params:
//   q          — case-insensitive search on name, part number, barcode
//   categoryId — narrow to one category
//   active     — "true" → active only (POS), "false" → inactive
//                only, absent → everything (admin tables)
// ============================================================

export async function GET(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const db = await getDb();
  const { searchParams } = new URL(request.url);

  // -- Translate query params into Drizzle predicates --
  const q = searchParams.get("q")?.trim().toLowerCase();
  const categoryId = searchParams.get("categoryId");
  const active = searchParams.get("active");

  const predicates = [
    q
      ? or(
          sql`lower(${products.name}) like ${`%${q}%`}`,
          sql`lower(${products.partNumber}) like ${`%${q}%`}`,
          sql`lower(coalesce(${products.barcode}, '')) = ${q}`
        )
      : undefined,
    categoryId ? eq(products.categoryId, categoryId) : undefined,
    active === "true"
      ? eq(products.isActive, true)
      : active === "false"
        ? eq(products.isActive, false)
        : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({ product: products, categoryName: categories.name })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(predicates.length ? and(...predicates) : undefined)
    .orderBy(categories.sortOrder, products.name);

  const result: ProductWithCategory[] = rows.map((row) => ({
    ...row.product,
    categoryName: row.categoryName ?? null,
  }));

  return NextResponse.json(result);
}

// ============================================================
// SECTION: POST /api/products — create (admin only)
// ============================================================

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const input = await parseJsonBody(request, productCreateSchema);

    const [created] = await db
      .insert(products)
      .values({ id: crypto.randomUUID(), ...input })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
