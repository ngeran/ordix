"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { Banknote, CheckCircle2, CreditCard, Landmark } from "lucide-react";
import type { OrderSummary } from "@/types";
import type { PaymentMethod } from "@/db/schema";
import { api, showErrorToast } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import { useLocale, useT } from "@/lib/i18n";
import { formatMoney } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/orders/status-badge";

// ============================================================
// SECTION: Cashier screen
// ------------------------------------------------------------
// Two sections:
//   1. "Waiting for payment" — production_complete orders, each
//      with ONE giant button opening the payment dialog
//   2. "Completed today" — closed orders for the end-of-day tally
// ============================================================

export function CashierScreen() {
  const t = useT();
  const locale = useLocale();

  const { data: activeOrders } = usePolling<OrderSummary[]>(
    "/api/orders?scope=active",
    { intervalMs: 5_000 }
  );
  const { data: historyOrders } = usePolling<OrderSummary[]>(
    "/api/orders?scope=history",
    { intervalMs: 15_000 }
  );

  const waiting = (activeOrders ?? []).filter(
    (order) => order.status === "production_complete"
  );
  const paidToday = (historyOrders ?? []).filter(
    (order) => order.status === "completed" && order.paidAt !== null
  );

  const [closingOrder, setClosingOrder] = useState<OrderSummary | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <h1 className="mb-4 text-2xl font-bold">{t("cashier.title")}</h1>

      {/* ============================================================
          SECTION: Waiting for payment
          ============================================================ */}
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-on-surface-muted">
        {t("cashier.ready")} ({waiting.length})
      </h2>
      {activeOrders === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : waiting.length === 0 ? (
        <EmptyState icon={Banknote} title={t("cashier.empty")} />
      ) : (
        <ul className="mb-8 space-y-3">
          {waiting.map((order) => (
            <li key={order.id}>
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/orders/${order.id}`}
                    className="font-mono font-bold hover:text-primary"
                  >
                    {order.orderNumber}
                  </Link>
                  <p className="truncate text-sm text-on-surface-muted">
                    {order.customerName ?? "—"}
                  </p>
                </div>
                <StatusBadge status={order.status} />
                <span className="text-xl font-bold">
                  {formatMoney(order.totalCents, locale)}
                </span>
                <Button size="lg" onClick={() => setClosingOrder(order)}>
                  <Banknote className="h-5 w-5" />
                  {t("cashier.collect")}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* ============================================================
          SECTION: Completed today
          ============================================================ */}
      {paidToday.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-on-surface-muted">
            {t("cashier.paidToday")} ({paidToday.length})
          </h2>
          <ul className="space-y-2">
            {paidToday.map((order) => (
              <li key={order.id}>
                <Card className="flex items-center gap-3 p-3 text-sm">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
                  <span className="font-mono font-semibold">{order.orderNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-on-surface-muted">
                    {order.customerName ?? "—"}
                  </span>
                  <span className="font-bold">
                    {formatMoney(order.totalCents, locale)}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* -- Payment dialog: three giant method buttons + note -- */}
      <PaymentDialog
        order={closingOrder}
        busy={busy}
        setBusy={setBusy}
        onClose={() => setClosingOrder(null)}
      />
    </div>
  );
}

// ============================================================
// SECTION: Payment dialog
// ============================================================

function PaymentDialog({
  order,
  busy,
  setBusy,
  onClose,
}: {
  order: OrderSummary | null;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState("");

  const close = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await api.post(`/api/orders/${order.id}/close`, {
        paymentMethod: method ?? undefined,
        paymentNote: note.trim() || undefined,
      });
      toast.success(t("cashier.closed"));
      setMethod(null);
      setNote("");
      onClose();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const methods: Array<{
    value: PaymentMethod;
    label: string;
    icon: typeof Banknote;
  }> = [
    { value: "cash", label: t("cashier.cash"), icon: Banknote },
    { value: "card", label: t("cashier.card"), icon: CreditCard },
    { value: "transfer", label: t("cashier.transfer"), icon: Landmark },
  ];

  return (
    <Dialog open={order !== null} onClose={onClose} title={t("cashier.collect")}>
      {order && (
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-container-low px-4 py-3 text-center">
            <p className="font-mono text-sm font-semibold">{order.orderNumber}</p>
            <p className="text-3xl font-bold text-primary">
              {formatMoney(order.totalCents, locale)}
            </p>
          </div>

          {/* Three giant method tiles — cash is preselected (the
              most common case) so one tap closes the order */}
          <p className="text-sm font-medium text-on-surface-muted">
            {t("cashier.method")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {methods.map((entry) => {
              const Icon = entry.icon;
              const selected = method === entry.value;
              return (
                <button
                  key={entry.value}
                  onClick={() => setMethod(entry.value)}
                  aria-pressed={selected}
                  className={`flex h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 text-sm font-semibold transition-colors ${
                    selected
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-surface hover:border-primary/50"
                  }`}
                >
                  <Icon className="h-7 w-7" aria-hidden />
                  {entry.label}
                </button>
              );
            })}
          </div>

          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("cashier.note")}
            aria-label={t("cashier.note")}
          />

          <Button
            variant="success"
            size="xl"
            className="w-full text-lg"
            loading={busy}
            onClick={close}
          >
            <CheckCircle2 className="h-6 w-6" />
            {t("cashier.collect")}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
