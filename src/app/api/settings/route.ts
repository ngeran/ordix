// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { errorResponse, requireAdmin, requireUser } from "@/lib/api-auth";
import { parseJsonBody, settingsSchema } from "@/lib/validation";
import { getAppSettings, SETTINGS_KEY } from "@/lib/settings-server";

// ============================================================
// SECTION: GET /api/settings — current settings (any user)
// PUT /api/settings — replace the whole document (admin)
// ------------------------------------------------------------
// The layout already renders settings into every page; GET is
// for the Settings screen. PUT validates the full document and
// upserts it; clients then router.refresh() to re-render.
// ============================================================

export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  return NextResponse.json(await getAppSettings());
}

export async function PUT(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const input = await parseJsonBody(request, settingsSchema);
    // Language rules are owner-only; admins save everything else.
    if (guard.user.role !== "owner") {
      input.language = (await getAppSettings()).language;
    }
    const value = JSON.stringify(input);
    const now = new Date();

    await db
      .insert(settings)
      .values({ key: SETTINGS_KEY, value, updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });

    return NextResponse.json(input);
  } catch (error) {
    return errorResponse(error);
  }
}
