// ============================================================
// SECTION: Item labels (shared production-state rendering)
// ------------------------------------------------------------
// One place that knows how to talk about an order line: its
// quantity ("1 Box + 23 Items"), its production state ("Waiting")
// and the badge classes that go with it. Used by the production
// board, the order detail page and the closure screen.
// ============================================================

import type { MessageKey } from "@/lib/i18n";

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface LabelableItem {
  quantityBoxes: number;
  quantityItems: number;
}

/** "1 Box + 23 Items" (or whichever part is non-zero). */
export function quantityLabel(item: LabelableItem, t: Translate): string {
  const parts: string[] = [];
  if (item.quantityBoxes > 0) {
    parts.push(
      `${item.quantityBoxes} ${t("pos.boxes")}`
    );
  }
  if (item.quantityItems > 0) {
    parts.push(`${item.quantityItems} ${t("pos.items")}`);
  }
  return parts.length > 0 ? parts.join(" + ") : `0 ${t("pos.items")}`;
}

/** Production-state label ("Waiting" / "In production" / "Produced"). */
export function productionLabel(
  status: string,
  t: Translate
): string {
  switch (status) {
    case "pending":
      return t("detail.awaitingProduction");
    case "in_production":
      return t("detail.inProduction");
    case "completed":
      return t("detail.produced");
    default:
      return status;
  }
}

/** Badge colors per production state (dark + light safe). */
export const PRODUCTION_BADGE_CLASS: Record<string, string> = {
  pending: "bg-surface-container-high text-on-surface-muted",
  in_production: "bg-warning-soft text-warning",
  completed: "bg-success-soft text-success",
};
