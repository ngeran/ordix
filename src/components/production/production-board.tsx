"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import Link from "next/link";
import {
  Boxes,
  Check,
  ChefHat,
  Play,
  Wrench,
} from "lucide-react";
import type { OrderItem, OrderStatus } from "@/db/schema";
import type { OrderSummary } from "@/types";
import { api, showErrorToast } from "@/lib/api-client";
import { canCompleteItem, canSendItem } from "@/lib/order-status";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/orders/status-badge";
import {
  productionLabel,
  PRODUCTION_BADGE_CLASS,
  quantityLabel,
} from "@/components/orders/item-labels";

// ============================================================
// SECTION: Production board (manager view, mockup-style)
// ------------------------------------------------------------
// TWO COLUMNS, ONE JOB EACH:
//   Column 1 "New Orders": every placed order with big
//     "Send to Production" buttons per item + "Send All" bulk.
//   Column 2 "In Production": items mid-production with amber
//     "Click to Complete ✓" buttons; completed lines flip to a
//     strikethrough + timestamp + Completed pill, and the
//     per-order progress bar advances ("1/4 items completed").
//
// When the last item completes, the server auto-returns the
// order to the department (Closure screen takes it from there)
// and the board toasts it — the manager never closes orders.
//
// A per-item `pending` set blocks double taps while a request
// is in flight. Bulk actions run serially to preserve order.
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

  // -- Per-item in-flight guard: blocks double taps, loads buttons. --
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

  // -- Bulk send: FIRST request serially (it flips placed →
  // in_production server-side), the rest in parallel. --
  const bulkSend = async (order: OrderSummary) => {
    const targets = (order.items ?? []).filter(
      (item) =>
        item.status === "active" && item.productionStatus === "pending"
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
    const failures = results.filter((r) => r.status === "rejected").length;
    if (failures > 0) toast.error(`${failures} item(s) failed to send`);
    refresh();
  };

  // -- Bulk complete: mark every in_production item done; the
  // server auto-returns the order when the last one flips. --
  const bulkComplete = async (order: OrderSummary) => {
    const targets = (order.items ?? []).filter(
      (item) =>
        item.status === "active" &&
        item.productionStatus === "in_production"
    );
    if (targets.length === 0) return;

    for (const item of targets) {
      markPending(item.id, true);
    }
    const results = await Promise.allSettled(
      targets.map((item) =>
        api.post(`/api/orders/${order.id}/items/${item.id}`, {
          action: "complete_production",
        })
      )
    );
    for (const entry of targets) markPending(entry.id, false);
    const failures = results.filter((r) => r.status === "rejected").length;
    if (failures > 0) toast.error(`${failures} item(s) failed`);
    refresh();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-4">
      {/* ============================================================
          SECTION: Header band — title + quick metric ribbon
          ============================================================ */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-low px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">
              {t("production.title")}
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-success">
              <span
                aria-hidden
                className="h-2 w-2 animate-pulse rounded-full bg-success"
              />
              {t("production.live")}
            </span>
          </div>
        </div>

        {/* Quick metrics */}
        <div className="flex flex-wrap items-center gap-2">
          <MetricChip
            dot="bg-primary"
            label={t("production.queue")}
            value={queueOrders.length}
          />
          <MetricChip
            dot="bg-warning"
            label={t("production.working")}
            value={workingOrders.length}
          />
        </div>
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
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* ============================================================
              COLUMN 1: New orders awaiting dispatch
              ============================================================ */}
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
                onBulkComplete={bulkComplete}
              />
            )}
          />

          {/* ============================================================
              COLUMN 2: In production
              ============================================================ */}
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
                onBulkComplete={bulkComplete}
              />
            )}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// SECTION: Metric chip (header ribbon)
// ============================================================

function MetricChip({
  dot,
  label,
  value,
}: {
  dot: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-container px-3 py-1.5">
      <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", dot)} />
      <span className="text-xs uppercase text-on-surface-muted">{label}</span>
      <span className="rounded bg-surface-container-highest px-1.5 py-0.5 font-mono text-sm font-bold text-on-surface">
        {value}
      </span>
    </div>
  );
}

// ============================================================
// SECTION: Column wrapper
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
      <h2 className="sticky top-16 z-10 flex items-center gap-2 rounded-lg bg-background/90 px-1 py-2 text-sm font-bold uppercase tracking-wide text-on-surface backdrop-blur">
        {title}
        <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs text-on-surface-muted">
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
// SECTION: Production card (per-order, items stacked inside)
// ============================================================

function ProductionCard({
  order,
  pending,
  onItemAction,
  onBulkSend,
  onBulkComplete,
}: {
  order: OrderSummary;
  pending: Set<string>;
  onItemAction: (
    orderId: string,
    item: OrderItem,
    action: ProductionAction
  ) => void;
  onBulkSend: (order: OrderSummary) => void;
  onBulkComplete: (order: OrderSummary) => void;
}) {
  const t = useT();
  const activeItems = (order.items ?? []).filter(
    (item) => item.status === "active"
  );
  const pendingItems = activeItems.filter(
    (item) => item.productionStatus === "pending"
  );
  const inProdItems = activeItems.filter(
    (item) => item.productionStatus === "in_production"
  );
  const producedCount = activeItems.filter(
    (item) => item.productionStatus === "completed"
  ).length;
  const totalItems = activeItems.length;
  const producedPct =
    totalItems === 0
      ? 0
      : Math.round((producedCount / totalItems) * 100);

  return (
    <Card className="overflow-hidden">
      {/* -- Card header: order number + customer + progress -- */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 pb-3 pt-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"
          >
            <Boxes className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <Link
              href={`/orders/${order.id}`}
              className="text-base font-extrabold tracking-tight text-on-surface hover:text-primary"
            >
              {order.orderNumber}
            </Link>
            <p className="truncate text-xs text-on-surface-muted">
              {order.customerName ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-xs text-on-surface-muted">
            {producedCount}/{totalItems} {t("production.inProdLabel")}
          </span>
          <div className="h-2 w-36 overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${producedPct}%` }}
              role="progressbar"
              aria-valuenow={producedCount}
              aria-valuemin={0}
              aria-valuemax={totalItems}
            />
          </div>
        </div>
      </div>

      {/* -- Items stack: one tactile row per line -- */}
      <ul className="space-y-2 px-4 py-3">
        {activeItems.length === 0 ? (
          <li className="py-1 text-sm text-on-surface-muted">
            {t("common.loading")}
          </li>
        ) : (
          activeItems.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              order={order}
              isTapping={pending.has(item.id)}
              onAction={onItemAction}
            />
          ))
        )}
      </ul>

      {/* -- Card footer: bulk actions -- */}
      <div className="space-y-2 px-4 pb-4 pt-1">
        {pendingItems.length > 0 && (
          <Button
            variant="secondary"
            className="h-12 w-full"
            onClick={() => onBulkSend(order)}
          >
            <Play className="h-5 w-5" />
            {t("production.sendAll")} ({pendingItems.length} {t("pos.items")})
          </Button>
        )}
        {inProdItems.length > 0 && (
          <Button
            variant="success"
            className="h-12 w-full font-bold"
            onClick={() => onBulkComplete(order)}
          >
            {t("production.completeAll")} ({inProdItems.length} {t("pos.items")})
          </Button>
        )}
        {totalItems > 0 && inProdItems.length === 0 && pendingItems.length === 0 && (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-center text-xs font-semibold text-success">
            {t("production.allProduced")}
          </p>
        )}
      </div>
    </Card>
  );
}

// ============================================================
// SECTION: Item row — Send (→ in_production) / Done (→ completed)
// ============================================================

function ItemRow({
  item,
  order,
  isTapping,
  onAction,
}: {
  item: OrderItem;
  order: OrderSummary;
  isTapping: boolean;
  onAction: (
    orderId: string,
    item: OrderItem,
    action: ProductionAction
  ) => void;
}) {
  const t = useT();

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg bg-surface-container p-2.5 transition-colors",
        item.productionStatus === "in_production"
          ? "border border-warning/30"
          : "border border-transparent"
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            item.productionStatus === "in_production"
              ? "bg-warning-soft text-warning"
              : item.productionStatus === "completed"
                ? "bg-success-soft text-success"
                : "bg-surface-container-highest text-on-surface-muted"
          )}
        >
          <Wrench className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p
            className={cn(
              "truncate text-sm font-semibold text-on-surface",
              item.productionStatus === "completed" &&
                "opacity-70 line-through"
            )}
          >
            {item.name}
          </p>
          <p className="truncate text-xs text-on-surface-muted">
            {quantityLabel(item, t)} •{" "}
            <span className="font-mono font-bold">{item.partNumber}</span>
            {item.productionStatus === "completed" &&
              item.productionCompletedAt && (
                <span className="ml-1 text-success">
                  {formatRelativeTime(item.productionCompletedAt)}
                </span>
              )}
          </p>
        </div>
      </div>

      {/* State button: the mockup's core interaction */}
      {item.productionStatus === "pending" &&
        canSendItem(order.status) && (
          <Button
            variant="secondary"
            size="lg"
            loading={isTapping}
            onClick={() => onAction(order.id, item, "send_to_production")}
            className="h-12 shrink-0 font-bold"
          >
            {t("production.send")}
          </Button>
        )}
      {item.productionStatus === "in_production" &&
        canCompleteItem(order.status) && (
          <Button
            size="lg"
            loading={isTapping}
            onClick={() => onAction(order.id, item, "complete_production")}
            className="h-12 shrink-0 bg-warning font-bold text-background hover:opacity-90"
          >
            {t("production.completeItem")}
          </Button>
        )}
      {item.productionStatus === "completed" && (
        <span
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 rounded-lg px-3 font-semibold",
            "bg-success-soft text-success"
          )}
        >
          <Check className="h-5 w-5" />
          {t("production.done")}
        </span>
      )}
    </div>
  );
}
