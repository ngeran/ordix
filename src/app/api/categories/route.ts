// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, products } from "@/db/schema";
import { customValuesForCreate } from "@/lib/custom-fields-server";
import { errorResponse, requireAdmin, requireUser } from "@/lib/api-auth";
import { categoryCreateSchema, parseJsonBody } from "@/lib/validation";

// ============================================================
// SECTION: GET /api/categories — list with product counts
// ------------------------------------------------------------
// Includes inactive categories (admin manages them) but the UI
// filters by isActive where appropriate (POS tabs).
// ============================================================

export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const db = await getDb();
  const rows = await db
    .select({
      category: categories,
      productCount: sql<number>`count(${products.id})`,
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(categories.sortOrder, categories.name);

  return NextResponse.json(
    rows.map((row) => ({
      ...row.category,
      productCount: Number(row.productCount),
    }))
  );
}

// ============================================================
// SECTION: POST /api/categories — create (admin only)
// ============================================================

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const input = await parseJsonBody(request, categoryCreateSchema);

    const { extra, ...fields } = input;
    const customValues = await customValuesForCreate(db, "categories", extra);
    const [created] = await db
      .insert(categories)
      .values({ id: crypto.randomUUID(), ...fields, extra: customValues })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
