"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import type { OrderStatus } from "@/db/schema";
import type { OrderSummary } from "@/types";
import { ORDER_MAIN_FLOW, STATUS_META } from "@/lib/order-status";
import { usePolling } from "@/lib/use-polling";
import { useLocale, useT } from "@/lib/i18n";
import { cn, formatMoney, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/orders/status-badge";

// ============================================================
// SECTION: Orders screen — active board + history
// ------------------------------------------------------------
// Active tab: live board of in-flight orders (5 s poll). Every
// card links to the detail page; the status filter chips narrow
// the board. History tab: finished/cancelled orders with a
// status select + date filter (15 s poll).
// ============================================================

type Tab = "active" | "history";

export function OrdersScreen() {
  const t = useT();
  const locale = useLocale();

  const [tab, setTab] = useState<Tab>("active");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");
  const [dateFilter, setDateFilter] = useState("");

  // -- Build the query for the current tab + filters --
  const url = (() => {
    const params = new URLSearchParams({ scope: tab });
    if (statusFilter) params.set("status", statusFilter);
    if (dateFilter) params.set("date", dateFilter);
    return `/api/orders?${params.toString()}`;
  })();

  const { data: orders, isStale } = usePolling<OrderSummary[]>(url, {
    intervalMs: tab === "active" ? 5_000 : 15_000,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      {/* ============================================================
          SECTION: Header — title, tab switch, new order
          ============================================================ */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("orders.title")}</h1>
        <div className="flex items-center gap-2">
          {/* Tab switch */}
          <div
            className="flex rounded-xl bg-surface-container p-1"
            role="tablist"
            aria-label={t("orders.title")}
          >
            {(["active", "history"] as const).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "h-10 rounded-lg px-4 text-sm font-semibold transition-colors",
                  tab === value
                    ? "bg-surface text-on-surface shadow-card"
                    : "text-on-surface-muted"
                )}
              >
                {value === "active" ? t("orders.activeTab") : t("orders.historyTab")}
              </button>
            ))}
          </div>
          <Link href="/order">
            <Button size="icon" aria-label={t("nav.order")}>
              <Plus className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* ============================================================
          SECTION: Filters
          ============================================================ */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as OrderStatus | "")}
          aria-label={t("orders.filterAll")}
          className="w-48"
        >
          <option value="">{t("orders.filterAll")}</option>
          {ORDER_MAIN_FLOW.map((status) => (
            <option key={status} value={status}>
              {STATUS_META[status][locale]}
            </option>
          ))}
          <option value="on_hold">{STATUS_META.on_hold[locale]}</option>
          <option value="cancelled">{STATUS_META.cancelled[locale]}</option>
        </Select>
        {tab === "history" && (
          <Input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            aria-label={t("orders.today")}
            className="w-44"
          />
        )}
        {isStale && (
          <span className="text-xs text-warning">{t("orders.staleData")}</span>
        )}
      </div>

      {/* ============================================================
          SECTION: Order cards
          ============================================================ */}
      {orders === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t("orders.empty")}
          hint={t("orders.emptyHint")}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// SECTION: Order card
// ------------------------------------------------------------
// Whole card is a link to the detail page; content mirrors what
// the warehouse asks first: number, status, age, what's inside.
// ============================================================

function OrderCard({
  order,
  locale,
}: {
  order: OrderSummary;
  locale: "en" | "el";
}) {
  const t = useT();

  return (
    <li>
      <Link
        href={`/orders/${order.id}`}
        className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-card transition-all hover:border-primary hover:shadow-pop"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono font-bold">{order.orderNumber}</span>
          <StatusBadge status={order.status} />
        </div>

        <p className="text-sm text-on-surface-muted">
          {formatRelativeTime(order.placedAt, locale)}
          {order.customerName ? ` · ${order.customerName}` : ""}
          {order.createdByName
            ? ` · ${t("detail.createdBy", { name: order.createdByName })}`
            : ""}
        </p>

        <div className="mt-auto flex items-center justify-between pt-1 text-sm">
          <span className="text-on-surface-muted">
            {order.itemCount} {t("common.items")} · {order.totalUnits} {t("common.units")}
          </span>
          <span className="font-bold">{formatMoney(order.totalCents, locale)}</span>
        </div>
      </Link>
    </li>
  );
}
