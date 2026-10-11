// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { asBatch, getDb } from "@/db";
import { categories } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/api-auth";
import { categoryReorderSchema, parseJsonBody } from "@/lib/validation";

// ============================================================
// SECTION: POST /api/categories/reorder — persist new ordering
// ------------------------------------------------------------
// Body: { categoryIds: [id, id, …] } — the array position IS the
// new sort order. Written as one D1 batch so all rows move
// together (no half-applied drag).
// ============================================================

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const { categoryIds } = await parseJsonBody(request, categoryReorderSchema);

    // One statement per row, all applied atomically.
    const updates = categoryIds.map((categoryId, index) =>
      db
        .update(categories)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(eq(categories.id, categoryId))
    );
    await db.batch(asBatch(updates));

    return NextResponse.json({ reordered: categoryIds.length });
  } catch (error) {
    return errorResponse(error);
  }
}
