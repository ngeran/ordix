"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import Link from "next/link";
import { BellRing } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import type { ProductWithCategory } from "@/types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

// ============================================================
// SECTION: Low-stock bell (header, admin only)
// ------------------------------------------------------------
// Polls the catalog every 30 s (backing off automatically on
// failures) and shows a badge with the number of products at or
// below their minimum. Tapping goes to the stock screen.
// ============================================================

export function LowStockBell() {
  const t = useT();
  const { data } = usePolling<ProductWithCategory[]>(
    "/api/products?active=true",
    { intervalMs: 30_000 }
  );

  const lowStockCount = (data ?? []).filter((product) => product.isLowStock).length;

  return (
    <Link
      href="/admin/stock"
      aria-label={
        lowStockCount > 0
          ? t("stock.lowStockAlert", { count: lowStockCount })
          : t("nav.stock")
      }
      title={t("stock.lowStockAlert", { count: lowStockCount })}
      className="relative inline-flex"
    >
      <Button variant="ghost" size="icon" tabIndex={-1} aria-hidden>
        <BellRing className="h-5 w-5" />
      </Button>
      {lowStockCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[11px] font-bold text-white">
          {lowStockCount}
        </span>
      )}
    </Link>
  );
}
