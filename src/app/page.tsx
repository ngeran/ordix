// ============================================================
// SECTION: Root redirect
// ------------------------------------------------------------
// The middleware already sends anonymous visitors to /login, so
// anyone landing here is signed in — send them to the main
// order screen.
// ============================================================

import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/order");
}
