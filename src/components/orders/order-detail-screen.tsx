"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  Lock,
  PackageCheck,
  Pause,
  Play,
  Plus,
  Send,
  StickyNote,
  Truck,
  User,
} from "lucide-react";
import type { OrderItem } from "@/db/schema";
import type {
  OrdixSessionUser,
  OrderDetail as OrderDetailData,
} from "@/types";
import {
  allItemsProduced,
  allowedTransitions,
  ORDER_MAIN_FLOW,
  STATUS_META,
  mainFlowIndex,
} from "@/lib/order-status";
import { CloseOrderDialog } from "@/components/cashier/close-order-dialog";

import { usePolling } from "@/lib/use-polling";
import { api, showErrorToast } from "@/lib/api-client";
import { useLocale, useT } from "@/lib/i18n";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { LoadingArea } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/orders/status-badge";

// ============================================================
// SECTION: Pending quantity editor
// ------------------------------------------------------------
// Two small typeable fields (κουτιά / τεμάχια) for lines the
// production manager has not picked up yet. Commits on blur or
// Enter; the PATCH is rejected server-side if production already
// started (the UI then simply re-syncs from the poll).
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

  // Re-sync when the poll brings different numbers (another device
  // edited, or production locked the line).
  useEffect(() => {
    setBoxes(item.quantityBoxes);
    setItems(item.quantityItems);
  }, [item.quantityBoxes, item.quantityItems]);

  const commit = async () => {
    if (
      boxes === item.quantityBoxes &&
      items === item.quantityItems
    )
      return;
    if (boxes < 0 || items < 0 || (boxes === 0 && items === 0)) {
      setBoxes(item.quantityBoxes);
      setItems(item.quantityItems);
      return;
    }
    setSaving(true);
    try {
      await api.patch(
        `/api/orders/${orderId}/items/${item.id}`,
        { quantityBoxes: boxes, quantityItems: items }
      );
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
    <input
      type="number"
      min="0"
      inputMode="numeric"
      value={value}
      onChange={(event) => setValue(Math.max(0, Number(event.target.value) || 0))}
      onBlur={commit}
      onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
      aria-label={`${item.name} — ${label}`}
      className="h-11 w-14 rounded-lg border border-border bg-surface text-center font-mono text-base font-bold text-on-surface focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );

  return (
    <div className={cn("flex shrink-0 items-start gap-1", saving && "opacity-50")}>
      {field(boxes, setBoxes, t("pos.boxes"))}
      {field(items, setItems, t("pos.items"))}
    </div>
  );
}

// ============================================================
// SECTION: Lifecycle stepper
// ------------------------------------------------------------
// The whole lifecycle in one glance: Υποβλήθηκε → Σε παραγωγή →
// Παραγωγή ολοκληρώθηκε → Ολοκληρώθηκε. Done stages show a
// check, the current stage pulses, future stages stay muted.
// ============================================================

function StatusStepper({ status }: { status: OrderDetailData["status"] }) {
  const t = useT();
  const locale = useLocale();
  const currentIndex = ORDER_MAIN_FLOW.indexOf(status);

  // Legacy orders (pre-Phase-2 stages) fall back to a plain badge.
  if (currentIndex < 0) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-surface p-3">
      {ORDER_MAIN_FLOW.map((stage, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        return (
          <div key={stage} className="flex min-w-0 flex-1 items-center gap-2">
            {index > 0 && (
              <span
                aria-hidden
                className={cn(
                  "h-0.5 min-w-3 flex-1 rounded-full",
                  done ? "bg-success" : "bg-border"
                )}
              />
            )}
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  done
                    ? "bg-success text-white"
                    : current
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-high text-on-surface-muted"
                )}
              >
                {done ? "✓" : index + 1}
              </span>
              <span
                className={cn(
                  "hidden truncate text-xs font-semibold sm:block",
                  current
                    ? "text-primary"
                    : done
                      ? "text-on-surface"
                      : "text-on-surface-muted"
                )}
              >
                {STATUS_META[stage][locale]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// SECTION: Order detail screen
// ------------------------------------------------------------
// Layout: header (number/status/meta) + two columns on lg+.
//   main   — items grouped by round, packing checklist, timeline
//   aside  — status actions, courier/tracking card
// All mutations POST to the API and re-render from the response
// (then the poll keeps other devices in sync).
// ============================================================

export function OrderDetailScreen({
  orderId,
  user,
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

  const [busy, setBusy] = useState(false);

  // -- Dialog state: only one can be open at a time --
  const [voidingItem, setVoidingItem] = useState<OrderItem | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [resumeOpen, setResumeOpen] = useState(false);
  // NOTE: every hook in this component MUST sit above the
  // `if (!order)` early return below — a hook after it changes
  // the hook count between the loading and loaded renders
  // (React error #310).
  const [closingOrder, setClosingOrder] = useState(false);

  if (!order) {
    return <LoadingArea label={t("common.loading")} />;
  }

  const activeItems = order.items.filter((item) => item.status === "active");
  const nextStage = ORDER_MAIN_FLOW[mainFlowIndex(order.status) + 1];

  // Void/append stay available until production starts on a line;
  // legacy stages keep their old affordances for old orders.
  const canVoid = ["placed", "on_hold"].includes(order.status);
  const isTerminal = ["completed", "cancelled"].includes(order.status);
  const canAppend = ["placed", "in_production", "on_hold"].includes(order.status);
  const canEditQuantities = canAppend;
  // The department closes: production_complete, or in_production
  // with every active item produced (edge case).
  const canClose =
    order.status === "production_complete" ||
    (order.status === "in_production" && allItemsProduced(activeItems));

  // ============================================================
  // SECTION: Mutations
  // ============================================================

  const transition = async (status: string, note?: string) => {
    setBusy(true);
    try {
      await api.post(`/api/orders/${orderId}/status`, { status, note });
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

  // ============================================================
  // SECTION: Render
  // ============================================================

  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      {/* ============================================================
          SECTION: Header
          ============================================================ */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/orders">
          <Button variant="ghost" size="icon" aria-label={t("common.back")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="font-mono text-xl font-bold sm:text-2xl">{order.orderNumber}</h1>
        <StatusBadge status={order.status} />
        <span className="text-sm text-on-surface-muted">
          {formatRelativeTime(order.placedAt, locale)}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-on-surface-muted">
        {order.customerName && (
          <span className="flex items-center gap-1.5">
            <User className="h-4 w-4" aria-hidden /> {order.customerName}
          </span>
        )}
        {order.createdByName && (
          <span className="flex items-center gap-1.5">
            <User className="h-4 w-4" aria-hidden /> {order.createdByName}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" aria-hidden /> {formatDateTime(order.placedAt, locale)}
        </span>
        {order.paidAt && (
          <span className="flex items-center gap-1.5 font-medium text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {t("detail.closedInfo", { time: formatDateTime(order.paidAt, locale) })}
          </span>
        )}
      </div>

      {/* Lifecycle stepper — where this order stands, at a glance */}
      <StatusStepper status={order.status} />

      {/* Customer contact card (Phase 2) */}
      {order.customer && (order.customer.address || order.customer.phone || order.customer.comments) && (
        <div className="mb-4 rounded-xl bg-surface-container-low px-4 py-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-muted">
            {t("customer.name")}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-0.5">
            {order.customer.phone && <span>☎ {order.customer.phone}</span>}
            {order.customer.address && <span>📍 {order.customer.address}</span>}
            {order.customer.email && <span>✉ {order.customer.email}</span>}
            {order.customer.comments && (
              <span className="italic">“{order.customer.comments}”</span>
            )}
          </div>
        </div>
      )}

      {order.status === "production_complete" && (
        <p className="mb-4 rounded-xl bg-violet-100 px-4 py-3 text-sm font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-300">
          {t("detail.productionDone")}
        </p>
      )}

      {order.status === "cancelled" && (
        <p className="mb-4 rounded-xl bg-error-soft px-4 py-3 text-sm font-medium text-error">
          {t("detail.orderCancelled")}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* ============================================================
            SECTION: Items (grouped by round) + checklist
            ============================================================ */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-semibold">
                {t("nav.orders")} · {activeItems.length} {t("common.items")}
              </h2>
            </div>

            <ul className="divide-y divide-border">
              {order.items.map((item) => {
                const quantityLabel =
                  item.quantityBoxes > 0 && item.quantityItems > 0
                    ? `${item.quantityBoxes} ${t("pos.boxes")} + ${item.quantityItems} ${t("pos.items")}`
                    : item.quantityBoxes > 0
                      ? `${item.quantityBoxes} ${t("pos.boxes")}`
                      : `${item.quantityItems || item.quantity} ${t("pos.items")}`;
                return (
                <li key={item.id} className={cn("px-4 py-3", item.status === "voided" && "opacity-50")}>
                  <div className="flex items-start gap-3">
                    {/* Pending lines stay editable (κουτιά / τεμάχια typed
                        by hand) until production picks them up */}
                    {canEditQuantities && item.status === "active" && item.productionStatus === "pending" ? (
                      <PendingQtyEditor
                        orderId={orderId}
                        item={item}
                        onSaved={refresh}
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container text-base font-bold"
                      >
                        {item.quantityBoxes + item.quantityItems || item.quantity}
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-semibold", item.status === "voided" && "line-through")}>
                        {item.name}{" "}
                        <span className="text-on-surface-muted">{quantityLabel}</span>
                        {item.round > 1 && (
                          <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                            {t("detail.round", { round: item.round })}
                          </span>
                        )}
                      </p>
                      <p className="font-mono text-xs text-on-surface-muted">{item.partNumber}</p>
                      {item.note && (
                        <p className="mt-1 flex items-start gap-1 text-xs text-info">
                          <StickyNote className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          {item.note}
                        </p>
                      )}
                      {item.status === "voided" && (
                        <p className="mt-1 text-xs text-error">
                          {t("detail.voidItem")}: {item.voidReason}
                          {item.voidNote ? ` — ${item.voidNote}` : ""}
                        </p>
                      )}
                    </div>

                    {/* Production state badge (managed on the production board) */}
                    {item.status === "active" && (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          item.productionStatus === "completed"
                            ? "bg-success-soft text-success"
                            : item.productionStatus === "in_production"
                              ? "bg-warning-soft text-warning"
                              : "bg-surface-container text-on-surface-muted"
                        )}
                      >
                        {item.productionStatus === "completed"
                          ? t("detail.produced")
                          : item.productionStatus === "in_production"
                            ? t("detail.inProduction")
                            : t("detail.awaitingProduction")}
                      </span>
                    )}

                    <div className="flex shrink-0 items-center">
                      {canVoid && item.status === "active" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setVoidingItem(item)}
                          className="text-error"
                        >
                          <Ban className="h-4 w-4" />
                          {t("detail.voidItem")}
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>

            {canAppend && (
              <div className="border-t border-border px-4 py-3">
                <Button variant="secondary" onClick={startAppend} className="w-full">
                  <Plus className="h-5 w-5" />
                  {t("detail.appendItems")}
                </Button>
              </div>
            )}
          </Card>

          {/* ============================================================
              SECTION: Timeline
              ============================================================ */}
          <Card>
            <h2 className="border-b border-border px-4 py-3 font-semibold">
              {t("detail.timeline")}
            </h2>
            <ol className="space-y-3 px-4 py-3">
              {order.events.map((event) => (
                <li key={event.id} className="flex items-start gap-3 text-sm">
                  <span
                    aria-hidden
                    className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", STATUS_META[event.toStatus].accentClass)}
                  />
                  <div>
                    <p className="font-medium">
                      {event.fromStatus && event.fromStatus !== event.toStatus
                        ? `${STATUS_META[event.fromStatus][locale]} → ${STATUS_META[event.toStatus][locale]}`
                        : STATUS_META[event.toStatus][locale]}
                    </p>
                    <p className="text-xs text-on-surface-muted">
                      {formatDateTime(event.createdAt, locale)}
                      {event.userName ? ` · ${event.userName}` : ""}
                    </p>
                    {event.note && (
                      <p className="mt-0.5 text-xs text-on-surface-muted">{event.note}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* ============================================================
            SECTION: Aside — status actions + courier
            ------------------------------------------------------------
            NO close/complete buttons here while production is
            running: production_complete orders are closed ONLY
            from the Ταμείο screen or via canClose below (the
            server rejects any direct completed transition).
            ============================================================ */}
        <div className="space-y-4">
          {/* Department closure — the ONLY path to completed */}
          {canClose && (
            <Card className="p-4">
              <Button
                variant="success"
                size="xl"
                className="w-full text-lg"
                disabled={busy}
                onClick={() => setClosingOrder(true)}
              >
                <Lock className="h-6 w-6" />
                {t("detail.closeOrder")}
              </Button>
            </Card>
          )}

          {!isTerminal && (
            <Card className="space-y-2 p-4">
              {/* Primary: advance to the next main-flow stage — the one
                  obvious action, extra large for first-time users.
                  (No advance to "completed": that's the cashier's job
                  via the Ταμείο screen's close button.) */}
              {nextStage && !["dispatched", "completed"].includes(nextStage) && (
                <Button
                  size="xl"
                  className="w-full text-lg"
                  disabled={busy}
                  onClick={() => transition(nextStage)}
                >
                  <ArrowRight className="h-6 w-6" />
                  {t("detail.advance", { status: STATUS_META[nextStage][locale] })}
                </Button>
              )}
              {/* Hold / resume — only where the state machine allows it */}
              {allowedTransitions(order.status).includes("on_hold") && order.status !== "on_hold" && (
                <Button variant="secondary" className="w-full" disabled={busy} onClick={() => transition("on_hold")}>
                  <Pause className="h-5 w-5" />
                  {t("detail.hold")}
                </Button>
              )}
              {order.status === "on_hold" && (
                <Button variant="secondary" className="w-full" disabled={busy} onClick={() => setResumeOpen(true)}>
                  <Play className="h-5 w-5" />
                  {t("detail.resume")}
                </Button>
              )}

              {/* Cancel */}
              {allowedTransitions(order.status).includes("cancelled") && (
                <Button variant="danger" className="w-full" disabled={busy} onClick={() => setCancelOpen(true)}>
                  <Ban className="h-5 w-5" />
                  {t("detail.cancelOrder")}
                </Button>
              )}
            </Card>
          )}

        </div>
      </div>

      {/* ============================================================
          SECTION: Dialogs
          ============================================================ */}

      {/* Void item — reason required (audit) */}
      <VoidItemDialog
        item={voidingItem}
        busy={busy}
        onClose={() => setVoidingItem(null)}
        onConfirm={voidItem}
      />

      {/* Cancel order — reason becomes the audit note */}
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

      {/* Resume order — pick the stage to re-enter */}
      <Dialog
        open={resumeOpen}
        onClose={() => setResumeOpen(false)}
        title={t("detail.resumeTitle")}
        footer={
          <Button variant="ghost" onClick={() => setResumeOpen(false)}>
            {t("common.cancel")}
          </Button>
        }
      >
        <div className="grid gap-2">
          {allowedTransitions("on_hold")
            .filter((status) => status !== "cancelled")
            .map((status) => (
              <Button
                key={status}
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setResumeOpen(false);
                  void transition(status);
                }}
              >
                {STATUS_META[status][locale]}
              </Button>
            ))}
        </div>
      </Dialog>

      {/* Department closure dialog (the ONLY completion path) */}
      <CloseOrderDialog
        order={
          closingOrder ? { id: order.id, orderNumber: order.orderNumber } : null
        }
        onClose={() => setClosingOrder(false)}
        onClosed={refresh}
      />
    </div>
  );
}

// ============================================================
// SECTION: Void item dialog
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

  return (
    <Dialog
      open={item !== null}
      onClose={() => {
        setReason("");
        onClose();
      }}
      title={t("detail.voidTitle")}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setReason("");
              onClose();
            }}
          >
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
      )}
    </Dialog>
  );
}

