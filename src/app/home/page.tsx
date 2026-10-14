// ============================================================
// SECTION: Home launcher (route)
// ------------------------------------------------------------
// The hub for non-technical staff: instead of a sidebar full of
// words, this screen shows the three workflow steps as GIANT
// picture tiles — one obvious next step at a time.
// ============================================================

import { HomeScreen } from "@/components/home/home-screen";

export const metadata = { title: "Home" };

export default function HomePage() {
  return <HomeScreen />;
}
