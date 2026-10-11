// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, products } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/api-auth";
import { categoryUpdateSchema, parseJsonBody } from "@/lib/validation";

// ============================================================
// SECTION: PATCH /api/categories/[id] — update (admin only)
// ============================================================

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  try {
    const db = await getDb();
    const input = await parseJsonBody(request, categoryUpdateSchema);

    const [updated] = await db
      .update(categories)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

// ============================================================
// SECTION: DELETE /api/categories/[id] — delete (admin only)
// ------------------------------------------------------------
// Refused while products still point at the category — the UI
// tells the admin to move or remove those products first.
// ============================================================

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  try {
    const db = await getDb();

    const [ref] = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(eq(products.categoryId, id));

    if (Number(ref?.count ?? 0) > 0) {
      return NextResponse.json(
        { error: "Category still has products — move or delete them first" },
        { status: 409 }
      );
    }

    const deleted = await db
      .delete(categories)
      .where(eq(categories.id, id))
      .returning({ id: categories.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
