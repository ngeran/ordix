import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { customFields } from "@/db/schema";
import { errorResponse, requireOwner, requireUser } from "@/lib/api-auth";
import { customFieldCreateSchema } from "@/lib/custom-fields";
import { parseJsonBody } from "@/lib/validation";

// GET  /api/custom-fields — every definition (any user: forms render them)
// POST /api/custom-fields — owner only
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(customFields)
      .orderBy(asc(customFields.entity), asc(customFields.sortOrder), asc(customFields.labelEn));
    return NextResponse.json(rows);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  try {
    const input = await parseJsonBody(request, customFieldCreateSchema);
    const db = await getDb();
    const [created] = await db
      .insert(customFields)
      .values({
        id: crypto.randomUUID(),
        ...input,
        labelEl: input.labelEl ?? null,
        options: input.type === "select" ? (input.options ?? []) : null,
      })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
