// ============================================================
// SECTION: Order detail (route)
// ------------------------------------------------------------
// The id comes from the URL; the screen polls the detail API so
// status changes from other devices (prep, packing) appear live.
// The session user is resolved server-side once and passed down.
// ============================================================

import { auth } from "@/lib/auth";
import { OrderDetailScreen } from "@/components/orders/order-detail-screen";

export const metadata = { title: "Order" };

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  return <OrderDetailScreen orderId={id} user={session?.user ?? null} />;
}
