"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChefHat,
  CheckCircle2,
  Clock,
  Hammer,
  HelpCircle,
  PackageCheck,
  Pause,
  Play,
  StickyNote,
  Undo2,
} from "lucide-react";
import type { OrderItem } from "@/db/schema";
import type { OrderSummary } from "@/types";
import { api, showErrorToast } from "@/lib/api-client";
import { itemsProgress, type ProductionProgress } from "@/lib/order-status";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/orders/status-badge";
import { quantityLabel } from "@/components/orders/item-labels";
import {
  formatAge,
  ItemStatePill,
  ProgressBar,
} from "@/components/orders/order-visuals";

// ============================================================
// SECTION: Production board (production manager)
// ------------------------------------------------------------
// THREE LANES, decided by what the ITEMS are doing (never by a
// status someone clicked), so this board and the order page
// always agree:
//   Not started    — no item started yet
//   Being made     — at least one item started, not all done
//   Ready to finish— every item done → big "Order complete"
//                    button hands the order to the front desk
//
// One button per item, always the next step:
//   Start → Mark done → (Done ✓, with Undo for mis-taps)
// On-hold orders stay in their lane, greyed, with no buttons.
// A per-item `pending` set blocks double taps while in flight.
// ============================================================

type Lane = "notStarted" | "making" | "ready";
type ItemAction = "send_to_production" | "complete_production" | "undo_production";

interface BoardOrder {
  order: OrderSummary;
  progress: ProductionProgress;
  lane: Lane;
}

function laneOf(progress: ProductionProgress): Lane {
  if (progress.allDone) return "ready";
  if (progress.making === 0 && progress.done === 0) return "notStarted";
  return "making";
}

export function ProductionBoard() {
  const t = useT();
  const { data: activeOrders, refresh } = usePolling<OrderSummary[]>(
    "/api/orders?scope=active&include=items",
    { intervalMs: 5_000 }
  );

  const board: BoardOrder[] = (activeOrders ?? [])
    .filter((order) =>
      ["placed", "in_production", "on_hold"].includes(order.status)
    )
    .map((order) => {
      const progress = itemsProgress(order.items ?? []);
      return { order, progress, lane: laneOf(progress) };
    });

  const lanes: Record<Lane, BoardOrder[]> = {
    notStarted: board.filter((entry) => entry.lane === "notStarted"),
    making: board.filter((entry) => entry.lane === "making"),
    ready: board.filter((entry) => entry.lane === "ready"),
  };

  // -- Phones/tablets show one lane at a time (tabs) --
  const [mobileLane, setMobileLane] = useState<Lane>("notStarted");
  const [helpOpen, setHelpOpen] = useState(false);

  // First load: open the lane where work is waiting (ready to
  // finish beats being made beats not started).
  const loaded = activeOrders !== null;
  useEffect(() => {
    if (!loaded) return;
    if (lanes.ready.length > 0) setMobileLane("ready");
    else if (lanes.making.length > 0) setMobileLane("making");
    // Only on the first successful load — afterwards it's the user's tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // -- Per-key in-flight guard (item ids + "order:<id>") --
  const [pending, setPending] = useState<Set<string>>(new Set());
  const markPending = (keys: string[], on: boolean) => {
    setPending((previous) => {
      const next = new Set(previous);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  // ============================================================
  // SECTION: Mutations
  // ============================================================

  const itemAction = async (orderId: string, item: OrderItem, action: ItemAction) => {
    markPending([item.id], true);
    try {
      await api.post(`/api/orders/${orderId}/items/${item.id}`, { action });
      refresh();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      markPending([item.id], false);
    }
  };

  // Bulk start: FIRST request serially (it flips placed →
  // in_production server-side), the rest in parallel.
  const startAll = async (order: OrderSummary) => {
    const targets = (order.items ?? []).filter(
      (item) => item.status === "active" && item.productionStatus === "pending"
    );
    if (targets.length === 0) return;
    const ids = targets.map((item) => item.id);
    markPending(ids, true);
    try {
      await api.post(`/api/orders/${order.id}/items/${targets[0].id}`, {
        action: "send_to_production",
      });
      const results = await Promise.allSettled(
        targets.slice(1).map((item) =>
          api.post(`/api/orders/${order.id}/items/${item.id}`, {
            action: "send_to_production",
          })
        )
      );
      const failures = results.filter((r) => r.status === "rejected").length;
      if (failures > 0) toast.error(t("production.failed", { count: failures }));
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      markPending(ids, false);
      refresh();
    }
  };

  const doneAll = async (order: OrderSummary) => {
    const targets = (order.items ?? []).filter(
      (item) => item.status === "active" && item.productionStatus === "in_production"
    );
    if (targets.length === 0) return;
    const ids = targets.map((item) => item.id);
    markPending(ids, true);
    const results = await Promise.allSettled(
      targets.map((item) =>
        api.post(`/api/orders/${order.id}/items/${item.id}`, {
          action: "complete_production",
        })
      )
    );
    markPending(ids, false);
    const failures = results.filter((r) => r.status === "rejected").length;
    if (failures > 0) toast.error(t("production.failed", { count: failures }));
    refresh();
  };

  // The deliberate hand-off: production → front desk.
  const completeOrder = async (order: OrderSummary) => {
    const key = `order:${order.id}`;
    markPending([key], true);
    try {
      await api.post(`/api/orders/${order.id}/status`, {
        status: "production_complete",
      });
      toast.success(t("production.returned", { number: order.orderNumber }));
      refresh();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      markPending([key], false);
    }
  };

  // ============================================================
  // SECTION: Render
  // ============================================================

  const laneMeta: Record<Lane, { title: string; dot: string; icon: typeof Clock }> = {
    notStarted: { title: t("production.queue"), dot: "bg-sky-500", icon: Clock },
    making: { title: t("production.working"), dot: "bg-warning", icon: Hammer },
    ready: { title: t("production.laneReady"), dot: "bg-success", icon: PackageCheck },
  };
  const laneOrder: Lane[] = ["notStarted", "making", "ready"];

  const renderCard = (entry: BoardOrder) => (
    <ProductionCard
      key={entry.order.id}
      entry={entry}
      pending={pending}
      onItemAction={itemAction}
      onStartAll={startAll}
      onDoneAll={doneAll}
      onComplete={completeOrder}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ============================================================
          SECTION: Header — live pill, help, lane tabs (small screens)
          ============================================================ */}
      <div className="shrink-0 border-b border-border bg-surface-container-low px-3 py-3 short:py-1.5 sm:px-5">
        {/* Short landscape: live pill, help and tabs share ONE row */}
        <div className="flex flex-col short:flex-row short:items-center short:gap-2">
        <div className="flex flex-wrap items-center gap-2 short:shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-success">
            <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-success" />
            {t("production.live")}
          </span>
          <button
            type="button"
            onClick={() => setHelpOpen((open) => !open)}
            aria-expanded={helpOpen}
            className="ml-auto inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-on-surface-muted hover:bg-surface-container short:ml-0"
          >
            <HelpCircle className="h-5 w-5" />
            <span className="hidden sm:inline short:hidden">{t("next.label")}</span>
          </button>
        </div>

        {/* Lane tabs — below lg only */}
        <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-2xl bg-surface p-1.5 short:mt-0 short:min-w-0 short:flex-1 lg:hidden" role="tablist">
          {laneOrder.map((lane) => (
            <button
              key={lane}
              role="tab"
              aria-selected={mobileLane === lane}
              onClick={() => setMobileLane(lane)}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-xs font-semibold leading-tight transition-colors short:min-h-11 short:flex-row short:gap-2 short:py-1 sm:flex-row sm:gap-2 sm:text-sm",
                mobileLane === lane
                  ? "bg-primary text-on-primary shadow-md"
                  : "text-on-surface-muted hover:bg-surface-container"
              )}
            >
              <span className="text-center">{laneMeta[lane].title}</span>
              <span
                className={cn(
                  "mt-0.5 rounded-full px-2 font-mono text-sm font-bold short:mt-0 sm:mt-0",
                  mobileLane === lane ? "bg-on-primary/20" : "bg-surface-container-high"
                )}
              >
                {lanes[lane].length}
              </span>
            </button>
          ))}
        </div>
        </div>
        {helpOpen && (
          <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-sm text-on-surface">
            {t("production.help")}
          </p>
        )}

      </div>

      {/* ============================================================
          SECTION: Lanes
          ============================================================ */}
      {activeOrders === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : board.length === 0 ? (
        <EmptyState icon={ChefHat} title={t("production.empty")} hint={t("orders.emptyHint")} />
      ) : (
        <>
          {/* Small screens: the selected lane, cards in a responsive grid */}
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:hidden">
            {lanes[mobileLane].length === 0 ? (
              <p className="py-16 text-center text-on-surface-muted">{t("production.laneEmpty")}</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">{lanes[mobileLane].map(renderCard)}</div>
            )}
          </div>

          {/* lg+: all three lanes side by side, each scrolls on its own */}
          {/* Empty lanes shrink to a narrow strip so busy ones get the room */}
          <div
            className="hidden min-h-0 flex-1 gap-4 p-4 lg:grid"
            style={{
              gridTemplateColumns: laneOrder
                .map((lane) => (lanes[lane].length === 0 ? "minmax(13.5rem,0.45fr)" : "minmax(0,1fr)"))
                .join(" "),
            }}
          >
            {laneOrder.map((lane) => {
              const meta = laneMeta[lane];
              return (
                <section
                  key={lane}
                  aria-label={meta.title}
                  className={cn(
                    "flex min-h-0 flex-col rounded-2xl border border-border bg-surface-container-lowest",
                    lane === "ready" && lanes.ready.length > 0 && "border-success/50"
                  )}
                >
                  <h2 className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 text-xs font-bold uppercase leading-tight tracking-wide xl:text-sm">
                    <span aria-hidden className={cn("h-3 w-3 shrink-0 rounded-full", meta.dot)} />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{meta.title}</span>
                    <span className="ml-auto shrink-0 rounded-full bg-surface-container-high px-2.5 py-0.5 font-mono text-sm">
                      {lanes[lane].length}
                    </span>
                  </h2>
                  <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                    {lanes[lane].length === 0 ? (
                      <p className="py-10 text-center text-sm text-on-surface-muted">
                        {t("production.laneEmpty")}
                      </p>
                    ) : (
                      lanes[lane].map(renderCard)
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// SECTION: Production card (one order, its items stacked inside)
// ============================================================

function ProductionCard({
  entry,
  pending,
  onItemAction,
  onStartAll,
  onDoneAll,
  onComplete,
}: {
  entry: BoardOrder;
  pending: Set<string>;
  onItemAction: (orderId: string, item: OrderItem, action: ItemAction) => void;
  onStartAll: (order: OrderSummary) => void;
  onDoneAll: (order: OrderSummary) => void;
  onComplete: (order: OrderSummary) => void;
}) {
  const t = useT();
  const { order, progress, lane } = entry;
  const onHold = order.status === "on_hold";
  const items = order.items ?? [];

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface shadow-card",
        lane === "ready" && !onHold ? "border-success/60" : "border-border",
        onHold && "opacity-70"
      )}
    >
      {/* -- Header: number, customer, age, progress -- */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/orders/${order.id}`}
              className="-my-2.5 inline-block whitespace-nowrap py-2.5 font-mono text-base font-extrabold tracking-tight hover:text-primary xl:text-lg"
            >
              {order.orderNumber}
            </Link>
            <p className="line-clamp-2 break-words text-sm font-medium text-on-surface-muted">
              {order.customerName ?? "—"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {onHold && <StatusBadge status={order.status} />}
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {formatAge(order.placedAt)}
            </span>
          </div>
        </div>
        <ProgressBar progress={progress} className="mt-2.5" />
        {order.notes && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-info-soft px-2.5 py-1.5 text-sm text-info">
            <StickyNote className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {order.notes}
          </p>
        )}
      </div>

      {/* -- Items -- */}
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            busy={pending.has(item.id)}
            locked={onHold}
            onAction={(action) => onItemAction(order.id, item, action)}
          />
        ))}
      </ul>

      {/* -- Footer: bulk actions / the hand-off button -- */}
      {!onHold && (
        <div className="space-y-2 border-t border-border bg-surface-container-low p-3">
          {lane === "ready" ? (
            <Button
              variant="success"
              size="xl"
              className="animate-soft-pulse h-auto min-h-16 w-full whitespace-normal py-3 text-lg font-bold"
              loading={pending.has(`order:${order.id}`)}
              onClick={() => onComplete(order)}
            >
              <PackageCheck className="h-7 w-7 shrink-0" />
              {t("production.finishOrder")}
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {progress.waiting > 0 && (
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => onStartAll(order)}
                >
                  <Play className="h-5 w-5" />
                  {t("production.sendAll")} ({progress.waiting})
                </Button>
              )}
              {progress.making > 0 && (
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => onDoneAll(order)}
                >
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  {t("production.completeAll")} ({progress.making})
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {onHold && (
        <p className="flex items-center gap-2 border-t border-border bg-warning-soft px-4 py-2.5 text-sm font-medium text-warning">
          <Pause className="h-4 w-4" aria-hidden />
          {t("next.holdWho")}
        </p>
      )}
    </article>
  );
}

// ============================================================
// SECTION: Item row — always ONE next-step button
// ============================================================

function ItemRow({
  item,
  busy,
  locked,
  onAction,
}: {
  item: OrderItem;
  busy: boolean;
  locked: boolean;
  onAction: (action: ItemAction) => void;
}) {
  const t = useT();
  const state = item.productionStatus;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3",
        state === "in_production" && "bg-warning-soft/50"
      )}
    >
      <div className="min-w-[9rem] flex-1">
        <p
          className={cn(
            "font-semibold leading-snug [overflow-wrap:anywhere]",
            state === "completed" && "text-on-surface-muted line-through decoration-2"
          )}
        >
          {item.name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-bold text-on-surface">{quantityLabel(item, t)}</span>
          <span className="font-mono text-xs text-on-surface-muted">{item.partNumber}</span>
        </p>
        {item.note && (
          <p className="mt-1 flex items-start gap-1 text-xs text-info">
            <StickyNote className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {item.note}
          </p>
        )}
      </div>

      {/* The one obvious button (wraps under the name in narrow lanes) */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {!locked && state === "pending" && (
          <Button
            size="lg"
            loading={busy}
            onClick={() => onAction("send_to_production")}
            className="h-14 px-5 font-bold"
          >
            <Play className="h-5 w-5" />
            {t("production.send")}
          </Button>
        )}
        {!locked && state === "in_production" && (
          <>
            <UndoButton busy={busy} onClick={() => onAction("undo_production")} />
            <Button
              size="lg"
              variant="success"
              loading={busy}
              onClick={() => onAction("complete_production")}
              className="h-14 px-5 font-bold"
            >
              <CheckCircle2 className="h-5 w-5" />
              {t("production.completeItem")}
            </Button>
          </>
        )}
        {state === "completed" && (
          <>
            {!locked && <UndoButton busy={busy} onClick={() => onAction("undo_production")} />}
            <ItemStatePill state={state} className="px-3 py-2 text-sm" />
          </>
        )}
        {locked && state !== "completed" && <ItemStatePill state={state} />}
      </div>
    </li>
  );
}

function UndoButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <Button
      variant="ghost"
      size="iconSm"
      disabled={busy}
      onClick={onClick}
      aria-label={t("production.undo")}
      title={t("production.undo")}
      className="h-11 w-11 shrink-0 text-on-surface-muted"
    >
      <Undo2 className="h-5 w-5" />
    </Button>
  );
}
