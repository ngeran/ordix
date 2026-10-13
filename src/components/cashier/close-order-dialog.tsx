"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { api, showErrorToast } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

// ============================================================
// SECTION: Close-order dialog
// ------------------------------------------------------------
// The department's final step, shared by the Closure screen and
// the order detail page. Deliberately money-free: one plain
// question and one giant button (Ολοκληρώθηκε).
// ============================================================

export function CloseOrderDialog({
  order,
  onClose,
  onClosed,
}: {
  /** Minimal shape: the order being closed. */
  order: { id: string; orderNumber: string } | null;
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
      toast.success(t("cashier.closed"));
      onClosed?.();
      onClose();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={order !== null} onClose={onClose} title={t("cashier.confirmTitle")}>
      {order && (
        <div className="space-y-5">
          <p className="text-center font-mono text-lg font-bold">
            {order.orderNumber}
          </p>
          <p className="text-center text-sm text-on-surface-muted">
            {t("cashier.confirmBody")}
          </p>
          <Button
            variant="success"
            size="xl"
            className="w-full text-lg"
            loading={busy}
            onClick={close}
          >
            <Lock className="h-6 w-6" />
            {t("cashier.close")}
          </Button>
          <Button variant="ghost" size="lg" className="w-full" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
