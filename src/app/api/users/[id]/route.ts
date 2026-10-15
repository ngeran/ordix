// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { hashSync } from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/api-auth";
import { parseJsonBody, userUpdateSchema } from "@/lib/validation";
import { countOtherActiveAdmins, publicUserColumns } from "@/lib/user-service";

// ============================================================
// SECTION: PATCH /api/users/[id] — edit / deactivate / reset password
// ------------------------------------------------------------
// No DELETE on purpose: orders reference their users forever
// ("taken by", "closed by"), so leaving staff are deactivated.
//
// Safety rules (so nobody locks the business out):
//   - you can't deactivate yourself or remove your own admin role
//   - the last active admin can't be demoted or deactivated
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
    const input = await parseJsonBody(request, userUpdateSchema);

    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Owner accounts: only an owner may touch them (so an admin can't reset
    // the owner's password), and role/active status are CLI-only.
    if (existing.role === "owner") {
      if (guard.user.role !== "owner") {
        return NextResponse.json({ error: "Only the owner can edit the owner account" }, { status: 403 });
      }
      if (input.role !== undefined || input.isActive === false) {
        return NextResponse.json(
          { error: "The owner's role and status are managed from the command line" },
          { status: 409 }
        );
      }
    }

    const losesAdmin =
      existing.role === "admin" &&
      existing.isActive &&
      ((input.role !== undefined && input.role !== "admin") || input.isActive === false);

    if (losesAdmin && id === guard.user.id) {
      return NextResponse.json(
        { error: "You can't deactivate yourself or remove your own admin role" },
        { status: 409 }
      );
    }
    if (losesAdmin && (await countOtherActiveAdmins(db, id)) === 0) {
      return NextResponse.json(
        { error: "There must always be at least one active admin" },
        { status: 409 }
      );
    }
    if (input.isActive === false && id === guard.user.id) {
      return NextResponse.json({ error: "You can't deactivate yourself" }, { status: 409 });
    }

    const { password, ...fields } = input;
    const [updated] = await db
      .update(users)
      .set({ ...fields, ...(password ? { passwordHash: hashSync(password, 10) } : {}) })
      .where(eq(users.id, id))
      .returning(publicUserColumns);

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
