"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import { CheckCircle2, ReceiptText, Trash2, X } from "lucide-react";
import { useCartStore } from "@/stores/cart-store";
import { useLocale, useT } from "@/lib/i18n";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================
// SECTION: Order tray (the queued ticket)
// ------------------------------------------------------------
// The mockup's "Order Ledger Tray": queued parts show as
// [N boxes] + [N loose] = [total] chips — quantities are edited
// in the Split Calculator (re-select the part card), rows can
// only be removed here. Footer: order note, total, and the one
// giant green confirm.
// ============================================================

interface CartPanelProps {
  placing: boolean;
  onSubmit: () => void;
  /** Present in drawer mode → shows a close button. */
  onClose?: () => void;
}

export function CartPanel({ placing, onSubmit, onClose }: CartPanelProps) {
  const t = useT();
  const locale = useLocale();

  const items = useCartStore((state) => state.items);
  const notes = useCartStore((state) => state.notes);
  const appendOrderId = useCartStore((state) => state.appendOrderId);
  const appendOrderLabel = useCartStore((state) => state.appendOrderLabel);
  const removeLine = useCartStore((state) => state.removeLine);
  const setNotes = useCartStore((state) => state.setNotes);
  const clearCart = useCartStore((state) => state.clearCart);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const totalCents = items.reduce((sum, item) => sum + item.linePriceCents, 0);
  const totalUnits = items.reduce(
    (sum, item) => sum + item.quantityBoxes + item.quantityItems,
    0
  );

  const submitLabel = appendOrderId
    ? t("pos.appendRound", { number: appendOrderLabel ?? "" })
    : t("pos.placeOrder");

  const confirmTitle = appendOrderId
    ? t("pos.confirmAppendTitle")
    : t("pos.confirmPlaceTitle");
  const confirmBody = appendOrderId
    ? t("pos.confirmAppendBody", { units: totalUnits, number: appendOrderLabel ?? "" })
    : t("pos.confirmPlaceBody", {
        units: totalUnits,
        total: formatMoney(totalCents, locale),
      });

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface-container-low p-4 shadow-card">
      {/* -- Header -- */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-soft text-success"
          >
            <ReceiptText className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-extrabold leading-tight">
              {t("pos.trayTitle")}
            </h2>
            <p className="text-xs font-bold text-success">
              {items.length} {t("pos.queued")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => clearCart()}>
              <Trash2 className="h-4 w-4" />
              {t("pos.clearCart")}
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* -- Queued lines -- */}
      <div className="scrollbar-thin max-h-72 min-h-0 space-y-2.5 overflow-y-auto py-3 pr-1">
        {items.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={t("pos.cartEmpty")}
            hint={t("pos.cartEmptyHint")}
          />
        ) : (
          items.map((item) => (
            <div
              key={item.productId}
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface-container p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-on-surface">
                    {item.name}
                  </p>
                  <p className="font-mono text-xs text-on-surface-muted">
                    {item.partNumber}
                    {item.quantityBoxes > 0 && item.quantityItems > 0
                      ? ` = ${item.quantityBoxes * 1 + item.quantityItems} ${t("common.units")}`
                      : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={() => removeLine(item.productId)}
                  aria-label={`${t("common.remove")} ${item.name}`}
                >
                  <Trash2 className="h-4 w-4 text-error" />
                </Button>
              </div>

              {/* boxes + loose chips */}
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-surface-container-lowest px-3 py-1.5">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className="text-primary">
                    {item.quantityBoxes} {t("pos.boxes")}
                  </span>
                  <span className="text-on-surface-muted">+</span>
                  <span className="text-success">
                    {item.quantityItems} {t("pos.items")}
                  </span>
                </div>
                {item.linePriceCents > 0 && (
                  <span className="font-mono text-sm font-extrabold text-on-surface">
                    {formatMoney(item.linePriceCents, locale)}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* -- Footer: order note, total, giant green confirm -- */}
      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <Input
          value={notes ?? ""}
          onChange={(event) => setNotes(event.target.value || null)}
          placeholder={t("pos.orderNotes")}
          aria-label={t("pos.orderNotes")}
        />

        <div className="flex items-center justify-between text-lg font-bold">
          <span>{t("common.total")}</span>
          <span>{formatMoney(totalCents, locale)}</span>
        </div>

        <Button
          variant="success"
          size="xl"
          className="w-full text-lg font-extrabold"
          disabled={items.length === 0}
          loading={placing}
          onClick={() => setConfirmOpen(true)}
        >
          <CheckCircle2 className="h-6 w-6" />
          {submitLabel}
        </Button>
      </div>

      {/* -- Submit confirmation: one giant YES, one plain NO -- */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title={confirmTitle}>
        <p className="text-base text-on-surface-muted">{confirmBody}</p>
        <div className="mt-5 space-y-3">
          <Button
            variant="success"
            size="xl"
            className="w-full text-xl"
            loading={placing}
            onClick={() => {
              setConfirmOpen(false);
              onSubmit();
            }}
          >
            {appendOrderId ? t("pos.confirmAppendYes") : t("pos.confirmYes")}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="w-full"
            onClick={() => setConfirmOpen(false)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
