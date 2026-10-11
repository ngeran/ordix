// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { errorResponse, requireAdmin, requireUser } from "@/lib/api-auth";
import { parseJsonBody, settingsUpdateSchema } from "@/lib/validation";
import { getSettings, setSetting } from "@/lib/settings";

// ============================================================
// SECTION: GET /api/settings — behavior flags
// ------------------------------------------------------------
// Readable by any signed-in user: the POS needs `allowOversell`
// to mirror the server's guard client-side.
// ============================================================

export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const db = await getDb();
  const settings = await getSettings(db);
  return NextResponse.json(settings);
}

// ============================================================
// SECTION: PATCH /api/settings — update flags (admin only)
// ============================================================

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const input = await parseJsonBody(request, settingsUpdateSchema);

    if (input.allowOversell !== undefined) {
      await setSetting(db, "allow_oversell", input.allowOversell);
    }
    if (input.restockOnVoid !== undefined) {
      await setSetting(db, "restock_on_void", input.restockOnVoid);
    }

    const settings = await getSettings(db);
    return NextResponse.json(settings);
  } catch (error) {
    return errorResponse(error);
  }
}
