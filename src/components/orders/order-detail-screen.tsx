"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Check,
  Clock,
  Factory,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  PackageCheck,
  Pause,
  Phone,
  Printer,
  Play,
  Plus,
  StickyNote,
  Trash2,
  UserRound,
} from "lucide-react";
import type { OrderItem, OrderStatus } from "@/db/schema";
import type { OrdixSessionUser, OrderDetail as OrderDetailData } from "@/types";
import {
  allowedTransitions,
  canAppendItems,
  canChangeItem,
  itemsProgress,
  ORDER_MAIN_FLOW,
  STATUS_META,
  type ProductionProgress,
} from "@/lib/order-status";
import { CloseOrderDialog } from "@/components/cashier/close-order-dialog";
import { usePolling } from "@/lib/use-polling";
import { api, showErrorToast } from "@/lib/api-client";
import { useLocale, useT } from "@/lib/i18n";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { LoadingArea } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/orders/status-badge";
import { quantityLabel } from "@/components/orders/item-labels";
import { OrderTimeline } from "@/components/orders/order-timeline";
import {
  ItemStatePill,
  NextStepBanner,
  ProgressBar,
  ProgressLegend,
} from "@/components/orders/order-visuals";

// ============================================================
// SECTION: Order detail screen
// ------------------------------------------------------------
// Answers three questions, top to bottom:
//   1. Whose order is it and where is it?   (hero + stepper)
//   2. What happens next, and who does it?  (banner + ONE button)
//   3. What's in it, item by item?          (grouped by state)
// …then the plain-language timeline. Every number comes from the
// shared itemsProgress(), the same formula the Production board
// uses, so the two screens can never disagree.
// The generic "advance status" button is gone on purpose: the
// order moves only through the real work (starting items, the
// manager's "Order complete", the front desk's close).
// ============================================================

export function OrderDetailScreen({
  orderId,
}: {
  orderId: string;
  user: OrdixSessionUser | null;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();

  const { data: order, refresh } = usePolling<OrderDetailData>(
    `/api/orders/${orderId}`,
    { intervalMs: 5_000 }
  );

  // NOTE: every hook MUST sit above the `if (!order)` early return
  // (React error #310 — hook count changes between renders).
  const [busy, setBusy] = useState(false);
  const [voidingItem, setVoidingItem] = useState<OrderItem | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [closingOrder, setClosingOrder] = useState(false);

  if (!order) {
    return <LoadingArea label={t("common.loading")} />;
  }

  const activeItems = order.items.filter((item) => item.status === "active");
  const removedItems = order.items.filter((item) => item.status === "voided");
  const progress = itemsProgress(order.items);
  const editable = canChangeItem(order.status);
  const canAppend = canAppendItems(order.status);
  const allowed = allowedTransitions(order.status);

  // ============================================================
  // SECTION: Mutations
  // ============================================================

  const transition = async (status: OrderStatus, note?: string, success?: string) => {
    setBusy(true);
    try {
      await api.post(`/api/orders/${orderId}/status`, { status, note });
      if (success) toast.success(success);
      refresh();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const voidItem = async (reason: string) => {
    if (!voidingItem) return;
    setBusy(true);
    try {
      await api.post(`/api/orders/${orderId}/items/${voidingItem.id}`, {
        action: "void",
        reason,
      });
      toast.success(t("detail.itemVoided"));
      setVoidingItem(null);
      refresh();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const startAppend = () => {
    useCartStore.getState().startAppend(order.id, order.orderNumber);
    router.push("/order");
  };

  // Resume to wherever the work really is.
  const resumeTarget: OrderStatus =
    progress.making + progress.done > 0 ? "in_production" : "placed";

  // ============================================================
  // SECTION: The ONE primary action for the current situation
  // ============================================================

  let primary: React.ReactNode = null;
  if (order.status === "production_complete") {
    primary = (
      <Button variant="success" size="xl" className="w-full text-lg" disabled={busy} onClick={() => setClosingOrder(true)}>
        <Lock className="h-6 w-6" />
        {t("cashier.close")}
      </Button>
    );
  } else if (order.status === "in_production" && progress.allDone) {
    primary = (
      <Button
        variant="success"
        size="xl"
        className="animate-soft-pulse h-auto min-h-16 w-full whitespace-normal py-3 text-lg"
        loading={busy}
        onClick={() =>
          transition("production_complete", undefined, t("production.returned", { number: order.orderNumber }))
        }
      >
        <PackageCheck className="h-6 w-6 shrink-0" />
        {t("production.finishOrder")}
      </Button>
    );
  } else if (order.status === "placed" || order.status === "in_production") {
    primary = (
      <Link href="/production" className="block w-full">
        <Button variant="secondary" size="xl" className="w-full text-lg">
          <Factory className="h-6 w-6" />
          {t("detail.openProduction")}
        </Button>
      </Link>
    );
  } else if (order.status === "on_hold") {
    primary = (
      <Button size="xl" className="w-full text-lg" loading={busy} onClick={() => transition(resumeTarget)}>
        <Play className="h-6 w-6" />
        {t("detail.resume")}
      </Button>
    );
  }

  const canHold = allowed.includes("on_hold");
  const canCancel = allowed.includes("cancelled");
  const hasOtherActions = canAppend || canHold || canCancel;

  // ============================================================
  // SECTION: Render
  // ============================================================

  // Items grouped by what's happening to them (busiest first).
  const groups: Array<{ state: string; items: OrderItem[] }> = [
    { state: "in_production", items: activeItems.filter((i) => i.productionStatus === "in_production") },
    { state: "pending", items: activeItems.filter((i) => i.productionStatus === "pending") },
    { state: "completed", items: activeItems.filter((i) => i.productionStatus === "completed") },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto w-full max-w-[96rem] px-3 py-4 sm:px-5">
      <Link
        href="/orders"
        className="mb-3 inline-flex h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-on-surface-muted hover:bg-surface-container-low hover:text-on-surface"
      >
        <ArrowLeft className="h-5 w-5" />
        {t("detail.back")}
      </Link>

      {/* ============================================================
          SECTION: Hero — who, which order, where it is
          ============================================================ */}
      <section className="mb-4 overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[1fr_minmax(15rem,17rem)] lg:grid-cols-[1fr_minmax(18rem,26rem)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={order.status} />
              <span className="font-mono text-sm font-semibold text-on-surface-muted">{order.orderNumber}</span>
              {/* Order sheet: print or save as PDF (any stage). */}
              <Link href={`/orders/${order.id}/print`} className="ml-auto">
                <Button variant="outline" size="sm">
                  <Printer className="h-4 w-4" />
                  {t("detail.print")}
                </Button>
              </Link>
            </div>
            <h1 className="mt-1.5 text-2xl font-bold leading-tight [overflow-wrap:anywhere] sm:text-3xl">
              {order.customerName ?? "—"}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-on-surface-muted">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" aria-hidden />
                {formatDateTime(order.placedAt, locale)} · {formatRelativeTime(order.placedAt, locale)}
              </span>
              {order.createdByName && (
                <span className="flex items-center gap-1.5">
                  <UserRound className="h-4 w-4" aria-hidden />
                  {t("detail.takenBy", { name: order.createdByName })}
                </span>
              )}
              {order.completedAt && (
                <span className="flex items-center gap-1.5 font-medium text-success">
                  <Lock className="h-4 w-4" aria-hidden />
                  {t("detail.closedInfo", { time: formatDateTime(order.completedAt, locale) })}
                </span>
              )}
            </div>
          </div>

          {order.status !== "cancelled" && (
            <div className="rounded-2xl bg-surface-container-low p-3.5">
              <ProgressBar progress={progress} size="lg" />
              <ProgressLegend progress={progress} className="mt-3" />
            </div>
          )}
        </div>

        <StatusStepper order={order} progress={progress} />
      </section>

      {/* ============================================================
          SECTION: What happens next + the one button
          ============================================================ */}
      {/* Banner spans the row when there's no action; with one, the
          button stretches to the banner's height (no floating). */}
      <div
        className={cn(
          "mb-4 grid gap-3",
          primary && "md:grid-cols-[1fr_minmax(15rem,17rem)] md:items-stretch lg:grid-cols-[1fr_minmax(18rem,26rem)]"
        )}
      >
        <NextStepBanner status={order.status} progress={progress} />
        {primary && <div className="flex [&>button]:h-full [&>button]:min-h-16">{primary}</div>}
      </div>

      {order.status === "cancelled" && order.cancelReason && (
        <p className="mb-4 rounded-2xl bg-error-soft px-4 py-3 text-sm font-medium text-error">
          {t("detail.orderCancelled")}: {order.cancelReason}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_minmax(15rem,17rem)] lg:grid-cols-[1fr_minmax(18rem,26rem)]">
        {/* ============================================================
            SECTION: Items, grouped by state
            ============================================================ */}
        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-border bg-surface shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="font-bold">
                {t("detail.items")} · {activeItems.length}
              </h2>
              {canAppend && (
                <Button variant="secondary" size="sm" onClick={startAppend}>
                  <Plus className="h-4 w-4" />
                  {t("detail.appendItems")}
                </Button>
              )}
            </div>

            {editable && progress.waiting > 0 && (
              <p className="border-b border-border bg-surface-container-low px-4 py-2 text-xs text-on-surface-muted">
                {t("detail.editQtyHint")}
              </p>
            )}

            {groups.map((group) => (
              <div key={group.state}>
                <div className="flex items-center gap-2 bg-surface-container-low/60 px-4 py-2">
                  <ItemStatePill state={group.state} />
                  <span className="font-mono text-xs text-on-surface-muted">{group.items.length}</span>
                </div>
                <ul className="divide-y divide-border">
                  {group.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      orderId={orderId}
                      item={item}
                      editable={editable && item.productionStatus === "pending"}
                      userNames={order.userNames}
                      onSaved={refresh}
                      onRemove={() => setVoidingItem(item)}
                    />
                  ))}
                </ul>
              </div>
            ))}

            {removedItems.length > 0 && (
              <details className="group border-t border-border">
                <summary className="flex h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-on-surface-muted [&::-webkit-details-marker]:hidden">
                  <Trash2 className="h-4 w-4" aria-hidden />
                  {t("detail.removedItems", { count: removedItems.length })}
                </summary>
                <ul className="divide-y divide-border opacity-70">
                  {removedItems.map((item) => (
                    <li key={item.id} className="px-4 py-2.5 text-sm">
                      <p className="font-medium line-through">
                        {item.name} · {quantityLabel(item, t)}
                      </p>
                      <p className="text-xs text-error">
                        {item.voidReason}
                        {item.voidNote ? ` — ${item.voidNote}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <OrderTimeline events={order.events} />
        </div>

        {/* ============================================================
            SECTION: Aside — customer, notes, other actions
            ============================================================ */}
        <aside className="space-y-4">
          <PeopleCard order={order} />

          {order.customer && (
            <section className="rounded-2xl border border-border bg-surface p-4 shadow-card">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-muted">
                {t("detail.customer")}
              </h2>
              <p className="text-lg font-bold">{order.customer.name}</p>
              <ul className="mt-2 space-y-2 text-sm">
                {order.customer.phone && (
                  <li>
                    <a
                      href={`tel:${order.customer.phone}`}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-soft px-3 font-semibold text-primary"
                    >
                      <Phone className="h-4 w-4" aria-hidden />
                      {order.customer.phone}
                    </a>
                  </li>
                )}
                {order.customer.address && (
                  <li className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-muted" aria-hidden />
                    {order.customer.address}
                  </li>
                )}
                {order.customer.email && (
                  <li className="flex items-start gap-2 break-all">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-muted" aria-hidden />
                    {order.customer.email}
                  </li>
                )}
                {order.customer.comments && (
                  <li className="flex items-start gap-2 italic text-on-surface-muted">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {order.customer.comments}
                  </li>
                )}
              </ul>
            </section>
          )}

          {order.notes && (
            <section className="rounded-2xl border border-info/30 bg-info-soft p-4">
              <h2 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-info">
                <StickyNote className="h-4 w-4" aria-hidden />
                {t("detail.orderNotes")}
              </h2>
              <p className="whitespace-pre-wrap text-sm">{order.notes}</p>
            </section>
          )}

          {hasOtherActions && (
            <section className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-card">
              <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-on-surface-muted">
                {t("detail.moreActions")}
              </h2>
              {canAppend && (
                <Button variant="secondary" className="w-full justify-start" onClick={startAppend}>
                  <Plus className="h-5 w-5" />
                  {t("detail.appendItems")}
                </Button>
              )}
              {canHold && (
                <Button variant="secondary" className="w-full justify-start" disabled={busy} onClick={() => transition("on_hold")}>
                  <Pause className="h-5 w-5" />
                  {t("detail.hold")}
                </Button>
              )}
              {canCancel && (
                <Button variant="outline" className="w-full justify-start text-error" disabled={busy} onClick={() => setCancelOpen(true)}>
                  <Ban className="h-5 w-5" />
                  {t("detail.cancelOrder")}
                </Button>
              )}
            </section>
          )}
        </aside>
      </div>

      {/* ============================================================
          SECTION: Dialogs
          ============================================================ */}
      <VoidItemDialog
        item={voidingItem}
        busy={busy}
        onClose={() => setVoidingItem(null)}
        onConfirm={voidItem}
      />

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t("detail.cancelTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={cancelReason.trim().length < 3}
              onClick={() => {
                setCancelOpen(false);
                const reason = cancelReason.trim();
                setCancelReason("");
                void transition("cancelled", reason);
              }}
            >
              {t("detail.cancelOrder")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-on-surface-muted">{t("detail.confirmCancel")}</p>
          <Field label={t("detail.voidReasonLabel")} htmlFor="cancel-reason">
            <Input
              id="cancel-reason"
              autoFocus
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder={t("detail.voidReasonPlaceholder")}
            />
          </Field>
        </div>
      </Dialog>

      <CloseOrderDialog
        order={
          closingOrder
            ? { id: order.id, orderNumber: order.orderNumber, customerName: order.customerName, items: order.items }
            : null
        }
        onClose={() => setClosingOrder(false)}
        onClosed={refresh}
      />
    </div>
  );
}

// ============================================================
// SECTION: Lifecycle stepper (with the time each step happened)
// ============================================================

function StatusStepper({
  order,
  progress,
}: {
  order: OrderDetailData;
  progress: ProductionProgress;
}) {
  const locale = useLocale();
  if (order.status === "cancelled") return null;

  // On hold: show where the work really stands.
  let currentIndex = ORDER_MAIN_FLOW.indexOf(order.status);
  if (order.status === "on_hold") {
    currentIndex = progress.making + progress.done > 0 ? 1 : 0;
  }
  if (currentIndex < 0) return null; // legacy stages

  const lastEventAt = (status: OrderStatus) => {
    const hits = order.events.filter((e) => e.toStatus === status && e.fromStatus !== status);
    return hits.length > 0 ? hits[hits.length - 1].createdAt : null;
  };
  const stepTime: Record<string, Date | string | null> = {
    placed: order.placedAt,
    in_production: order.productionStartedAt ?? lastEventAt("in_production"),
    production_complete: lastEventAt("production_complete"),
    completed: order.completedAt,
  };
  const intlLocale = locale === "el" ? "el-GR" : "en-GB";

  return (
    <ol className="grid grid-cols-4 border-t border-border bg-surface-container-low/50">
      {ORDER_MAIN_FLOW.map((stage, index) => {
        const done = index < currentIndex || (index === currentIndex && order.status === "completed");
        const current = index === currentIndex && !done;
        const time = index <= currentIndex ? stepTime[stage] : null;
        return (
          <li key={stage} className="relative flex flex-col items-center px-1 py-3 text-center">
            {/* connector */}
            {index > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute right-1/2 top-[1.65rem] h-1 w-full -translate-y-1/2",
                  index <= currentIndex ? "bg-success" : "bg-border"
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold",
                done
                  ? "bg-success text-white"
                  : current
                    ? order.status === "on_hold"
                      ? "bg-orange-500 text-white"
                      : "bg-primary text-on-primary"
                    : "bg-surface-container-highest text-on-surface-muted"
              )}
            >
              {done ? <Check className="h-4 w-4" /> : order.status === "on_hold" && current ? <Pause className="h-4 w-4" /> : index + 1}
            </span>
            <span
              className={cn(
                "mt-1.5 text-xs font-semibold leading-tight sm:text-sm",
                current ? "text-on-surface" : done ? "text-on-surface" : "text-on-surface-muted"
              )}
              aria-current={current ? "step" : undefined}
            >
              {STATUS_META[stage][locale]}
            </span>
            <span className="mt-0.5 min-h-4 whitespace-nowrap text-xs text-on-surface-muted">
              {time
                ? new Date(time).toLocaleString(intlLocale, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ============================================================
// SECTION: Item row
// ============================================================

function ItemRow({
  orderId,
  item,
  editable,
  userNames,
  onSaved,
  onRemove,
}: {
  orderId: string;
  item: OrderItem;
  editable: boolean;
  userNames: Record<string, string>;
  onSaved: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const locale = useLocale();

  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold leading-snug [overflow-wrap:anywhere]", item.productionStatus === "completed" && "text-on-surface-muted")}>
          {item.name}
          {item.round > 1 && (
            <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 align-middle text-[11px] font-semibold text-primary">
              {t("detail.round", { round: item.round })}
            </span>
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-bold">{quantityLabel(item, t)}</span>
          <span className="font-mono text-xs text-on-surface-muted">{item.partNumber}</span>
        </p>
        {item.note && (
          <p className="mt-1 flex items-start gap-1 text-xs text-info">
            <StickyNote className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {item.note}
          </p>
        )}
        <p className="mt-1 text-xs text-on-surface-muted">
          {item.productionStatus === "completed" && item.productionCompletedAt
            ? t("detail.doneAt", { time: formatRelativeTime(item.productionCompletedAt, locale) })
            : item.productionStatus === "in_production" && item.sentToProductionAt
              ? t("detail.startedAt", { time: formatRelativeTime(item.sentToProductionAt, locale) })
              : null}
        </p>
        <ItemPeople item={item} userNames={userNames} />
      </div>

      {editable && (
        <div className="flex shrink-0 items-center gap-2">
          <PendingQtyEditor orderId={orderId} item={item} onSaved={onSaved} />
          <Button variant="ghost" size="iconSm" onClick={onRemove} aria-label={`${t("detail.voidItem")} ${item.name}`} title={t("detail.voidItem")}>
            <Trash2 className="h-5 w-5 text-error" />
          </Button>
        </div>
      )}
    </li>
  );
}

// ============================================================
// SECTION: Who did what (people card + per-line credits)
// ------------------------------------------------------------
// Names come from the order detail API (userNames); entries for
// a step nobody has done yet are simply left out.
// ============================================================

function PeopleCard({ order }: { order: OrderDetailData }) {
  const t = useT();
  const locale = useLocale();

  const producers = [
    ...new Set(
      order.items
        .filter((item) => item.status === "active")
        .flatMap((item) => [item.sentToProductionById, item.productionCompletedById])
        .filter((id): id is string => Boolean(id))
        .map((id) => order.userNames[id])
        .filter(Boolean)
    ),
  ];

  const rows: [string, string, Date | string | null][] = [
    [t("people.takenBy"), order.createdByName ?? "—", order.placedAt],
  ];
  if (producers.length > 0) {
    rows.push([t("people.productionBy"), producers.join(", "), order.productionStartedAt]);
  }
  if (order.closedByName) {
    rows.push([t("people.closedBy"), order.closedByName, order.completedAt]);
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-muted">
        {t("people.title")}
      </h2>
      <dl className="space-y-2 text-sm">
        {rows.map(([label, names, at]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-on-surface-muted">{label}</dt>
            <dd className="min-w-0 text-right">
              <span className="font-semibold">{names}</span>
              {at && (
                <span className="block text-xs text-on-surface-muted">{formatDateTime(at, locale)}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ItemPeople({ item, userNames }: { item: OrderItem; userNames: Record<string, string> }) {
  const t = useT();
  const started = item.sentToProductionById ? userNames[item.sentToProductionById] : undefined;
  const done = item.productionCompletedById ? userNames[item.productionCompletedById] : undefined;
  if (!started && !done) return null;
  return (
    <p className="mt-0.5 text-xs text-on-surface-muted [overflow-wrap:anywhere]">
      {[started && t("people.startedBy", { name: started }), done && t("people.doneBy", { name: done })]
        .filter(Boolean)
        .join(" · ")}
    </p>
  );
}

// ============================================================
// SECTION: Pending quantity editor
// ------------------------------------------------------------
// Two typeable fields (κουτιά / τεμάχια) for lines production
// has not started. Commits on blur or Enter; the PATCH is
// rejected server-side if production already started (the UI
// then simply re-syncs from the poll).
// ============================================================

function PendingQtyEditor({
  orderId,
  item,
  onSaved,
}: {
  orderId: string;
  item: OrderItem;
  onSaved: () => void;
}) {
  const t = useT();
  const [boxes, setBoxes] = useState(item.quantityBoxes);
  const [items, setItems] = useState(item.quantityItems);
  const [saving, setSaving] = useState(false);

  // Re-sync when the poll brings different numbers.
  useEffect(() => {
    setBoxes(item.quantityBoxes);
    setItems(item.quantityItems);
  }, [item.quantityBoxes, item.quantityItems]);

  const commit = async () => {
    if (boxes === item.quantityBoxes && items === item.quantityItems) return;
    if (boxes < 0 || items < 0 || (boxes === 0 && items === 0)) {
      setBoxes(item.quantityBoxes);
      setItems(item.quantityItems);
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/api/orders/${orderId}/items/${item.id}`, {
        quantityBoxes: boxes,
        quantityItems: items,
      });
      onSaved();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
      setBoxes(item.quantityBoxes);
      setItems(item.quantityItems);
    } finally {
      setSaving(false);
    }
  };

  const field = (value: number, setValue: (v: number) => void, label: string) => (
    <label className="flex flex-col items-center">
      <span className="text-xs font-bold uppercase text-on-surface-muted">{label}</span>
      <input
        type="number"
        min="0"
        inputMode="numeric"
        value={value}
        onChange={(event) => setValue(Math.max(0, Number(event.target.value) || 0))}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        aria-label={`${item.name} — ${label}`}
        className="h-11 w-16 rounded-lg border border-border bg-surface text-center font-mono text-base font-bold text-on-surface focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </label>
  );

  return (
    <div className={cn("flex items-end gap-1.5", saving && "opacity-50")}>
      {field(boxes, setBoxes, t("pos.boxShort"))}
      {field(items, setItems, t("pos.pcsField"))}
    </div>
  );
}

// ============================================================
// SECTION: Void (remove) item dialog
// ============================================================

function VoidItemDialog({
  item,
  busy,
  onClose,
  onConfirm,
}: {
  item: OrderItem | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");

  const close = () => {
    setReason("");
    onClose();
  };

  return (
    <Dialog
      open={item !== null}
      onClose={close}
      title={t("detail.voidTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={reason.trim().length < 3}
            onClick={() => {
              onConfirm(reason.trim());
              setReason("");
            }}
          >
            {t("detail.voidItem")}
          </Button>
        </>
      }
    >
      {item && (
        <div className="space-y-3">
          <p className="font-semibold">
            {item.name} · {quantityLabel(item, t)}
          </p>
          <Field label={t("detail.voidReasonLabel")} htmlFor="void-reason">
            <Input
              id="void-reason"
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("detail.voidReasonPlaceholder")}
              aria-invalid={reason.trim().length > 0 && reason.trim().length < 3}
            />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
