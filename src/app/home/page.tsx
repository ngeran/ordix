// ============================================================
// SECTION: Home launcher (route)
// ------------------------------------------------------------
// The hub for non-technical staff: instead of a sidebar full of
// words, this screen shows a handful of GIANT picture tiles —
// one obvious next step at a time. Server component resolves
// the session so admin-only tiles can be filtered.
// ============================================================

import { auth } from "@/lib/auth";
import { HomeScreen } from "@/components/home/home-screen";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const session = await auth();
  return <HomeScreen isAdmin={session?.user?.role === "admin"} />;
}
