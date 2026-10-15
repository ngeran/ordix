import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { errorResponse, requireOwner } from "@/lib/api-auth";
import { exportDatabase } from "@/lib/backup";

// GET /api/system/backup — owner only. Includes password hashes (needed to
// restore sign-ins), so the file must be stored as carefully as a password.
export async function GET() {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  try {
    const backup = await exportDatabase(await getD1());
    console.warn(`[system] backup downloaded by ${guard.user.username}`);
    return NextResponse.json(backup, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
