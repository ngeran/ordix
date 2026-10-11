// ============================================================
// SECTION: GET /api/health — liveness + database check
// ------------------------------------------------------------
// Public (no session) so load balancers, uptime checks and the
// LAN tablet's "connection" indicator can call it without
// credentials. A DB failure is reported but never crashes the
// endpoint — the process being up is itself signal.
// ============================================================

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let databaseStatus = "ok";
  try {
    const db = await getDb();
    await db.run(sql`select 1`);
  } catch {
    databaseStatus = "unreachable";
  }

  return NextResponse.json({
    ok: true,
    app: "ordix",
    database: databaseStatus,
    time: new Date().toISOString(),
  });
}
