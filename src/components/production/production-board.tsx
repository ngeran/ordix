"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChefHat, Play } from "lucide-react";
import type { OrderItem } from "@/db/schema";
import type { OrderDetail as OrderDetailData, OrderSummary } from "@/types";
import { api, showErrorToast } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import { useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/orders/status-badge";

// ============================================================
// SECTION: Production board
// ------------------------------------------------------------
// Two columns: Νέες παραγγελίες (placed) → Σε παραγωγή
// (in_production). Cards list every ACTIVE line with its state
// and one big button each:
//   pending       → ▶ Send to production
//   in_production → ✔ Done
//   completed     → green badge (no button)
// When ALL active lines of an order are completed, the card
// shows the "Production finished" button that hands the order
// to the cashier.
// ============================================================

export function ProductionBoard() {
  const t = useT();
  const locale = useLocale();

  const { data: activeOrders } = usePolling<OrderSummary[]>(
    "/api/orders?scope=active",
    { intervalMs: 5_000 }
  );

  const productionOrders = (activeOrders ?? []).filter((order) =>
    ["placed", "in_production"].includes(order.status)
  );

  // -- Item lists: fetched per order (only a handful are live) --
  const [details, setDetails] = useState<Record<string, OrderDetailData>>({});

  const detailKey = productionOrders
    .map((order) => `${order.id}:${order.status}`)
    .join(",");

  useEffect(() => {
    let cancelled = false;

    const loadDetails = async () => {
      const results = await Promise.allSettled(
        productionOrders.map((order) =>
          api.get<OrderDetailData>(`/api/orders/${order.id}`)
        )
      );
      if (cancelled) return;
      const next: Record<string, OrderDetailData> = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          next[productionOrders[index].id] = result.value;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- productionOrders is stable per detailKey
  }, [detailKey]);

  // ============================================================
  // SECTION: Item clicks (production manager's two taps)
  // ============================================================

  const itemAction = async (
    orderId: string,
    itemId: string,
    action: "send_to_production" | "complete_production"
  ) => {
    try {
      await api.post(`/api/orders/${orderId}/items/${itemId}`, { action });
      // The 5 s poll reconciles the board; no local patch needed.
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    }
  };

  const finishOrder = async (orderId: string) => {
    try {
      await api.post(`/api/orders/${orderId}/status`, {
        status: "production_complete",
      });
      toast.success(t("cashier.ready"));
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    }
  };

  const sendAll = async (order: OrderSummary) => {
    const detail = details[order.id];
    const pending = detail?.items.filter(
      (item) => item.status === "active" && item.productionStatus === "pending"
    );
    if (!detail || !pending || pending.length === 0) return;
    try {
      await Promise.all(
        pending.map((item) =>
          api.post(`/api/orders/${order.id}/items/${item.id}`, {
            action: "send_to_production",
          })
        )
      );
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    }
  };

  const columns = [
    {
      key: "placed",
      title: t("production.queue"),
      orders: productionOrders.filter((order) => order.status === "placed"),
    },
    {
      key: "working",
      title: t("production.working"),
      orders: productionOrders.filter((order) => order.status === "in_production"),
    },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <h1 className="mb-4 text-2xl font-bold">{t("production.title")}</h1>

      {activeOrders === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : productionOrders.length === 0 ? (
        <EmptyState icon={ChefHat} title={t("production.empty")} hint={t("orders.emptyHint")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {columns.map((column) => (
            <section key={column.key} aria-label={column.title}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-on-surface-muted">
                {column.title}
                <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs">
                  {column.orders.length}
                </span>
              </h2>
              <div className="space-y-3">
                {column.orders.map((order) => (
                  <ProductionCard
                    key={order.id}
                    order={order}
                    detail={details[order.id]}
                    locale={locale}
                    onItemAction={itemAction}
                    onFinish={finishOrder}
                    onSendAll={sendAll}
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
// SECTION: Production card — items with two-tap flow
// ============================================================

function ProductionCard({
  order,
  detail,
  locale,
  onItemAction,
  onFinish,
  onSendAll,
}: {
  order: OrderSummary;
  detail?: OrderDetailData;
  locale: "en" | "el";
  onItemAction: (
    orderId: string,
    itemId: string,
    action: "send_to_production" | "complete_production"
  ) => void;
  onFinish: (orderId: string) => void;
  onSendAll: (order: OrderSummary) => void;
}) {
  const t = useT();
  const activeItems =
    detail?.items.filter((item) => item.status === "active") ?? [];
  const allProduced =
    activeItems.length > 0 &&
    activeItems.every((item) => item.productionStatus === "completed");
  const pendingCount = activeItems.filter(
    (item) => item.productionStatus === "pending"
  ).length;

  return (
    <Card className="overflow-hidden">
      <Link
        href={`/orders/${order.id}`}
        className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 hover:bg-surface-container-low"
      >
        <span className="font-mono text-sm font-bold">{order.orderNumber}</span>
        <span className="flex items-center gap-2">
          {order.customerName && (
            <span className="max-w-40 truncate text-sm font-medium">
              {order.customerName}
            </span>
          )}
          <StatusBadge status={order.status} />
        </span>
      </Link>

      <ul className="divide-y divide-border">
        {activeItems.length === 0 ? (
          <li className="px-4 py-3 text-sm text-on-surface-muted">
            {t("common.loading")}
          </li>
        ) : (
          activeItems.map((item) => (
            <ProductionItemRow
              key={item.id}
              item={item}
              orderId={order.id}
              locale={locale}
              onAction={onItemAction}
            />
          ))
        )}
      </ul>

      <div className="space-y-2 px-4 pb-3 pt-2">
        {pendingCount > 0 && order.status === "in_production" && (
          <Button variant="secondary" size="sm" className="w-full" onClick={() => onSendAll(order)}>
            <Play className="h-4 w-4" />
            {t("production.sendAll")} ({pendingCount})
          </Button>
        )}
        {allProduced && order.status === "in_production" && (
          <Button variant="success" size="lg" className="w-full" onClick={() => onFinish(order.id)}>
            <Check className="h-5 w-5" />
            {t("production.finishOrder")}
          </Button>
        )}
      </div>
    </Card>
  );
}

// ============================================================
// SECTION: Item row — the manager's two taps
// ============================================================

function ProductionItemRow({
  item,
  orderId,
  locale,
  onAction,
}: {
  item: OrderItem;
  orderId: string;
  locale: "en" | "el";
  onAction: (
    orderId: string,
    itemId: string,
    action: "send_to_production" | "complete_production"
  ) => void;
}) {
  const t = useT();

  const quantityLabel =
    item.quantityBoxes > 0 && item.quantityItems > 0
      ? `${item.quantityBoxes} ${t("pos.boxes")} + ${item.quantityItems} ${t("pos.items")}`
      : item.quantityBoxes > 0
        ? `${item.quantityBoxes} ${t("pos.boxes")}`
        : `${item.quantityItems} ${t("pos.items")}`;

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.name}</p>
        <p className="text-xs text-on-surface-muted">
          {quantityLabel}
          <span className="font-mono"> · {item.partNumber}</span>
          {item.note && <span className="block text-info">✎ {item.note}</span>}
        </p>
      </div>

      {item.productionStatus === "pending" && (
        <Button size="sm" onClick={() => onAction(orderId, item.id, "send_to_production")}>
          <Play className="h-4 w-4" />
          {t("production.send")}
        </Button>
      )}
      {item.productionStatus === "in_production" && (
        <Button variant="success" size="sm" onClick={() => onAction(orderId, item.id, "complete_production")}>
          <Check className="h-4 w-4" />
          {t("production.done")}
        </Button>
      )}
      {item.productionStatus === "completed" && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
            "bg-success-soft text-success"
          )}
        >
          <Check className="h-4 w-4" aria-hidden />
          {t("production.done")}
        </span>
      )}
    </li>
  );
}
