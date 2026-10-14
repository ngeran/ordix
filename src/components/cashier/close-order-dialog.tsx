"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import type { OrderItem } from "@/db/schema";
import { api, ApiError, showErrorToast } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { quantityLabel } from "@/components/orders/item-labels";

// ============================================================
// SECTION: Close-order dialog
// ------------------------------------------------------------
// The front desk's final step, shared by the Closure screen and
// the order detail page. Deliberately money-free: who it's for,
// a checklist of what to hand over, one giant green YES.
// ============================================================

interface ClosableOrder {
  id: string;
  orderNumber: string;
  customerName?: string | null;
  /** When present, rendered as the hand-over checklist. */
  items?: OrderItem[];
}

export function CloseOrderDialog({
  order,
  onClose,
  onClosed,
}: {
  order: ClosableOrder | null;
  onClose: () => void;
  /** Fired after a successful close (refresh queues, toasts…). */
  onClosed?: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  const close = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await api.post(`/api/orders/${order.id}/close`, {});
      // Dismiss first, then refresh — the popup must never outlive
      // a successful close, whatever the refresh callback does.
      onClose();
      toast.success(t("cashier.closed"));
      onClosed?.();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
      // 409 = already closed (e.g. a retry after a lost response, or
      // another device) or no longer closable — nothing left to do
      // here, so dismiss and show the current state.
      if (error instanceof ApiError && error.status === 409) {
        onClose();
        onClosed?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const items = (order?.items ?? []).filter((item) => item.status === "active");

  return (
    <Dialog open={order !== null} onClose={onClose} title={t("cashier.confirmTitle")}>
      {order && (
        <div className="space-y-4">
          <div className="text-center">
            {order.customerName && (
              <p className="text-2xl font-bold leading-tight [overflow-wrap:anywhere]">{order.customerName}</p>
            )}
            <p className="font-mono text-base font-semibold text-on-surface-muted">
              {order.orderNumber}
            </p>
          </div>

          {items.length > 0 && (
            <div className="rounded-xl bg-surface-container-low p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-muted">
                {t("cashier.handOver")}
              </p>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    <span className="min-w-0 flex-1">{item.name}</span>
                    <span className="shrink-0 font-semibold">{quantityLabel(item, t)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-center text-sm text-on-surface-muted">{t("cashier.confirmBody")}</p>

          <Button
            variant="success"
            size="xl"
            className="w-full text-lg"
            loading={busy}
            onClick={close}
          >
            <Lock className="h-6 w-6" />
            {t("cashier.confirmYes")}
          </Button>
          <Button variant="ghost" size="lg" className="w-full" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
