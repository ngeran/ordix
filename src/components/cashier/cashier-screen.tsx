"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { Banknote, CheckCircle2 } from "lucide-react";
import type { OrderSummary } from "@/types";
import { usePolling } from "@/lib/use-polling";
import { useLocale, useT } from "@/lib/i18n";
import { formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/orders/status-badge";
import { PaymentDialog } from "@/components/cashier/payment-dialog";

// ============================================================
// SECTION: Cashier screen
// ------------------------------------------------------------
// The order taker and the cashier are the same person; this
// screen is simply the "who owes me money" checklist:
//   1. "Waiting for payment" — production_complete orders, each
//      with ONE giant button opening the payment dialog
//   2. "Completed today" — closed orders for the end-of-day tally
// The same close action is also available on each order's detail
// page (shared PaymentDialog component).
// ============================================================

export function CashierScreen() {
  const t = useT();
  const locale = useLocale();

  const { data: activeOrders } = usePolling<OrderSummary[]>(
    "/api/orders?scope=active",
    { intervalMs: 5_000 }
  );
  const { data: historyOrders } = usePolling<OrderSummary[]>(
    "/api/orders?scope=history",
    { intervalMs: 15_000 }
  );

  const waiting = (activeOrders ?? []).filter(
    (order) => order.status === "production_complete"
  );
  const paidToday = (historyOrders ?? []).filter(
    (order) => order.status === "completed" && order.paidAt !== null
  );

  const [closingOrder, setClosingOrder] = useState<OrderSummary | null>(null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <h1 className="mb-4 text-2xl font-bold">{t("cashier.title")}</h1>

      {/* ============================================================
          SECTION: Waiting for payment
          ============================================================ */}
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-on-surface-muted">
        {t("cashier.ready")} ({waiting.length})
      </h2>
      {activeOrders === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : waiting.length === 0 ? (
        <EmptyState icon={Banknote} title={t("cashier.empty")} />
      ) : (
        <ul className="mb-8 space-y-3">
          {waiting.map((order) => (
            <li key={order.id}>
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/orders/${order.id}`}
                    className="font-mono font-bold hover:text-primary"
                  >
                    {order.orderNumber}
                  </Link>
                  <p className="truncate text-sm text-on-surface-muted">
                    {order.customerName ?? "—"}
                  </p>
                </div>
                <span className="text-xl font-bold">
                  {formatMoney(order.totalCents, locale)}
                </span>
                <Button size="lg" onClick={() => setClosingOrder(order)}>
                  <Banknote className="h-5 w-5" />
                  {t("cashier.collect")}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* ============================================================
          SECTION: Completed today
          ============================================================ */}
      {paidToday.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-on-surface-muted">
            {t("cashier.paidToday")} ({paidToday.length})
          </h2>
          <ul className="space-y-2">
            {paidToday.map((order) => (
              <li key={order.id}>
                <Card className="flex items-center gap-3 p-3 text-sm">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
                  <span className="font-mono font-semibold">{order.orderNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-on-surface-muted">
                    {order.customerName ?? "—"}
                  </span>
                  <span className="font-bold">
                    {formatMoney(order.totalCents, locale)}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* -- Payment dialog (shared with the order detail page) -- */}
      <PaymentDialog order={closingOrder} onClose={() => setClosingOrder(null)} />
    </div>
  );
}
