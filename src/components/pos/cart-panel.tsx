"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import { Minus, Plus, ReceiptText, StickyNote, Trash2, X } from "lucide-react";
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
// Phase 2: each line has TWO steppers — κουτιά (boxes) and
// τεμάχια (loose pieces) — entered manually, one or both. The
// footer carries the order note and the single big submit; the
// CUSTOMER lives in a banner above the panel (pos-screen).
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

  const setBoxes = useCartStore((state) => state.setBoxes);
  const setItems = useCartStore((state) => state.setItems);
  const setLinePrice = useCartStore((state) => state.setLinePrice);
  const removeLine = useCartStore((state) => state.removeLine);
  const setNote = useCartStore((state) => state.setNote);
  const setNotes = useCartStore((state) => state.setNotes);
  const clearCart = useCartStore((state) => state.clearCart);

  const [noteEditingId, setNoteEditingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const totalCents = items.reduce(
    (sum, item) => sum + item.linePriceCents,
    0
  );
  const totalUnits = items.reduce(
    (sum, item) => sum + item.quantityBoxes + item.quantityItems,
    0
  );

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
              return (
                <li
                  key={item.productId}
                  className="rounded-xl border border-border bg-surface-container-lowest p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      <p className="font-mono text-xs text-on-surface-muted">
                        {item.partNumber}
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

                  {/* κουτιά + τεμάχια steppers */}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Stepper
                      label={t("pos.boxes")}
                      value={item.quantityBoxes}
                      onDec={() => setBoxes(item.productId, item.quantityBoxes - 1)}
                      onInc={() => setBoxes(item.productId, item.quantityBoxes + 1)}
                    />
                    <Stepper
                      label={t("pos.items")}
                      value={item.quantityItems}
                      onDec={() => setItems(item.productId, item.quantityItems - 1)}
                      onInc={() => setItems(item.productId, item.quantityItems + 1)}
                    />
                  </div>

                  {/* Manually quoted line price */}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-muted">
                      {t("pos.linePrice")}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={item.linePriceCents ? (item.linePriceCents / 100).toFixed(2) : ""}
                      onChange={(event) =>
                        setLinePrice(
                          item.productId,
                          Math.round(Number(event.target.value.replace(",", ".")) * 100) || 0
                        )
                      }
                      placeholder="0.00"
                      aria-label={t("pos.linePrice")}
                      className="h-10 w-32 text-right font-bold"
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNoteEditingId(item.productId)}
                      className={cn("h-8 px-2 text-xs", item.note && "text-primary")}
                    >
                      <StickyNote className="h-3.5 w-3.5" />
                      {item.note ? item.note : t("common.note")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* -- Footer: order note, total, submit -- */}
      <div className="space-y-3 border-t border-border px-4 py-3">
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
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setConfirmOpen(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

// ============================================================
// SECTION: Stepper (one quantity dimension — boxes or pieces)
// ============================================================

function Stepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface-container-low p-1.5">
      <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-on-surface-muted">
        {label}
      </p>
      <div className="flex items-center justify-between gap-1">
        <Button variant="secondary" size="iconSm" onClick={onDec} aria-label={`${label} −1`}>
          <Minus className="h-4 w-4" />
        </Button>
        <span className="min-w-10 text-center text-lg font-bold" aria-live="polite">
          {value}
        </span>
        <Button variant="secondary" size="iconSm" onClick={onInc} aria-label={`${label} +1`}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
