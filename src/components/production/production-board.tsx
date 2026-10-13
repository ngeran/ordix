"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { Check, ChefHat, Play } from "lucide-react";
import type { OrderItem } from "@/db/schema";
import type { OrderSummary } from "@/types";
import { api, showErrorToast } from "@/lib/api-client";
import { canCompleteItem, canSendItem } from "@/lib/order-status";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/orders/status-badge";
import { OrderProgress } from "@/components/orders/order-progress";
import {
  productionLabel,
  PRODUCTION_BADGE_CLASS,
  quantityLabel,
} from "@/components/orders/item-labels";

// ============================================================
// SECTION: Production board (manager view)
// ------------------------------------------------------------
// ONE poll for all active orders WITH their attached items
// (include=items — the server batches it into two queries).
// Columns: Queue (placed) → In production → Returned (hidden
// when empty on narrow screens).
//
// Item actions:
//   pending       → ▶ Send   (first send flips the order to
//                              in_production automatically)
//   in_production → ✔ Done
// When the last active item completes, the server auto-returns
// the order to the department and the board toasts it.
//
// A per-item `pending` set blocks double taps; bulk "send all"
// runs the FIRST request serially (it may flip the order
// status) and the rest in parallel, reporting partial failures.
// ============================================================

type ProductionAction = "send_to_production" | "complete_production";

export function ProductionBoard() {
  const t = useT();
  const { data: activeOrders, isStale, refresh } = usePolling<OrderSummary[]>(
    "/api/orders?scope=active&include=items",
    { intervalMs: 5_000 }
  );

  const productionOrders = (activeOrders ?? []).filter((order) =>
    ["placed", "in_production"].includes(order.status)
  );

  const queueOrders = productionOrders.filter(
    (order) => order.status === "placed"
  );
  const workingOrders = productionOrders.filter(
    (order) => order.status === "in_production"
  );

  // -- Per-item in-flight guard: blocks double taps. --
  const [pending, setPending] = useState<Set<string>>(new Set());
  const markPending = (itemId: string, on: boolean) => {
    setPending((previous) => {
      const next = new Set(previous);
      if (on) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  };

  const itemAction = async (
    orderId: string,
    item: OrderItem,
    action: ProductionAction
  ) => {
    markPending(item.id, true);
    try {
      const updated = await api.post<OrderSummary>(
        `/api/orders/${orderId}/items/${item.id}`,
        { action }
      );
      if (updated.status === "production_complete") {
        toast.success(
          t("production.returned", { number: updated.orderNumber })
        );
      }
      refresh();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      markPending(item.id, false);
    }
  };

  // -- Bulk send: first request serially (flips placed →
  // in_production), rest in parallel; partial failures reported. --
  const bulkSend = async (order: OrderSummary) => {
    const targets = (order.items ?? []).filter(
      (item) => item.status === "active" && item.productionStatus === "pending"
    );
    if (targets.length === 0) return;

    markPending(targets[0].id, true);
    try {
      await api.post(`/api/orders/${order.id}/items/${targets[0].id}`, {
        action: "send_to_production",
      });
    } catch (error) {
      showErrorToast(error, t("error.generic"));
      return;
    } finally {
      markPending(targets[0].id, false);
    }

    const results = await Promise.allSettled(
      targets.slice(1).map((item) =>
        api.post(`/api/orders/${order.id}/items/${item.id}`, {
          action: "send_to_production",
        })
      )
    );
    const failures = results.filter(
      (result) => result.status === "rejected"
    ).length;
    if (failures > 0) {
      toast.error(`${failures} item(s) failed to send`);
    }
    refresh();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("production.title")}</h1>
        {isStale && (
          <span role="status" className="text-xs text-warning">
            {t("orders.staleData")}
          </span>
        )}
      </div>

      {activeOrders === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : productionOrders.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title={t("production.empty")}
          hint={t("orders.emptyHint")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BoardColumn
            title={t("production.queue")}
            count={queueOrders.length}
            orders={queueOrders}
            render={(order) => (
              <ProductionCard
                key={order.id}
                order={order}
                pending={pending}
                onItemAction={itemAction}
                onBulkSend={bulkSend}
              />
            )}
          />
          <BoardColumn
            title={t("production.working")}
            count={workingOrders.length}
            orders={workingOrders}
            render={(order) => (
              <ProductionCard
                key={order.id}
                order={order}
                pending={pending}
                onItemAction={itemAction}
                onBulkSend={bulkSend}
              />
            )}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// SECTION: Column wrapper (sticky header)
// ============================================================

function BoardColumn({
  title,
  count,
  orders,
  render,
}: {
  title: string;
  count: number;
  orders: OrderSummary[];
  render: (order: OrderSummary) => React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-h-0 flex-col gap-3">
      <h2 className="sticky top-16 z-10 flex items-center gap-2 rounded-lg bg-background/90 px-1 py-2 text-sm font-semibold uppercase tracking-wider text-on-surface-muted backdrop-blur">
        {title}
        <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs">
          {count}
        </span>
      </h2>
      {orders.map((order) => render(order))}
      {orders.length === 0 && (
        <Card className="p-4 text-sm text-on-surface-muted">—</Card>
      )}
    </section>
  );
}

// ============================================================
// SECTION: Production card
// ============================================================

function ProductionCard({
  order,
  pending,
  onItemAction,
  onBulkSend,
}: {
  order: OrderSummary;
  pending: Set<string>;
  onItemAction: (
    orderId: string,
    item: OrderItem,
    action: ProductionAction
  ) => void;
  onBulkSend: (order: OrderSummary) => void;
}) {
  const t = useT();
  const activeItems = (order.items ?? []).filter(
    (item) => item.status === "active"
  );
  const pendingItems = activeItems.filter(
    (item) => item.productionStatus === "pending"
  );
  const allProduced =
    activeItems.length > 0 &&
    activeItems.every((item) => item.productionStatus === "completed");

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

      <div className="space-y-1 px-4 pt-3">
        {order.notes && (
          <p className="text-xs italic text-on-surface-muted">
            ✎ {order.notes}
          </p>
        )}
        <OrderProgress order={order} />
      </div>

      <ul className="space-y-1 px-4 pt-2">
        {activeItems.length === 0 ? (
          <li className="py-1 text-sm text-on-surface-muted">
            {t("common.loading")}
          </li>
        ) : (
          activeItems.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.name}</p>
                <p className="text-xs text-on-surface-muted">
                  {quantityLabel(item, t)}
                  <span className="font-mono"> · {item.partNumber}</span>
                </p>
              </div>

              {item.productionStatus === "pending" &&
                canSendItem(order.status) && (
                  <Button
                    size="sm"
                    loading={pending.has(item.id)}
                    onClick={() =>
                      onItemAction(order.id, item, "send_to_production")
                    }
                  >
                    <Play className="h-4 w-4" />
                    {t("production.send")}
                  </Button>
                )}
              {item.productionStatus === "in_production" &&
                canCompleteItem(order.status) && (
                  <Button
                    variant="success"
                    size="sm"
                    loading={pending.has(item.id)}
                    onClick={() =>
                      onItemAction(order.id, item, "complete_production")
                    }
                  >
                    <Check className="h-4 w-4" />
                    {t("production.done")}
                  </Button>
                )}
              {item.productionStatus === "completed" && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    PRODUCTION_BADGE_CLASS.completed
                  )}
                >
                  {productionLabel("completed", t)}
                </span>
              )}
            </li>
          ))
        )}
      </ul>

      <div className="space-y-2 px-4 pb-3 pt-1">
        {pendingItems.length > 1 && (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => onBulkSend(order)}
          >
            <Play className="h-4 w-4" />
            {t("production.sendAll")} ({pendingItems.length})
          </Button>
        )}
        {allProduced && (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-center text-xs font-semibold text-success">
            {t("production.allProduced")}
          </p>
        )}
      </div>
    </Card>
  );
}
