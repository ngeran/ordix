"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ============================================================
// SECTION: Box + Item Split Calculator
// ------------------------------------------------------------
// The heart of the order flow (Tactile Warehouse OS mockup):
// the tapped part card loads here, the operator sets ΚΟΥΤΙΑ and
// ΤΕΜΑΧΙΑ with big steppers or glove-friendly presets (+1 Box,
// +5 Boxes, +10 Loose, Reset), sees a plain-language allocation
// ("2 boxes and 23 items · 73 pcs total"), types the quoted €
// price, and applies the line to the order tray.
// ============================================================

export interface ActivePart {
  productId: string;
  partNumber: string;
  name: string;
  /** Pieces per sealed box (κουτί). */
  piecesPerBox: number;
  boxes: number;
  items: number;
  linePriceCents: number;
}

interface CalculatorPanelProps {
  part: ActivePart | null;
  setPart: (part: ActivePart | null) => void;
  onApply: (part: ActivePart) => void;
}

export function CalculatorPanel({ part, setPart, onApply }: CalculatorPanelProps) {
  const t = useT();

  if (!part) return null;

  const totalPieces = part.boxes * part.piecesPerBox + part.items;

  const allocationText = (() => {
    if (part.boxes > 0 && part.items > 0) {
      return t("calc.summaryBoth", { boxes: part.boxes, items: part.items });
    }
    if (part.boxes > 0) {
      return t("calc.summaryBoxesOnly", { boxes: part.boxes });
    }
    return t("calc.summaryItemsOnly", { items: part.items });
  })();

  const patch = (changes: Partial<ActivePart>) =>
    setPart({ ...part, ...changes });

  return (
    <div className="rounded-2xl border-2 border-primary/50 bg-surface-container-low p-4 shadow-pop">
      {/* -- Active part header -- */}
      <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
            {t("calc.title")}
          </span>
          <h4 className="mt-0.5 truncate text-lg font-extrabold text-on-surface">
            {part.name}
          </h4>
          <span className="mt-0.5 block font-mono text-xs text-on-surface-muted">
            {part.partNumber}
          </span>
        </div>
        <span className="shrink-0 rounded-lg bg-success-soft px-2.5 py-1 font-mono text-xs font-bold text-success">
          {t("calc.packSize", { count: part.piecesPerBox })}
        </span>
      </div>

      {/* -- Plain-language allocation readout -- */}
      <div className="my-3 flex items-center justify-between rounded-xl border border-border bg-surface-container-lowest p-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">
            {t("calc.allocation")}
          </span>
          <p className="text-lg font-extrabold text-success">{allocationText}</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-on-surface-muted">{t("calc.totalPieces")}</span>
          <p className="font-mono text-xl font-extrabold text-on-surface">
            {totalPieces}
          </p>
        </div>
      </div>

      {/* -- Segmented counters: boxes + loose pieces -- */}
      <div className="grid grid-cols-2 gap-3">
        <Stepper
          label={t("pos.boxes")}
          value={part.boxes}
          onDec={() => patch({ boxes: Math.max(0, part.boxes - 1) })}
          onInc={() => patch({ boxes: part.boxes + 1 })}
        />
        <Stepper
          label={t("pos.items")}
          value={part.items}
          onDec={() => patch({ items: Math.max(0, part.items - 1) })}
          onInc={() => patch({ items: part.items + 1 })}
        />
      </div>

      {/* -- Glove-friendly presets -- */}
      <div className="mt-3">
        <span className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">
          {t("calc.presets")}
        </span>
        <div className="mt-1.5 grid grid-cols-4 gap-2">
          <PresetButton label="+1" onClick={() => patch({ boxes: part.boxes + 1 })} />
          <PresetButton label="+5" onClick={() => patch({ boxes: part.boxes + 5 })} />
          <PresetButton label="+10" onClick={() => patch({ items: part.items + 10 })} />
          <PresetButton
            label={t("calc.reset")}
            icon={<RotateCcw className="h-4 w-4" />}
            danger
            onClick={() => patch({ boxes: 0, items: 0 })}
          />
        </div>
      </div>

      {/* -- Apply to the order tray -- */}
      <Button
        variant="primary"
        size="lg"
        className="mt-3 w-full"
        disabled={totalPieces === 0}
        onClick={() => onApply(part)}
      >
        {t("calc.apply")}
      </Button>
    </div>
  );
}

// ============================================================
// SECTION: Segmented stepper (mockup style: inset track, big +/-)
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
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-container p-3">
      <span className="text-xs font-bold uppercase tracking-wide text-primary">
        {label}
      </span>
      <div className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-1">
        <Button variant="secondary" size="iconSm" onClick={onDec} aria-label={`${label} −1`}>
          <Minus className="h-5 w-5" />
        </Button>
        <span className="w-12 text-center font-mono text-2xl font-extrabold" aria-live="polite">
          {value}
        </span>
        <Button size="iconSm" onClick={onInc} aria-label={`${label} +1`}>
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

function PresetButton({
  label,
  onClick,
  danger,
  icon,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-11 items-center justify-center gap-1 rounded-lg border border-border bg-surface-container text-sm font-bold text-on-surface transition-all hover:bg-surface-container-high active:scale-95",
        danger && "hover:border-error/40 hover:text-error"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
