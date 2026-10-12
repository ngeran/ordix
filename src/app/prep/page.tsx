// ============================================================
// SECTION: /prep — legacy redirect
// ------------------------------------------------------------
// The preparation board became the production board (Phase 2).
// Kept as a redirect so bookmarks and installed PWAs land right.
// ============================================================

import { redirect } from "next/navigation";

export default function PrepPage() {
  redirect("/production");
}
