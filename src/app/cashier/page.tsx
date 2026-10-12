// ============================================================
// SECTION: Cashier (route)
// ------------------------------------------------------------
// The cashier (ταμίας) sees exactly one thing: orders whose
// production is complete, waiting for payment. Collect the
// money, tap the method, close → Ολοκληρώθηκε.
// ============================================================

import { CashierScreen } from "@/components/cashier/cashier-screen";

export const metadata = { title: "Cashier" };

export default function CashierPage() {
  return <CashierScreen />;
}
