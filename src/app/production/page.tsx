// ============================================================
// SECTION: Production board (route)
// ------------------------------------------------------------
// The production manager's (υπεύθυνος παραγωγής) screen: new
// orders arrive on the left, each item is sent to production
// with one tap and completed with a second tap. When every item
// of an order is produced, one big button hands it to the
// cashier.
// ============================================================

import { ProductionBoard } from "@/components/production/production-board";

export const metadata = { title: "Production" };

export default function ProductionPage() {
  return <ProductionBoard />;
}
