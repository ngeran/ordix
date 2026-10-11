// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireUser } from "@/lib/api-auth";
import { getOrderDetail } from "@/lib/order-service";

// ============================================================
// SECTION: GET /api/orders/[id] — full order detail
// ------------------------------------------------------------
// Returns the order with items (including voided ones — the
// ticket shows the full history) and the status timeline.
// ============================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const db = await getDb();
  const detail = await getOrderDetail(db, id);

  if (!detail) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
