"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import { CheckCircle2, Minus, Plus, ReceiptText, Trash2, X } from "lucide-react";
import { useCartStore, type CartLine } from "@/stores/cart-store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================
// SECTION: Order Tray (mockup "Order Ledger Tray")
// ------------------------------------------------------------
// Every queued line shows the tactile breakdown pill
// ([1 Box] + [0 Items] = 25 pcs) plus BOX / PCS rows with
// TYPEABLE inputs flanked by mini steppers — the operator can
// punch any number on the keyboard or tap ±. Lines are only
// removed via the trash icon (never mid-typing); lines left at
// 0/0 are skipped when the order is placed.
// ============================================================

interface CartPanelProps {
  placing: boolean;
  onSubmit: () => void;
  /** Present in drawer mode → shows a close button. */
  onClose?: () => void;
}

export function CartPanel({ placing, onSubmit, onClose }: CartPanelProps) {
  const t = useT();

  const items = useCartStore((state) => state.items);
  const notes = useCartStore((state) => state.notes);
  const appendOrderId = useCartStore((state) => state.appendOrderId);
  const appendOrderLabel = useCartStore((state) => state.appendOrderLabel);
  const setBoxes = useCartStore((state) => state.setBoxes);
  const setItems = useCartStore((state) => state.setItems);
  const removeLine = useCartStore((state) => state.removeLine);
  const setNotes = useCartStore((state) => state.setNotes);
  const clearCart = useCartStore((state) => state.clearCart);

  const [confirmOpen, setConfirmOpen] = useState(false);

  // Lines with something in them are submitted; 0/0 lines are
  // drafts the operator cleared and are silently skipped.
  const placed = items.filter(
    (item) => item.quantityBoxes > 0 || item.quantityItems > 0
  );
  const totalUnits = placed.reduce(
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
    : t("pos.confirmPlaceBody", { units: totalUnits });

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
            <p className="font-mono text-xs font-semibold text-success">
              {placed.length} {t("pos.queued")}
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
      <div className="scrollbar-thin max-h-72 min-h-0 space-y-3 overflow-y-auto py-3 pr-1">
        {items.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={t("pos.cartEmpty")}
            hint={t("pos.cartEmptyHint")}
          />
        ) : (
          items.map((item) => (
            <TrayRow key={item.productId} item={item} onRemove={removeLine} />
          ))
        )}
      </div>

      {/* -- Footer: order note, giant green confirm -- */}
      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <Input
          value={notes ?? ""}
          onChange={(event) => setNotes(event.target.value || null)}
          placeholder={t("pos.orderNotes")}
          aria-label={t("pos.orderNotes")}
        />

        <Button
          variant="success"
          size="xl"
          className="w-full text-lg font-extrabold tracking-wide"
          disabled={placed.length === 0}
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

// ============================================================
// SECTION: Tray row — breakdown pill + typeable BOX/PCS inputs
// ============================================================

function TrayRow({
  item,
  onRemove,
}: {
  item: CartLine;
  onRemove: (productId: string) => void;
}) {
  const t = useT();
  const setBoxes = useCartStore((state) => state.setBoxes);
  const setItems = useCartStore((state) => state.setItems);

  const totalPcs =
    item.quantityBoxes * Math.max(1, item.piecesPerBox) + item.quantityItems;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface-container p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 pr-2">
          <h4 className="truncate text-sm font-bold text-on-surface">{item.name}</h4>
          <span className="font-mono text-[11px] text-on-surface-muted">
            {item.partNumber} · {t("pos.perBoxShort", { count: item.piecesPerBox })}
          </span>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => onRemove(item.productId)}
          aria-label={`${t("common.remove")} ${item.name}`}
        >
          <Trash2 className="h-4 w-4 text-error" />
        </Button>
      </div>

      {/* Breakdown pill */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface-container-lowest px-3 py-2">
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="rounded border border-primary/30 bg-primary-soft px-2 py-0.5 font-bold text-primary">
            {item.quantityBoxes} {t("pos.boxes")}
          </span>
          <span className="text-on-surface-muted">+</span>
          <span className="rounded bg-surface-container-high px-2 py-0.5 text-on-surface">
            {item.quantityItems} {t("pos.items")}
          </span>
        </div>
        <span className="font-mono text-sm font-bold text-on-surface">
          = {totalPcs} {t("pos.pcsField")}
        </span>
      </div>

      {/* Typeable BOX / PCS rows */}
      <div className="grid grid-cols-2 gap-2">
        <QtyField
          label={t("pos.boxShort")}
          value={item.quantityBoxes}
          onChange={(value) => setBoxes(item.productId, value)}
        />
        <QtyField
          label={t("pos.pcsField")}
          value={item.quantityItems}
          onChange={(value) => setItems(item.productId, value)}
        />
      </div>
    </div>
  );
}

// ============================================================
// SECTION: QtyField — typeable number + mini steppers
// ============================================================

function QtyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-container-high px-2 py-1">
      <span className="block text-[10px] font-semibold text-on-surface-muted">
        {label}
      </span>
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`${label} −1`}
          className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-highest font-bold text-on-surface transition-colors hover:bg-outline/40"
        >
          −
        </button>
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={value}
          onChange={(event) =>
            onChange(Math.max(0, Number(event.target.value) || 0))
          }
          aria-label={label}
          className="w-full min-w-0 bg-transparent text-center font-mono text-sm font-bold text-on-surface focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={`${label} +1`}
          className="flex h-6 w-6 items-center justify-center rounded bg-primary font-bold text-on-primary transition-colors hover:bg-primary-strong"
        >
          +
        </button>
      </div>
    </div>
  );
}
