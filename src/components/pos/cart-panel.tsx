"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import { ArrowLeft, CheckCircle2, ReceiptText, Send, Trash2, UserRound } from "lucide-react";
import { useCartStore, type CartLine } from "@/stores/cart-store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================
// SECTION: Order tray
// ------------------------------------------------------------
// Newest line on top (what you just tapped is what you see).
// Each line: name + code, two BIG steppers (boxes / pieces) with
// typeable numbers, and the total pieces. Footer: one summary
// line, an optional note and the giant green send button —
// which turns into "choose the customer" while none is picked.
// Clearing the whole tray asks first (no accidental wipe).
// ============================================================

interface CartPanelProps {
  placing: boolean;
  onSubmit: () => void;
  /** Opens the customer picker (send pressed with no customer). */
  onPickCustomer: () => void;
  /** Present in sheet mode (phones) → shows a back button. */
  onClose?: () => void;
}

export function CartPanel({ placing, onSubmit, onPickCustomer, onClose }: CartPanelProps) {
  const t = useT();

  const items = useCartStore((state) => state.items);
  const notes = useCartStore((state) => state.notes);
  const customer = useCartStore((state) => state.customer);
  const appendOrderId = useCartStore((state) => state.appendOrderId);
  const appendOrderLabel = useCartStore((state) => state.appendOrderLabel);
  const removeLine = useCartStore((state) => state.removeLine);
  const setNotes = useCartStore((state) => state.setNotes);
  const clearCart = useCartStore((state) => state.clearCart);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  // 0/0 lines are drafts the operator cleared — skipped on send.
  const filled = items.filter((item) => item.quantityBoxes > 0 || item.quantityItems > 0);
  const totalPcs = filled.reduce(
    (sum, item) => sum + item.quantityBoxes * Math.max(1, item.piecesPerBox) + item.quantityItems,
    0
  );
  const needsCustomer = !appendOrderId && !customer;

  const submitLabel = needsCustomer
    ? t("customer.select")
    : appendOrderId
      ? t("pos.appendRound", { number: appendOrderLabel ?? "" })
      : t("pos.placeOrder");

  const confirmTitle = appendOrderId ? t("pos.confirmAppendTitle") : t("pos.confirmPlaceTitle");
  const confirmBody = appendOrderId
    ? t("pos.confirmAppendBody", { units: totalPcs, number: appendOrderLabel ?? "" })
    : t("pos.confirmPlaceBody", { units: totalPcs, customer: customer?.name ?? "" });

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* -- Header -- */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-1 pb-3 pt-1 short:pb-1.5 max-md:px-3 max-md:pt-3">
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("common.back")}>
            <ArrowLeft className="h-6 w-6" />
          </Button>
        )}
        <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-soft text-success">
          <ReceiptText className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold leading-tight">{t("pos.trayTitle")}</h2>
          <p className="truncate text-xs font-semibold text-on-surface-muted">
            {t("pos.trayCount", { count: filled.length, pcs: totalPcs })}
          </p>
        </div>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setClearOpen(true)} className="text-error">
            <Trash2 className="h-4 w-4" />
            <span className="md:max-lg:sr-only">{t("pos.clearCart")}</span>
          </Button>
        )}
      </div>

      {/* -- Lines (newest first); scrolls only when it must -- */}
      <div className="scrollbar-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto px-1 py-3 max-md:px-3">
        {items.length === 0 ? (
          // Short screens: the illustration would only be clipped.
          <div className="short:hidden">
            <EmptyState icon={ReceiptText} title={t("pos.cartEmpty")} hint={t("pos.cartEmptyHint")} />
          </div>
        ) : (
          [...items].reverse().map((item) => (
            <TrayRow key={item.productId} item={item} onRemove={removeLine} />
          ))
        )}
      </div>

      {/* -- Footer: note + the one big button -- */}
      <div className="flex shrink-0 flex-col gap-2.5 border-t border-border px-1 pt-3 max-md:px-3 max-md:pb-3">
        {!appendOrderId && (
          <Input
            className="short:hidden"
            value={notes ?? ""}
            onChange={(event) => setNotes(event.target.value || null)}
            placeholder={t("pos.orderNotes")}
            aria-label={t("pos.orderNotes")}
          />
        )}

        <Button
          variant={needsCustomer ? "primary" : "success"}
          size="xl"
          className="h-auto min-h-16 short:min-h-12 w-full whitespace-normal py-3 text-lg font-extrabold"
          disabled={filled.length === 0}
          loading={placing}
          onClick={() => (needsCustomer ? onPickCustomer() : setConfirmOpen(true))}
        >
          {needsCustomer ? <UserRound className="h-6 w-6 shrink-0" /> : <Send className="h-6 w-6 shrink-0" />}
          <span className="min-w-0 truncate">{submitLabel}</span>
        </Button>
      </div>

      {/* -- Send confirmation: one giant YES, one plain NO -- */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title={confirmTitle}>
        <p className="text-base">{confirmBody}</p>
        <ul className="mt-3 space-y-1 rounded-xl bg-surface-container-low p-3 text-sm">
          {filled.map((item) => (
            <li key={item.productId} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{item.name}</span>
              <span className="shrink-0 font-semibold">
                {item.quantityBoxes > 0 ? `${item.quantityBoxes} ${t("pos.boxShort")}` : ""}
                {item.quantityBoxes > 0 && item.quantityItems > 0 ? " + " : ""}
                {item.quantityItems > 0 ? `${item.quantityItems} ${t("pos.pcsField")}` : ""}
              </span>
            </li>
          ))}
        </ul>
        {/* Short screens hide the footer notes field; keep it reachable here */}
        {!appendOrderId && (
          <Input
            className="mt-3 hidden short:block"
            value={notes ?? ""}
            onChange={(event) => setNotes(event.target.value || null)}
            placeholder={t("pos.orderNotes")}
            aria-label={t("pos.orderNotes")}
          />
        )}
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
            <CheckCircle2 className="h-6 w-6" />
            {appendOrderId ? t("pos.confirmAppendYes") : t("pos.confirmYes")}
          </Button>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setConfirmOpen(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      </Dialog>

      {/* -- Clear-all confirmation -- */}
      <Dialog open={clearOpen} onClose={() => setClearOpen(false)} title={t("pos.clearCart")}>
        <p className="text-base text-on-surface-muted">{t("pos.trayCount", { count: items.length, pcs: totalPcs })}</p>
        <div className="mt-5 space-y-3">
          <Button
            variant="danger"
            size="lg"
            className="w-full"
            onClick={() => {
              clearCart();
              setClearOpen(false);
            }}
          >
            <Trash2 className="h-5 w-5" />
            {t("pos.clearCart")}
          </Button>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setClearOpen(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

// ============================================================
// SECTION: Tray row — big steppers for boxes and pieces
// ============================================================

function TrayRow({ item, onRemove }: { item: CartLine; onRemove: (productId: string) => void }) {
  const t = useT();
  const setBoxes = useCartStore((state) => state.setBoxes);
  const setItems = useCartStore((state) => state.setItems);

  const totalPcs = item.quantityBoxes * Math.max(1, item.piecesPerBox) + item.quantityItems;
  const empty = item.quantityBoxes === 0 && item.quantityItems === 0;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface p-3 shadow-card",
        empty ? "border-dashed border-warning/60" : "border-border"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-bold leading-snug text-on-surface [overflow-wrap:anywhere]">{item.name}</h4>
          <p className="font-mono text-xs text-on-surface-muted">
            {item.partNumber}
            {item.piecesPerBox > 1 && ` · ${t("pos.perBoxShort", { count: item.piecesPerBox })}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => onRemove(item.productId)}
          aria-label={`${t("common.remove")} ${item.name}`}
          title={t("common.remove")}
        >
          <Trash2 className="h-5 w-5 text-error" />
        </Button>
      </div>

      {/* Narrow tablet tray (md..lg) is ~270px: stack the two steppers so they never overflow */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 md:max-lg:grid-cols-1">
        <Stepper label={t("pos.boxes")} value={item.quantityBoxes} onChange={(value) => setBoxes(item.productId, value)} />
        <Stepper label={t("pos.items")} value={item.quantityItems} onChange={(value) => setItems(item.productId, value)} />
      </div>

      <p className="mt-2 text-right text-sm text-on-surface-muted">
        = <span className="font-mono text-base font-bold text-on-surface">{totalPcs}</span> {t("pos.pcsShort")}
      </p>
    </div>
  );
}

// ============================================================
// SECTION: Stepper — [−] typeable number [+]
// ============================================================

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-xl bg-surface-container-low p-1.5">
      <span className="block px-1 text-[11px] font-bold uppercase tracking-wide text-on-surface-muted">{label}</span>
      <div className="mt-0.5 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`${label} −1`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-container-highest text-xl font-bold text-on-surface transition-colors hover:bg-outline/40 active:scale-95"
        >
          −
        </button>
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
          aria-label={label}
          className="h-11 w-full min-w-0 rounded-lg bg-surface text-center font-mono text-lg font-bold text-on-surface focus:outline-2 focus:outline-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={`${label} +1`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-xl font-bold text-on-primary transition-colors hover:bg-primary-strong active:scale-95"
        >
          +
        </button>
      </div>
    </div>
  );
}
