"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import { Banknote, CheckCircle2, CreditCard, Landmark } from "lucide-react";
import type { PaymentMethod } from "@/db/schema";
import type { OrderSummary } from "@/types";
import { api, showErrorToast } from "@/lib/api-client";
import { useLocale, useT } from "@/lib/i18n";
import { formatMoney } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// ============================================================
// SECTION: Payment dialog
// ------------------------------------------------------------
// The cashier's last step, shared by the Ταμείο screen AND the
// order detail page (order taker and cashier are the same
// person — the close action follows them everywhere). Three
// giant method tiles; cash preselected so one tap closes.
// ============================================================

export function PaymentDialog({
  order,
  onClose,
  onClosed,
}: {
  /** Minimal shape: the order being settled (id + number + total). */
  order: Pick<OrderSummary, "id" | "orderNumber" | "totalCents"> | null;
  onClose: () => void;
  /** Fired after a successful close (refresh queues, toasts…). */
  onClosed?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [method, setMethod] = useState<PaymentMethod | null>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const close = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await api.post(`/api/orders/${order.id}/close`, {
        paymentMethod: method ?? undefined,
        paymentNote: note.trim() || undefined,
      });
      toast.success(t("cashier.closed"));
      setMethod("cash");
      setNote("");
      onClosed?.();
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

          {/* Three giant method tiles */}
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
