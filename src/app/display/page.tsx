// ============================================================
// SECTION: Warehouse wall display (route)
// ------------------------------------------------------------
// Designed for dedicated tablets (iPad / Android) mounted around
// the warehouse: a read-only, glance-from-a-distance board of
// NEW → IN PRODUCTION → READY FOR PICKUP → CLOSED TODAY. The app chrome is
// hidden (see AppShell) and the board polls every 5 s, so any
// number of tablets can mirror it simultaneously. The tablet
// signs in once — the session cookie keeps it authorized.
// ============================================================

import { StatusBoard } from "@/components/display/status-board";
import { DisplayDisabled } from "@/components/display/display-disabled";
import { getAppSettings } from "@/lib/settings-server";

export const metadata = { title: "Display" };

// Settings → Features → "Wall display board" can switch it off.
export default async function DisplayPage() {
  const settings = await getAppSettings();
  return settings.features.displayBoard ? <StatusBoard /> : <DisplayDisabled />;
}
