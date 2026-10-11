// ============================================================
// SECTION: POS order screen (route)
// ------------------------------------------------------------
// Thin server wrapper — the whole experience is client-side
// (catalog polling + Zustand ticket), which is what keeps it
// fast and offline-tolerant.
// ============================================================

import { PosScreen } from "@/components/pos/pos-screen";

export const metadata = { title: "Order" };

export default function OrderPage() {
  return <PosScreen />;
}
