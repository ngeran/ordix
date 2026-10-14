"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { Clock, Plus, ReceiptText } from "lucide-react";
import type { OrderStatus } from "@/db/schema";
import type { OrderSummary } from "@/types";
import { STATUS_META } from "@/lib/order-status";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/orders/status-badge";

// ============================================================
// SECTION: Orders screen — simplified floor dashboard
// ------------------------------------------------------------
// Per the order-terminal mockup: one dense TABLE of active
// orders (Order ID · Stage pill · Time in Queue · Time in
// Production), simple filter pills, and one prominent
// + New Order button. Rows link to the order detail.
// ============================================================

type Filter = "all" | "queue" | "production";

/** "26m" / "1h 13m" / "2d 3h" — compact age for board columns. */
function formatAge(since: Date | string | null): string {
  if (!since) return "—";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(since).getTime()) / 60_000)
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function OrdersScreen() {
  const t = useT();

  const [filter, setFilter] = useState<Filter>("all");

  const { data: activeOrders, isStale } = usePolling<OrderSummary[]>(
    "/api/orders?scope=active",
    { intervalMs: 5_000 }
  );

  const queueOrders = (activeOrders ?? []).filter(
    (order) => order.status === "placed"
  );
  const productionOrders = (activeOrders ?? []).filter(
    (order) => order.status === "in_production"
  );

  const visible =
    filter === "queue"
      ? queueOrders
      : filter === "production"
        ? productionOrders
        : (activeOrders ?? []);

  const pills: Array<{ key: Filter; label: string; count: number }> = [
    { key: "all", label: t("common.all"), count: (activeOrders ?? []).length },
    { key: "queue", label: t("orders.newInQueue"), count: queueOrders.length },
    {
      key: "production",
      label: t("orders.inProductionPill"),
      count: productionOrders.length,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      {/* ============================================================
          SECTION: Header — title, live pill, filters, + New Order
          ============================================================ */}
      <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">
              {t("orders.title")}
            </h1>
            <span className="rounded-full bg-surface-container-highest px-3 py-1 text-xs font-bold text-primary">
              {t("orders.liveFlow")}
            </span>
          </div>
          <p className="text-sm text-on-surface-muted">{t("orders.floorDispatch")}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
          {/* Filter pills */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-container-lowest p-1.5">
            {pills.map((pill) => (
              <button
                key={pill.key}
                onClick={() => setFilter(pill.key)}
                aria-pressed={filter === pill.key}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm transition-all",
                  filter === pill.key
                    ? "bg-primary font-bold text-on-primary shadow-md"
                    : "text-on-surface-muted hover:bg-surface-container hover:text-on-surface"
                )}
              >
                {pill.label} ({pill.count})
              </button>
            ))}
          </div>

          {/* Prominent New Order button */}
          <Link href="/order" className="shrink-0">
            <Button variant="success" size="lg" className="text-base font-bold">
              <Plus className="h-5 w-5" />
              {t("orders.newOrder")}
            </Button>
          </Link>
        </div>
      </div>

      {/* ============================================================
          SECTION: Active order table
          ============================================================ */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-container-lowest shadow-card">
        <div className="flex items-center justify-between border-b border-border bg-surface-container-low px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-3 rounded-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.6)]"
            />
            <h2 className="text-base font-bold uppercase tracking-wide text-on-surface">
              {t("orders.activeTab")}
            </h2>
          </div>
          <span className="rounded bg-surface-container px-2 py-0.5 text-xs font-bold text-on-surface">
            {visible.length} {t("orders.title")}
          </span>
        </div>

        {activeOrders === null ? (
          <LoadingArea label={t("common.loading")} />
        ) : visible.length === 0 ? (
          <EmptyState icon={ReceiptText} title={t("orders.empty")} hint={t("orders.emptyHint")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-border bg-surface-container-low/60 text-xs font-semibold uppercase tracking-wider text-on-surface-muted">
                <tr>
                  <th className="px-4 py-3">{t("orders.tableOrder")}</th>
                  <th className="px-4 py-3">{t("orders.tableStage")}</th>
                  <th className="px-4 py-3">{t("orders.tableQueueTime")}</th>
                  <th className="px-4 py-3">{t("orders.tableProdTime")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((order) => (
                  <tr
                    key={order.id}
                    className="min-h-14 transition-colors hover:bg-surface-container"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/orders/${order.id}`}
                        className="flex items-center gap-2 text-base font-extrabold tracking-tight text-on-surface hover:text-primary"
                      >
                        <ReceiptText
                          className="h-5 w-5 text-on-surface-muted"
                          aria-hidden
                        />
                        {order.orderNumber}
                      </Link>
                      {order.customerName && (
                        <span className="mt-0.5 block truncate text-xs text-on-surface-muted">
                          {order.customerName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-bold text-primary">
                        <Clock className="h-4 w-4" aria-hidden />
                        {formatAge(order.placedAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {order.productionStartedAt ? (
                        <span className="font-bold text-warning">
                          {formatAge(order.productionStartedAt)}
                        </span>
                      ) : (
                        <span className="text-on-surface-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
