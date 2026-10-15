// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { hashSync } from "bcryptjs";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/api-auth";
import { parseJsonBody, userCreateSchema } from "@/lib/validation";
import { placeholderEmail, publicUserColumns } from "@/lib/user-service";

// ============================================================
// SECTION: GET /api/users — the team list (admin)
// ============================================================

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const rows = await db.select(publicUserColumns).from(users).orderBy(users.name);
    return NextResponse.json(rows);
  } catch (error) {
    return errorResponse(error);
  }
}

// ============================================================
// SECTION: POST /api/users — create a user (admin)
// ------------------------------------------------------------
// Duplicate usernames surface as 409 via errorResponse's UNIQUE
// detection.
// ============================================================

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const input = await parseJsonBody(request, userCreateSchema);

    const [created] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: input.username,
        email: placeholderEmail(input.username),
        passwordHash: hashSync(input.password, 10),
        name: input.name,
        role: input.role,
        isActive: input.isActive,
      })
      .returning(publicUserColumns);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
