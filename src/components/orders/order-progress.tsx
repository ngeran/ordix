"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useT } from "@/lib/i18n";

// ============================================================
// SECTION: Order progress bar
// ------------------------------------------------------------
// Segmented production progress: green = produced, amber = in
// production, gray = not started. Exposed as a progressbar for
// screen readers with the "{done}/{count} produced" label.
// ============================================================

interface OrderProgressProps {
  order: Pick<
    import("@/types").OrderSummary,
    "itemCount" | "producedCount" | "inProductionCount"
  >;
}

export function OrderProgress({ order }: OrderProgressProps) {
  const t = useT();
  const total = Math.max(1, order.itemCount);
  const producedPct = Math.round((order.producedCount / total) * 100);
  const inProdPct = Math.round(
    (order.inProductionCount / total) * 100
  );

  return (
    <div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={order.itemCount}
        aria-valuenow={order.producedCount}
        aria-label={t("orders.progress", {
          done: order.producedCount,
          count: order.itemCount,
        })}
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high"
      >
        <div className="bg-success" style={{ width: `${producedPct}%` }} />
        <div className="bg-warning" style={{ width: `${inProdPct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-on-surface-muted">
        {t("orders.progress", {
          done: order.producedCount,
          count: order.itemCount,
        })}
      </p>
    </div>
  );
}
