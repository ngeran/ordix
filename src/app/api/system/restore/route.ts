import { NextResponse } from "next/server";
import { getD1, getDb } from "@/db";
import { errorResponse, requireOwner } from "@/lib/api-auth";
import { BackupError, restoreDatabase, restoreRequestSchema } from "@/lib/backup";
import { checkPassword } from "@/lib/user-service";
import { parseJsonBody } from "@/lib/validation";

// POST /api/system/restore — owner only, password re-confirmed. Replaces ALL
// data with the backup; afterwards sign-ins are the ones stored in the file.
export async function POST(request: Request) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  try {
    const input = await parseJsonBody(request, restoreRequestSchema);
    if (!(await checkPassword(await getDb(), guard.user.id, input.password))) {
      return NextResponse.json({ error: "Wrong password" }, { status: 403 });
    }

    const counts = await restoreDatabase(await getD1(), input.backup);
    console.warn(`[system] database restored from ${input.backup.exportedAt} by ${guard.user.username}`);
    return NextResponse.json({ ok: true, counts });
  } catch (error) {
    if (error instanceof BackupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return errorResponse(error);
  }
}
