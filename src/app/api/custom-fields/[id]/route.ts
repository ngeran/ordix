import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customFields } from "@/db/schema";
import { errorResponse, requireOwner } from "@/lib/api-auth";
import { customFieldUpdateSchema } from "@/lib/custom-fields";
import { parseJsonBody } from "@/lib/validation";

// PATCH /api/custom-fields/:id — owner only. No DELETE: "removing" a field
// hides it (isActive=false) and keeps its stored values.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  try {
    const input = await parseJsonBody(request, customFieldUpdateSchema);
    const db = await getDb();
    const [existing] = await db.select().from(customFields).where(eq(customFields.id, id)).limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 });
    }
    if (existing.type === "select" && input.options !== undefined && (input.options?.length ?? 0) === 0) {
      return NextResponse.json({ error: "A list field needs at least one option" }, { status: 400 });
    }

    const [updated] = await db
      .update(customFields)
      .set({ ...input, ...(existing.type !== "select" ? { options: null } : {}) })
      .where(eq(customFields.id, id))
      .returning();
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
