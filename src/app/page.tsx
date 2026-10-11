// ============================================================
// SECTION: Root redirect
// ------------------------------------------------------------
// The middleware already sends anonymous visitors to /login, so
// anyone landing here is signed in — send them to the Home
// launcher (the giant-tile hub for non-technical staff).
// ============================================================

import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/home");
}
