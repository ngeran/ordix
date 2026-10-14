"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock, Plus, ReceiptText, Search, X } from "lucide-react";
import type { OrderStatus } from "@/db/schema";
import type { OrderSummary } from "@/types";
import { STATUS_META, summaryProgress } from "@/lib/order-status";
import { usePolling } from "@/lib/use-polling";
import { useLocale, useT } from "@/lib/i18n";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/orders/status-badge";
import { formatAge, ProgressBar, useNextStep } from "@/components/orders/order-visuals";

// ============================================================
// SECTION: Orders screen — find any order, see where it is
// ------------------------------------------------------------
//   - one search box (order number, customer, part number)
//   - two tabs: Open orders / Closed & cancelled
//   - status chips with live counts (open tab)
//   - responsive card grid: each card says the status, the % of
//     items done and — in plain words — what happens next
// ============================================================

type Tab = "active" | "history";
const ACTIVE_FILTERS: Array<OrderStatus | "all"> = [
  "all",
  "placed",
  "in_production",
  "production_complete",
  "on_hold",
];

/** Debounce typed search so the server isn't hit per keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function OrdersScreen() {
  const t = useT();
  const locale = useLocale();

  const [tab, setTab] = useState<Tab>("active");
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);

  const url = `/api/orders?scope=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const { data: orders, isStale } = usePolling<OrderSummary[]>(url, {
    intervalMs: tab === "active" ? 5_000 : 30_000,
  });

  const list = orders ?? [];
  const countFor = (status: OrderStatus | "all") =>
    status === "all" ? list.length : list.filter((order) => order.status === status).length;
  const visible =
    tab === "active" && filter !== "all"
      ? list.filter((order) => order.status === filter)
      : list;

  return (
    <div className="mx-auto w-full max-w-[110rem] px-3 py-4 sm:px-5">
      {/* ============================================================
          SECTION: Toolbar — tabs, search, + New order
          ============================================================ */}
      {/* Below xl: tabs + New order on one row, search full width under
          them (in one row at 1024px the search shrank to ~190px). */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="grid basis-full grid-cols-2 gap-1 rounded-2xl border border-border bg-surface p-1 sm:basis-auto" role="tablist">
          {(["active", "history"] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                setFilter("all");
              }}
              className={cn(
                "h-11 rounded-xl px-4 text-sm font-semibold transition-colors",
                tab === key
                  ? "bg-primary text-on-primary shadow-md"
                  : "text-on-surface-muted hover:bg-surface-container"
              )}
            >
              {key === "active" ? t("orders.activeTab") : t("orders.historyTab")}
            </button>
          ))}
        </div>

        <div className="relative order-last min-w-0 basis-full xl:order-none xl:basis-0 xl:flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-muted" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("orders.searchPlaceholder")}
            aria-label={t("common.search")}
            className="h-13 pl-11 pr-11 text-base"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label={t("pos.clearSearch")}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-on-surface-muted hover:bg-surface-container"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <Link href="/order" className="shrink-0 basis-full sm:ml-auto sm:basis-auto">
          <Button variant="success" size="lg" className="w-full text-base font-bold">
            <Plus className="h-5 w-5" />
            {t("orders.newOrder")}
          </Button>
        </Link>
      </div>

      {/* -- Status chips (open orders only) -- */}
      {tab === "active" && (
        <div className="scrollbar-hide -mx-3 mb-4 flex gap-2 overflow-x-auto px-3 sm:-mx-5 sm:px-5" role="group">
          {ACTIVE_FILTERS.map((status) => {
            const selected = filter === status;
            return (
              <button
                key={status}
                onClick={() => setFilter(status)}
                aria-pressed={selected}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary text-on-primary"
                    : "border-border bg-surface text-on-surface-muted hover:text-on-surface"
                )}
              >
                {status !== "all" && (
                  <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", STATUS_META[status].accentClass)} />
                )}
                {status === "all" ? t("common.all") : STATUS_META[status][locale]}
                <span className={cn("rounded-full px-1.5 font-mono text-xs", selected ? "bg-on-primary/20" : "bg-surface-container-high")}>
                  {countFor(status)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isStale && (
        <p className="mb-3 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">{t("orders.staleData")}</p>
      )}

      {/* ============================================================
          SECTION: Order cards
          ============================================================ */}
      {orders === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={q ? t("orders.noResults") : t("orders.empty")}
          hint={q ? undefined : t("orders.emptyHint")}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// SECTION: Order card
// ============================================================

function OrderCard({ order, locale }: { order: OrderSummary; locale: "en" | "el" }) {
  const t = useT();
  const progress = summaryProgress(order);
  const next = useNextStep(order.status, progress);
  const isOpen = !["completed", "cancelled"].includes(order.status);

  return (
    <Link
      href={`/orders/${order.id}`}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-all hover:border-primary hover:shadow-pop active:scale-[0.99]"
    >
      {/* Name on its own line (full width); number + status share the
          next one and wrap instead of breaking the number apart. */}
      <div>
        <p className="truncate text-lg font-bold leading-tight">{order.customerName ?? "—"}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="whitespace-nowrap font-mono text-sm text-on-surface-muted">{order.orderNumber}</p>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {order.status !== "cancelled" && <ProgressBar progress={progress} />}

      <p className="flex items-center gap-2 text-sm font-medium text-on-surface">
        <next.icon className="h-4 w-4 shrink-0 text-on-surface-muted" aria-hidden />
        <span className="min-w-0 truncate">{next.title}</span>
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5 text-xs text-on-surface-muted">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {isOpen
            ? t("orders.placedAgo", { time: formatAge(order.placedAt) })
            : order.completedAt
              ? t("orders.closedAt", { time: formatRelativeTime(order.completedAt, locale) })
              : formatRelativeTime(order.updatedAt, locale)}
        </span>
        <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </Link>
  );
}
