"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChefHat, ClipboardList, Play, Check } from "lucide-react";
import type { OrderDetail as OrderDetailData, OrderSummary } from "@/types";
import { api, showErrorToast } from "@/lib/api-client";
import { STATUS_META } from "@/lib/order-status";
import { usePolling } from "@/lib/use-polling";
import { useLocale, useT } from "@/lib/i18n";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/orders/status-badge";

// ============================================================
// SECTION: Prep board
// ------------------------------------------------------------
// Simplified single-station view of Manolis-POS kitchen:
//   Queue (placed) → In progress (preparing) → Prepared
// Cards show live item lists (fetched per order) and one big
// action button each. 5 s polling keeps every screen in sync.
// ============================================================

export function PrepBoard() {
  const t = useT();
  const locale = useLocale();

  const { data: activeOrders } = usePolling<OrderSummary[]>(
    "/api/orders?scope=active",
    { intervalMs: 5_000 }
  );

  const prepOrders = (activeOrders ?? []).filter((order) =>
    ["placed", "preparing", "prepared"].includes(order.status)
  );

  // -- Item lists: the list API returns aggregates only, so the
  //    few in-flight orders are fetched individually (≤ handful).
  const [details, setDetails] = useState<Record<string, OrderDetailData>>({});

  const detailKey = prepOrders
    .map((order) => `${order.id}:${order.status}`)
    .join(",");

  useEffect(() => {
    let cancelled = false;

    const loadDetails = async () => {
      const targets = prepOrders.filter((order) => order.status !== "prepared");
      const results = await Promise.allSettled(
        targets.map((order) => api.get<OrderDetailData>(`/api/orders/${order.id}`))
      );
      if (cancelled) return;
      const next: Record<string, OrderDetailData> = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          next[targets[index].id] = result.value;
        }
      });
      setDetails(next);
    };

    void loadDetails();
    const timer = setInterval(loadDetails, 7_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prepOrders is stable per detailKey
  }, [detailKey]);

  // ============================================================
  // SECTION: Stage transition (same API as the detail screen)
  // ============================================================

  const advance = async (orderId: string, status: "preparing" | "prepared") => {
    try {
      await api.post(`/api/orders/${orderId}/status`, { status });
      // The 5 s poll reconciles the board; no local patch needed.
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    }
  };

  const columns = [
    { status: "placed", title: t("prep.queue"), orders: prepOrders.filter((o) => o.status === "placed") },
    {
      status: "preparing",
      title: t("prep.inProgress"),
      orders: prepOrders.filter((o) => o.status === "preparing"),
    },
    {
      status: "prepared",
      title: STATUS_META.prepared[locale],
      orders: prepOrders.filter((o) => o.status === "prepared"),
    },
  ] as const;

  return (
    <div className="mx-auto max-w-7xl px-4 py-4">
      <h1 className="mb-4 text-2xl font-bold">{t("prep.title")}</h1>

      {activeOrders === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : prepOrders.length === 0 ? (
        <EmptyState icon={ChefHat} title={t("prep.empty")} hint={t("prep.emptyHint")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {columns.map((column) => (
            <section key={column.status} aria-label={column.title}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-on-surface-muted">
                {column.title}
                <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs">
                  {column.orders.length}
                </span>
              </h2>
              <div className="space-y-3">
                {column.orders.map((order) => (
                  <PrepCard
                    key={order.id}
                    order={order}
                    detail={details[order.id]}
                    locale={locale}
                    onAdvance={advance}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SECTION: Prep card — items + one action
// ============================================================

function PrepCard({
  order,
  detail,
  locale,
  onAdvance,
}: {
  order: OrderSummary;
  detail?: OrderDetailData;
  locale: "en" | "el";
  onAdvance: (orderId: string, status: "preparing" | "prepared") => void;
}) {
  const t = useT();
  const items = detail?.items.filter((item) => item.status === "active") ?? [];

  return (
    <Card className="overflow-hidden">
      <Link
        href={`/orders/${order.id}`}
        className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 hover:bg-surface-container-low"
      >
        <span className="font-mono text-sm font-bold">{order.orderNumber}</span>
        <span className="text-xs text-on-surface-muted">
          {formatRelativeTime(order.placedAt, locale)}
        </span>
      </Link>

      <ul className="space-y-1.5 px-4 py-3">
        {items.length === 0 ? (
          <li className="text-sm text-on-surface-muted">
            {order.itemCount} {t("common.items")} · {order.totalUnits} {t("common.units")}
          </li>
        ) : (
          items.map((item) => (
            <li key={item.id} className="text-sm">
              <span className="font-bold">{item.quantity}×</span>{" "}
              <span className="font-medium">{item.name}</span>{" "}
              <span className="font-mono text-xs text-on-surface-muted">{item.partNumber}</span>
              {item.note && (
                <span className="block text-xs text-info">✎ {item.note}</span>
              )}
            </li>
          ))
        )}
      </ul>

      <div className="px-4 pb-3">
        {order.status === "placed" ? (
          <Button className="w-full" onClick={() => onAdvance(order.id, "preparing")}>
            <Play className="h-4 w-4" />
            {t("prep.start")}
          </Button>
        ) : order.status === "preparing" ? (
          <Button variant="success" className="w-full" onClick={() => onAdvance(order.id, "prepared")}>
            <Check className="h-4 w-4" />
            {t("prep.done")}
          </Button>
        ) : (
          <StatusBadge status="prepared" />
        )}
      </div>
    </Card>
  );
}
