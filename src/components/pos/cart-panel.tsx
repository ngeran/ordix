"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import { AlertTriangle, Minus, Plus, ReceiptText, StickyNote, Trash2, X } from "lucide-react";
import { useCartStore } from "@/stores/cart-store";
import { useLocale, useT } from "@/lib/i18n";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================
// SECTION: Cart panel (the draft ticket)
// ------------------------------------------------------------
// Right-side panel on desktop, full-height drawer on smaller
// screens. Line rows carry a quantity stepper, per-line note and
// remove action; the footer carries customer/notes fields and
// the primary submit (place order / append round).
// ============================================================

interface CartPanelProps {
  allowOversell: boolean;
  placing: boolean;
  onSubmit: () => void;
  /** Present in drawer mode → shows a close button. */
  onClose?: () => void;
}

export function CartPanel({ allowOversell, placing, onSubmit, onClose }: CartPanelProps) {
  const t = useT();
  const locale = useLocale();

  const items = useCartStore((state) => state.items);
  const customerName = useCartStore((state) => state.customerName);
  const notes = useCartStore((state) => state.notes);
  const appendOrderId = useCartStore((state) => state.appendOrderId);
  const appendOrderLabel = useCartStore((state) => state.appendOrderLabel);

  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeLine = useCartStore((state) => state.removeLine);
  const setNote = useCartStore((state) => state.setNote);
  const setCustomerName = useCartStore((state) => state.setCustomerName);
  const setNotes = useCartStore((state) => state.setNotes);
  const clearCart = useCartStore((state) => state.clearCart);

  const [noteEditingId, setNoteEditingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const totalCents = items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0
  );
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);

  const submitLabel = appendOrderId
    ? t("pos.appendRound", { number: appendOrderLabel ?? "" })
    : t("pos.placeOrder");

  const confirmTitle = appendOrderId ? t("pos.confirmAppendTitle") : t("pos.confirmPlaceTitle");
  const confirmBody = appendOrderId
    ? t("pos.confirmAppendBody", { units: totalUnits, number: appendOrderLabel ?? "" })
    : t("pos.confirmPlaceBody", {
        units: totalUnits,
        total: formatMoney(totalCents, locale),
      });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* -- Header -- */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <ReceiptText className="h-5 w-5 text-primary" aria-hidden />
          {t("nav.order")}
        </h2>
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => clearCart()}>
              <Trash2 className="h-4 w-4" />
              {t("pos.clearCart")}
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("common.close")}>
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* -- Lines -- */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {items.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={t("pos.cartEmpty")}
            hint={t("pos.cartEmptyHint")}
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const overStock = item.quantity > item.availableStock;
              return (
                <li
                  key={item.productId}
                  className={cn(
                    "rounded-xl border bg-surface-container-lowest p-3",
                    overStock && "border-error"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      <p className="font-mono text-xs text-on-surface-muted">
                        {item.partNumber} · {formatMoney(item.unitPriceCents, locale)}
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

                  <div className="mt-2 flex items-center justify-between gap-2">
                    {/* Quantity stepper — full 48px targets with big glyphs */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => setQuantity(item.productId, item.quantity - 1)}
                        aria-label={`${t("common.remove")} 1`}
                      >
                        <Minus className="h-6 w-6" />
                      </Button>
                      <span className="w-14 text-center text-lg font-bold" aria-live="polite">
                        {item.quantity}
                      </span>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => setQuantity(item.productId, item.quantity + 1)}
                        aria-label={`${t("common.add")} 1`}
                      >
                        <Plus className="h-6 w-6" />
                      </Button>
                    </div>

                    <span className="text-lg font-bold">
                      {formatMoney(item.unitPriceCents * item.quantity, locale)}
                    </span>
                  </div>

                  {/* Note + oversell hint row */}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNoteEditingId(item.productId)}
                      className={cn("h-8 px-2 text-xs", item.note && "text-primary")}
                    >
                      <StickyNote className="h-3.5 w-3.5" />
                      {item.note ? item.note : t("common.note")}
                    </Button>
                    {overStock && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-error">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        {t("pos.stockLeft", { count: item.availableStock })}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* -- Footer: customer, notes, total, submit -- */}
      <div className="space-y-3 border-t border-border px-4 py-3">
        <Input
          value={customerName ?? ""}
          onChange={(event) => setCustomerName(event.target.value || null)}
          placeholder={t("pos.customerName")}
          aria-label={t("pos.customerName")}
        />
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
          size="xl"
          className="w-full"
          disabled={items.length === 0}
          loading={placing}
          onClick={() => setConfirmOpen(true)}
        >
          {submitLabel}
        </Button>
      </div>

      {/* -- Per-line note dialog -- */}
      <Dialog
        open={noteEditingId !== null}
        onClose={() => setNoteEditingId(null)}
        title={t("common.note")}
        footer={
          <Button onClick={() => setNoteEditingId(null)}>{t("common.save")}</Button>
        }
      >
        {noteEditingId && (
          <Field label={t("common.notes")} htmlFor="line-note">
            <Textarea
              id="line-note"
              autoFocus
              value={
                items.find((item) => item.productId === noteEditingId)?.note ?? ""
              }
              onChange={(event) => setNote(noteEditingId, event.target.value)}
            />
          </Field>
        )}
      </Dialog>

      {/* -- Submit confirmation: one giant YES, one plain NO —
          impossible to misread, impossible to mis-tap -- */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={confirmTitle}
      >
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
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setConfirmOpen(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
