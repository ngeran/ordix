// ============================================================
// SECTION: Warehouse wall display (route)
// ------------------------------------------------------------
// Designed for dedicated tablets (iPad / Android) mounted around
// the warehouse: a read-only, glance-from-a-distance board of
// QUEUE → IN PROGRESS → PREPARED → SHIPPED. The app chrome is
// hidden (see AppShell) and the board polls every 5 s, so any
// number of tablets can mirror it simultaneously. The tablet
// signs in once — the session cookie keeps it authorized.
// ============================================================

import { StatusBoard } from "@/components/display/status-board";

export const metadata = { title: "Display" };

export default function DisplayPage() {
  return <StatusBoard />;
}
