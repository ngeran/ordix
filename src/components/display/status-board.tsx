"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import type { OrderStatus } from "@/db/schema";
import type { OrderSummary } from "@/types";
import { STATUS_META } from "@/lib/order-status";
import { usePolling } from "@/lib/use-polling";
import { useLocale, useT } from "@/lib/i18n";
import { cn, formatRelativeTime } from "@/lib/utils";

// ============================================================
// SECTION: Warehouse status board (build-to-order columns)
// ------------------------------------------------------------
// Four fixed columns, mapped from order statuses:
//   QUEUE      ← placed (submitted, not yet in production)
//   IN PROGRESS← in_production
//   COMPLETED  ← production_complete (waiting for the cashier)
//   PAID       ← completed, today's (most recent 8)
//
// Design rules for wall screens: huge type, high contrast, no
// interaction, no scrolling per column (oldest 6 shown), age
// badge turns amber past 30 min and red past 60.
// ============================================================

/** Age thresholds for the badge coloring (minutes). */
const AGE_WARN_MIN = 30;
const AGE_AGE_MAX_MIN = 60;
/** Rows kept per column — a wall board must never scroll. */
const MAX_ROWS = 6;
const MAX_PAID_ROWS = 8;

export function StatusBoard() {
  const t = useT();
  const locale = useLocale();

  // -- Live data: active orders + recent history (for SHIPPED) --
  const { data: activeOrders, isStale: activeStale } = usePolling<OrderSummary[]>(
    "/api/orders?scope=active",
    { intervalMs: 5_000 }
  );
  const { data: historyOrders, isStale: historyStale } = usePolling<OrderSummary[]>(
    "/api/orders?scope=history",
    { intervalMs: 5_000 }
  );

  // -- Wall clock (1 min tick) --
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const byStatus = (status: OrderStatus) =>
    (activeOrders ?? []).filter((order) => order.status === status);

  const columns: BoardColumn[] = [
    {
      key: "queue",
      label: t("production.queue"),
      accent: "bg-sky-500",
      text: "text-sky-400",
      orders: byStatus("placed"),
    },
    {
      key: "production",
      label: t("production.working"),
      accent: "bg-amber-500",
      text: "text-amber-400",
      orders: byStatus("in_production"),
    },
    {
      key: "produced",
      label: STATUS_META.production_complete[locale],
      accent: "bg-violet-500",
      text: "text-violet-400",
      orders: byStatus("production_complete"),
    },
    {
      key: "paid",
      label: t("cashier.paidToday"),
      accent: "bg-emerald-500",
      text: "text-emerald-400",
      orders: (historyOrders ?? [])
        .filter((order) => order.status === "completed" && order.paidAt !== null)
        .slice(0, MAX_PAID_ROWS),
    },
  ];

  const isStale = activeStale || historyStale;

  return (
    <div className="flex h-dvh flex-col bg-background p-4 sm:p-6">
      {/* ============================================================
          SECTION: Header — brand, clock, connection state
          ============================================================ */}
      <header className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-xl font-black text-on-primary"
          >
            O
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("display.title")}</h1>
        </div>
        <div className="flex items-center gap-4 text-sm sm:text-base">
          {isStale && (
            <span className="rounded-full bg-warning-soft px-3 py-1 font-medium text-warning">
              {t("orders.staleData")}
            </span>
          )}
          <span className="font-mono text-on-surface-muted">
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </header>

      {/* ============================================================
          SECTION: The four columns
          ============================================================ */}
      <main className="grid min-h-0 flex-1 grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {columns.map((column) => (
          <section
            key={column.key}
            className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface"
            aria-label={column.label}
          >
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <span aria-hidden className={cn("h-3 w-3 rounded-full", column.accent)} />
              <h2 className={cn("text-lg font-bold uppercase tracking-wider sm:text-xl", column.text)}>
                {column.label}
              </h2>
              <span className="ml-auto rounded-full bg-surface-container px-2.5 py-0.5 text-base font-bold text-on-surface-muted">
                {column.orders.length}
              </span>
            </div>

            <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
              {column.orders.length === 0 ? (
                <p className="flex h-full items-center justify-center text-lg text-on-surface-muted/50">—</p>
              ) : (
                column.orders.slice(0, column.key === "paid" ? MAX_PAID_ROWS : MAX_ROWS).map((order) => (
                  <BoardCard key={order.id} order={order} paid={column.key === "paid"} />
                ))
              )}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

// ============================================================
// SECTION: Board card
// ------------------------------------------------------------
// One order, readable from across the aisle: giant order number,
// customer, unit count, age badge (the PAID column shows time
// since payment instead).
// ============================================================

interface BoardColumn {
  key: "queue" | "production" | "produced" | "paid";
  label: string;
  accent: string;
  text: string;
  orders: OrderSummary[];
}

function BoardCard({ order, paid }: { order: OrderSummary; paid: boolean }) {
  const t = useT();
  const locale = useLocale();
  const ageMinutes = Math.max(0, Math.round((Date.now() - new Date(order.placedAt).getTime()) / 60_000));
  const ageHot = ageMinutes >= AGE_AGE_MAX_MIN;
  const ageWarm = ageMinutes >= AGE_WARN_MIN;

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface-container-lowest p-3",
        ageHot && !paid ? "border-error" : ageWarm && !paid ? "border-warning" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-xl font-bold leading-tight sm:text-2xl">
          {order.orderNumber}
        </p>
        {paid ? (
          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400">
            {order.paidAt ? formatRelativeTime(order.paidAt, locale) : "—"}
          </span>
        ) : (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
              ageHot
                ? "bg-error-soft text-error"
                : ageWarm
                  ? "bg-warning-soft text-warning"
                  : "bg-surface-container text-on-surface-muted"
            )}
          >
            {ageMinutes} {t("display.minutes")}
          </span>
        )}
      </div>

      {order.customerName && (
        <p className="mt-0.5 truncate text-sm text-on-surface-muted">{order.customerName}</p>
      )}

      <p className="mt-1 text-sm font-medium text-on-surface-muted">
        {order.totalUnits} {t("common.units")} · {order.itemCount} {t("common.items")}
      </p>
    </div>
  );
}
