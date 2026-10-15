// ============================================================
// SECTION: Order sheet — print / save as PDF (route)
// ------------------------------------------------------------
// Rendered bare (no app chrome, see AppShell) so the page IS the
// document; the browser's print dialog does printing and PDF.
// ============================================================

import { OrderPrintSheet } from "@/components/orders/order-print-sheet";

export const metadata = { title: "Order sheet" };

export default async function OrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderPrintSheet orderId={id} />;
}
