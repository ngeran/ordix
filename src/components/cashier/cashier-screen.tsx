"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Hammer,
  LayoutGrid,
  Lock,
  PackageCheck,
  Printer,
  Search,
  Table2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { OrderSummary } from "@/types";
import { summaryProgress } from "@/lib/order-status";
import { usePolling } from "@/lib/use-polling";
import { useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { quantityLabel } from "@/components/orders/item-labels";
import { formatAge, ProgressBar } from "@/components/orders/order-visuals";
import { CloseOrderDialog } from "@/components/cashier/close-order-dialog";

// ============================================================
// SECTION: Closure screen (front desk)
// ------------------------------------------------------------
// The front desk's whole job on one page:
//   1. Ready for pickup — big cards with the items to hand over
//      and ONE green "Close order" button each
//   2. Still being made — read-only, with % done, so the desk
//      can answer "is my order ready?" at a glance
//   3. Closed today — the end-of-day tally
// A search box filters all three by customer / order number, and
// a cards ⇄ table switch (remembered per device) trades the big
// touch cards for a dense list on busy days.
// ============================================================

type ClosureView = "cards" | "table";
const VIEW_KEY = "ordix-closure-view";

function readSavedView(): ClosureView {
  try {
    return localStorage.getItem(VIEW_KEY) === "table" ? "table" : "cards";
  } catch {
    return "cards";
  }
}

const timeOfDay = (value: Date | string, locale: "en" | "el") =>
  new Date(value).toLocaleTimeString(locale === "el" ? "el-GR" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

/** True when `date` falls on the device's current calendar day. */
function isToday(date: Date | string | null): boolean {
  if (!date) return false;
  return new Date(date).toDateString() === new Date().toDateString();
}

export function CashierScreen() {
  const t = useT();
  const locale = useLocale();

  const { data: activeOrders, refresh } = usePolling<OrderSummary[]>(
    "/api/orders?scope=active&include=items",
    { intervalMs: 5_000 }
  );
  const { data: historyOrders, refresh: refreshHistory } = usePolling<OrderSummary[]>(
    "/api/orders?scope=history&status=completed",
    { intervalMs: 15_000 }
  );

  const [search, setSearch] = useState("");
  const [closingOrder, setClosingOrder] = useState<OrderSummary | null>(null);
  const [view, setView] = useState<ClosureView>("cards");

  // Restore the saved view after mount (localStorage is client-only).
  useEffect(() => setView(readSavedView()), []);

  const switchView = (next: ClosureView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // storage unavailable — view just won't persist
    }
  };

  const q = search.trim().toLowerCase();
  const matches = (order: OrderSummary) =>
    !q ||
    order.orderNumber.toLowerCase().includes(q) ||
    (order.customerName ?? "").toLowerCase().includes(q);

  const ready = (activeOrders ?? []).filter(
    (order) => order.status === "production_complete" && matches(order)
  );
  const stillWorking = (activeOrders ?? []).filter(
    (order) =>
      (order.status === "placed" || order.status === "in_production") && matches(order)
  );
  const closedToday = (historyOrders ?? []).filter(
    (order) => isToday(order.completedAt) && matches(order)
  );

  return (
    <div className="mx-auto w-full max-w-[110rem] px-3 py-4 sm:px-5">
      {/* ============================================================
          SECTION: Header — counters + search
          ============================================================ */}
      {/* KPIs share a row with search only on very wide screens —
          beside it on a 1024–1366px tablet their labels shrank to "Ε…". */}
      <div className="mb-5 flex flex-col gap-3 short:mb-3 2xl:flex-row 2xl:items-center">
        <div className="grid flex-1 grid-cols-3 gap-2 sm:gap-3">
          <Kpi icon={PackageCheck} tone="text-success bg-success-soft" label={t("cashier.ready")} value={ready.length} />
          <Kpi icon={Hammer} tone="text-warning bg-warning-soft" label={t("cashier.comingSoon")} value={stillWorking.length} />
          <Kpi icon={CheckCircle2} tone="text-primary bg-primary-soft" label={t("cashier.paidToday")} value={closedToday.length} />
        </div>
        <div className="flex gap-2 2xl:w-[28rem]">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-muted" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("cashier.search")}
            aria-label={t("common.search")}
            className="h-14 pl-11 pr-11 text-base"
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
        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-surface p-1" role="group">
          <ViewButton active={view === "cards"} onClick={() => switchView("cards")} label={t("pos.viewCards")} icon={<LayoutGrid className="h-5 w-5" />} />
          <ViewButton active={view === "table"} onClick={() => switchView("table")} label={t("pos.viewTable")} icon={<Table2 className="h-5 w-5" />} />
        </div>
        </div>
      </div>

      {/* ============================================================
          SECTION: Ready for pickup
          ============================================================ */}
      <SectionTitle dot="bg-success" title={t("cashier.ready")} count={ready.length} />
      <p className="-mt-1 mb-3 text-sm text-on-surface-muted">{t("cashier.help")}</p>
      {activeOrders === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : ready.length === 0 ? (
        <div className="mb-8 rounded-2xl border border-dashed border-border">
          <EmptyState icon={ClipboardCheck} title={q ? t("orders.noResults") : t("cashier.empty")} />
        </div>
      ) : view === "table" ? (
        <ClosureTable
          className="mb-8"
          orders={ready}
          columns={[
            customerColumn(t),
            orderColumn(t),
            {
              header: t("cashier.colItems"),
              className: "hidden lg:table-cell",
              cell: (order) => <ItemsSummary order={order} />,
            },
            {
              header: t("cashier.colWaiting"),
              className: "hidden whitespace-nowrap sm:table-cell",
              cell: (order) => (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {formatAge(order.updatedAt)}
                </span>
              ),
            },
            {
              header: "",
              className: "w-px text-right",
              cell: (order) => (
                <div className="flex justify-end gap-2">
                  <PrintSheetButton orderId={order.id} />
                  <Button variant="success" className="font-bold" onClick={() => setClosingOrder(order)}>
                    <Lock className="h-5 w-5" />
                    {t("cashier.close")}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      ) : (
        <ul className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {ready.map((order) => (
            <li key={order.id}>
              <ReadyCard order={order} onClose={() => setClosingOrder(order)} />
            </li>
          ))}
        </ul>
      )}

      {/* ============================================================
          SECTION: Still being made (read-only)
          ============================================================ */}
      {stillWorking.length > 0 && (
        <>
          <SectionTitle dot="bg-warning" title={t("cashier.comingSoon")} count={stillWorking.length} />
          {view === "table" ? (
            <ClosureTable
              className="mb-8"
              orders={stillWorking}
              columns={[
                customerColumn(t),
                orderColumn(t),
                {
                  header: t("cashier.colProgress"),
                  className: "w-48",
                  cell: (order) => <ProgressBar progress={summaryProgress(order)} />,
                },
                {
                  header: t("cashier.colPlaced"),
                  className: "hidden whitespace-nowrap text-on-surface-muted sm:table-cell",
                  cell: (order) => formatAge(order.placedAt),
                },
              ]}
            />
          ) : (
          <ul className="mb-8 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {stillWorking.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="block rounded-2xl border border-border bg-surface p-3.5 transition-colors hover:border-primary"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold">{order.customerName ?? "—"}</span>
                    <span className="shrink-0 font-mono text-xs text-on-surface-muted">{order.orderNumber}</span>
                  </div>
                  <ProgressBar progress={summaryProgress(order)} />
                </Link>
              </li>
            ))}
          </ul>
          )}
        </>
      )}

      {/* ============================================================
          SECTION: Closed today
          ============================================================ */}
      {closedToday.length > 0 && (
        <>
          <SectionTitle dot="bg-primary" title={t("cashier.paidToday")} count={closedToday.length} />
          {view === "table" ? (
            <ClosureTable
              orders={closedToday}
              columns={[
                customerColumn(t),
                orderColumn(t),
                {
                  header: t("cashier.colItems"),
                  className: "hidden text-on-surface-muted sm:table-cell",
                  cell: (order) => itemCount(t, order.itemCount),
                },
                {
                  header: t("cashier.colClosedBy"),
                  className: "hidden whitespace-nowrap text-on-surface-muted md:table-cell",
                  cell: (order) => order.closedByName ?? "—",
                },
                {
                  header: t("cashier.colClosedAt"),
                  className: "whitespace-nowrap text-right",
                  cell: (order) => (
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                      <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                      {order.completedAt ? timeOfDay(order.completedAt, locale) : "—"}
                    </span>
                  ),
                },
              ]}
            />
          ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {closedToday.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-sm transition-colors hover:border-primary"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{order.customerName ?? "—"}</span>
                    <span className="block font-mono text-xs text-on-surface-muted">{order.orderNumber}</span>
                  </span>
                  <span className="shrink-0 text-xs text-on-surface-muted">
                    {order.completedAt ? timeOfDay(order.completedAt, locale) : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          )}
        </>
      )}

      {/* -- Close-order dialog (shared with the order detail page) -- */}
      <CloseOrderDialog
        order={closingOrder}
        onClose={() => setClosingOrder(null)}
        onClosed={() => {
          refresh();
          refreshHistory();
        }}
      />
    </div>
  );
}

// ============================================================
// SECTION: Ready card — who, what to hand over, one button
// ============================================================

function ReadyCard({ order, onClose }: { order: OrderSummary; onClose: () => void }) {
  const t = useT();
  const items = order.items ?? [];
  const shown = items.slice(0, 4);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border-2 border-success/50 bg-surface shadow-card">
      <div className="flex-1 p-4">
        {/* Name gets the full card width; number + "ready since" pill
            share the line below (they wrap rather than squeeze it). */}
        <p className="truncate text-xl font-bold leading-tight">{order.customerName ?? "—"}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <Link
            href={`/orders/${order.id}`}
            className="-my-2 inline-block whitespace-nowrap py-2 font-mono text-sm font-semibold text-primary hover:underline"
          >
            {order.orderNumber}
          </Link>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {t("cashier.readySince", { time: formatAge(order.updatedAt) })}
          </span>
        </div>

        <ul className="mt-3 space-y-1 text-sm">
          {shown.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate">{item.name}</span>
              <span className="shrink-0 font-semibold">{quantityLabel(item, t)}</span>
            </li>
          ))}
          {items.length > shown.length && (
            <li className="text-xs text-on-surface-muted">
              {t("display.more", { count: items.length - shown.length })}
            </li>
          )}
        </ul>
      </div>

      {/* Close (main action) + order sheet for the hand-over. */}
      <div className="flex gap-2 border-t border-border bg-surface-container-low p-3">
        <Button variant="success" size="xl" className="min-w-0 flex-1 text-lg font-bold" onClick={onClose}>
          <Lock className="h-6 w-6 shrink-0" />
          <span className="truncate">{t("cashier.close")}</span>
        </Button>
        <PrintSheetButton orderId={order.id} size="xl" />
      </div>
    </article>
  );
}

// ============================================================
// SECTION: Table view
// ------------------------------------------------------------
// One column-driven table for all three sections; columns hide
// progressively on narrow screens (customer + action always
// stay). The customer cell carries the order number on phones,
// where the Order column is hidden.
// ============================================================

type Translate = ReturnType<typeof useT>;

interface Column {
  header: string;
  className?: string;
  cell: (order: OrderSummary) => React.ReactNode;
}

function ClosureTable({
  orders,
  columns,
  className,
}: {
  orders: OrderSummary[];
  columns: Column[];
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-border bg-surface", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-on-surface-muted">
            {columns.map((column, index) => (
              <th key={index} className={cn("px-3 py-2.5", column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.id}
              className="border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface-container-low"
            >
              {columns.map((column, index) => (
                <td key={index} className={cn("px-3 py-2", column.className)}>
                  {column.cell(order)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const itemCount = (t: Translate, count: number) =>
  count === 1 ? t("cashier.itemCountOne") : t("cashier.itemCount", { count });

const customerColumn = (t: Translate): Column => ({
  header: t("cashier.colCustomer"),
  // max-w-0 + w-full: take the spare width and truncate long names
  // instead of pushing the table wider than the screen.
  className: "w-full max-w-0",
  cell: (order) => (
    <Link href={`/orders/${order.id}`} className="block min-w-0 hover:text-primary">
      <span className="block truncate font-semibold">{order.customerName ?? "—"}</span>
      <span className="block font-mono text-xs text-on-surface-muted sm:hidden">{order.orderNumber}</span>
    </Link>
  ),
});

const orderColumn = (t: Translate): Column => ({
  header: t("cashier.colOrder"),
  className: "hidden whitespace-nowrap sm:table-cell",
  cell: (order) => (
    <Link href={`/orders/${order.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">
      {order.orderNumber}
    </Link>
  ),
});

/** "3 items · Widget, Bolt +1" — fits one table row. */
function ItemsSummary({ order }: { order: OrderSummary }) {
  const t = useT();
  const items = order.items ?? [];
  const names = items.slice(0, 2).map((item) => item.name).join(", ");
  return (
    <span className="block max-w-[min(28rem,20vw)] truncate text-on-surface-muted">
      <span className="font-semibold text-on-surface">{itemCount(t, items.length)}</span>
      {names && ` · ${names}`}
      {items.length > 2 && ` +${items.length - 2}`}
    </span>
  );
}

// ============================================================
// SECTION: Small building blocks
// ============================================================

/** Square icon link to the printable order sheet (print / PDF). */
function PrintSheetButton({ orderId, size = "md" }: { orderId: string; size?: "md" | "xl" }) {
  const t = useT();
  return (
    <Link
      href={`/orders/${orderId}/print`}
      aria-label={t("detail.print")}
      title={t("detail.print")}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-on-surface transition-colors hover:border-primary hover:text-primary",
        size === "xl" ? "h-16 w-16" : "h-12 w-12"
      )}
    >
      <Printer className={size === "xl" ? "h-6 w-6" : "h-5 w-5"} />
    </Link>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-lg transition-colors",
        active ? "bg-primary text-on-primary" : "text-on-surface-muted hover:bg-surface-container-high hover:text-on-surface"
      )}
    >
      {icon}
    </button>
  );
}

function Kpi({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
      <span className={cn("hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:flex", tone)}>
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-2xl font-bold leading-none tabular-nums">{value}</p>
        <p className="mt-1 truncate text-xs font-medium text-on-surface-muted">{label}</p>
      </div>
    </div>
  );
}

function SectionTitle({ dot, title, count }: { dot: string; title: string; count: number }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-on-surface">
      <span aria-hidden className={cn("h-3 w-3 rounded-full", dot)} />
      {title}
      <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono text-xs">{count}</span>
    </h2>
  );
}
