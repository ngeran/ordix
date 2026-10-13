"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardCheck, Lock } from "lucide-react";
import type { OrderSummary } from "@/types";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/orders/status-badge";
import { OrderProgress } from "@/components/orders/order-progress";
import { CloseOrderDialog } from "@/components/cashier/close-order-dialog";

// ============================================================
// SECTION: Department closure screen
// ------------------------------------------------------------
// Three sections:
//   1. Returned — production_complete orders, each with a
//      "Close order" button (the department's final step)
//   2. Still in production — read-only, with progress bars
//   3. Closed today — the end-of-day tally
// ============================================================

export function CashierScreen() {
  const t = useT();

  const { data: activeOrders } = usePolling<OrderSummary[]>(
    "/api/orders?scope=active",
    { intervalMs: 5_000 }
  );
  const { data: historyOrders } = usePolling<OrderSummary[]>(
    "/api/orders?scope=history&status=completed",
    { intervalMs: 15_000 }
  );

  const returned = (activeOrders ?? []).filter(
    (order) => order.status === "production_complete"
  );
  const stillWorking = (activeOrders ?? []).filter(
    (order) => order.status === "in_production"
  );
  const closedToday = (historyOrders ?? []).filter(
    (order) => order.completedAt !== null
  );

  const [closingOrder, setClosingOrder] = useState<OrderSummary | null>(null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <h1 className="mb-4 text-2xl font-bold">{t("cashier.title")}</h1>

      {/* ============================================================
          SECTION: Returned — waiting for closure
          ============================================================ */}
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-on-surface-muted">
        {t("cashier.ready")} ({returned.length})
      </h2>
      {activeOrders === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : returned.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={t("cashier.empty")} />
      ) : (
        <ul className="mb-8 space-y-3">
          {returned.map((order) => (
            <li key={order.id}>
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/orders/${order.id}`}
                    className="font-mono font-bold text-primary hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                  <p className="truncate text-sm text-on-surface-muted">
                    {order.customerName ?? "—"}
                  </p>
                </div>
                <StatusBadge status={order.status} />
                <Button size="lg" onClick={() => setClosingOrder(order)}>
                  <Lock className="h-5 w-5" />
                  {t("cashier.close")}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* ============================================================
          SECTION: Still in production (read-only)
          ============================================================ */}
      {stillWorking.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-on-surface-muted">
            {t("production.working")} ({stillWorking.length})
          </h2>
          <ul className="mb-8 space-y-2">
            {stillWorking.map((order) => (
              <li key={order.id}>
                <Card className="p-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-mono text-sm font-semibold text-primary hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-sm text-on-surface-muted">
                      {order.customerName ?? "—"}
                    </span>
                    <StatusBadge status={order.status} />
                  </div>
                  <div className="mt-2">
                    <OrderProgress order={order} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ============================================================
          SECTION: Closed today
          ============================================================ */}
      {closedToday.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-on-surface-muted">
            {t("cashier.paidToday")} ({closedToday.length})
          </h2>
          <ul className="space-y-2">
            {closedToday.map((order) => (
              <li key={order.id}>
                <Card className="flex items-center gap-3 p-3 text-sm">
                  <CheckCircle2
                    className="h-5 w-5 shrink-0 text-success"
                    aria-hidden
                  />
                  <span className="font-mono font-semibold">
                    {order.orderNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-on-surface-muted">
                    {order.customerName ?? "—"}
                  </span>
                  <StatusBadge status={order.status} />
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* -- Close-order dialog (shared with the order detail page) -- */}
      <CloseOrderDialog order={closingOrder} onClose={() => setClosingOrder(null)} />
    </div>
  );
}
