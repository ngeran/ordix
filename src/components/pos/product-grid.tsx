"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useMemo } from "react";
import { AlertTriangle, Package, PackageX, Search } from "lucide-react";
import type { Category } from "@/db/schema";
import type { ProductWithCategory } from "@/types";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "@/stores/toast-store";
import { useLocale, useT } from "@/lib/i18n";
import { cn, formatMoney, isLowStock } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================
// SECTION: Product grid
// ------------------------------------------------------------
// Search + category chips + responsive card grid. Tap a card to
// push it onto the ticket. Stock state is visible at a glance:
//   - normal: count pill
//   - low (≤ minStock): amber pill + warning icon
//   - out: grayed card, tap blocked (unless oversell is allowed)
// ============================================================

interface ProductGridProps {
  products: ProductWithCategory[] | null;
  categories: Category[];
  search: string;
  onSearch: (value: string) => void;
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  allowOversell: boolean;
  isStale: boolean;
}

export function ProductGrid({
  products,
  categories,
  search,
  onSearch,
  selectedCategoryId,
  onSelectCategory,
  allowOversell,
  isStale,
}: ProductGridProps) {
  const t = useT();
  const locale = useLocale();
  const addProduct = useCartStore((state) => state.addProduct);
  const items = useCartStore((state) => state.items);

  // Only categories with active placement in the tabs; inactive
  // categories disappear from the ordering surface entirely.
  const visibleCategories = useMemo(
    () => categories.filter((category) => category.isActive),
    [categories]
  );

  // ============================================================
  // SECTION: Add-to-ticket with oversell guard
  // ============================================================

  const handleAdd = (product: ProductWithCategory) => {
    const piecesPerBox = Math.max(1, product.itemsPerBox ?? 1);
    const piecePrice = product.pricePerItemCents ?? product.priceCents;
    const boxPrice = product.pricePerBoxCents ?? piecePrice * piecesPerBox;

    const existingLine = items.find((line) => line.productId === product.id);
    const nextPieces =
      (existingLine?.quantityBoxes ?? 0) * piecesPerBox +
      (existingLine?.quantityItems ?? 0) +
      (piecesPerBox > 1 ? piecesPerBox : 1);

    if (nextPieces > product.stockQuantity) {
      const message = t("pos.oversellBlocked", {
        count: product.stockQuantity,
        name: product.name,
      });
      if (allowOversell) {
        toast.warning(message);
      } else {
        toast.error(message);
        return;
      }
    }

    addProduct({
      productId: product.id,
      partNumber: product.partNumber,
      name: product.name,
      piecesPerBox,
      hasBoxPrice: product.pricePerBoxCents !== null,
      unitPriceBoxCents: boxPrice,
      unitPriceItemCents: piecePrice,
      imageUrl: product.imageUrl,
      availableStock: product.stockQuantity,
    });
  };

  const lowStockCount = (products ?? []).filter((p) => p.isLowStock).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ============================================================
          SECTION: Search + stale-data hint
          ============================================================ */}
      <div className="border-b border-border px-4 pb-3 pt-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-muted"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={t("pos.searchPlaceholder")}
            aria-label={t("common.search")}
            className="pl-11"
            type="search"
          />
        </div>
        {isStale && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {t("orders.staleData")}
          </p>
        )}
      </div>

      {/* ============================================================
          SECTION: Category chips (horizontal scroll, touch-first)
          ============================================================ */}
      <div
        className="scrollbar-hide flex gap-2 overflow-x-auto border-b border-border px-4 py-3"
        role="tablist"
        aria-label={t("products.category")}
      >
        <CategoryChip
          label={t("common.all")}
          selected={selectedCategoryId === null}
          onClick={() => onSelectCategory(null)}
        />
        {visibleCategories.map((category) => (
          <CategoryChip
            key={category.id}
            label={category.name}
            selected={selectedCategoryId === category.id}
            onClick={() =>
              onSelectCategory(
                selectedCategoryId === category.id ? null : category.id
              )
            }
          />
        ))}
      </div>

      {/* ============================================================
          SECTION: Grid
          ============================================================ */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
        {products === null ? null : products.length === 0 ? (
          <EmptyState
            icon={Package}
            title={t("products.empty")}
            hint={t("pos.searchPlaceholder")}
          />
        ) : (
          <ul
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
            aria-label={t("nav.products")}
          >
            {products.map((product) => {
              const isOutOfStock = product.stockQuantity === 0 && !allowOversell;
              const low = isLowStock(product.stockQuantity, product.minStock);
              return (
                <li key={product.id}>
                  <button
                    onClick={() => handleAdd(product)}
                    disabled={isOutOfStock}
                    className={cn(
                      "flex h-full w-full flex-col rounded-2xl border-2 border-border bg-surface p-4 text-left shadow-card transition-all",
                      "hover:border-primary hover:shadow-pop active:scale-[0.97] disabled:opacity-50 disabled:hover:border-border",
                      low && !isOutOfStock && "border-warning/60"
                    )}
                  >
                    {/* Image or placeholder */}
                    <div className="mb-3 flex h-24 w-full items-center justify-center overflow-hidden rounded-xl bg-surface-container-low">
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Package className="h-10 w-10 text-on-surface-muted/50" aria-hidden />
                      )}
                    </div>

                    {/* Name + part number */}
                    <span className="line-clamp-2 text-base font-semibold leading-snug">
                      {product.name}
                    </span>
                    <span className="mt-1 font-mono text-sm text-on-surface-muted">
                      {product.partNumber}
                    </span>

                    {/* Price + stock row: box price leads when the
                        product is boxed; piece price shown as hint */}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                      <span className="text-base font-bold leading-tight text-primary">
                        {product.pricePerBoxCents !== null
                          ? formatMoney(product.pricePerBoxCents, locale)
                          : formatMoney(
                              product.pricePerItemCents ?? product.priceCents,
                              locale
                            )}
                        {product.pricePerBoxCents !== null && (
                          <span className="block text-[11px] font-medium text-on-surface-muted">
                            {t("pos.perItem", {
                              price: formatMoney(
                                product.pricePerItemCents ?? product.priceCents,
                                locale
                              ),
                            })}
                          </span>
                        )}
                      </span>
                      {product.stockQuantity === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-semibold text-on-surface-muted">
                          <PackageX className="h-4 w-4" aria-hidden />
                          {t("pos.outOfStock")}
                        </span>
                      ) : low ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">
                          <AlertTriangle className="h-4 w-4" aria-hidden />
                          {t("pos.stockLeft", { count: product.stockQuantity })}
                        </span>
                      ) : (
                        <span className="rounded-full bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface-muted">
                          {t("pos.stockLeft", { count: product.stockQuantity })}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Low-stock summary line (when filtered list has alerts) */}
        {lowStockCount > 0 && (
          <p className="mt-4 text-center text-xs text-warning">
            ⚠ {t("stock.lowStockAlert", { count: lowStockCount })}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SECTION: Category chip
// ============================================================

function CategoryChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors",
        selected
          ? "bg-primary text-on-primary"
          : "bg-surface-container text-on-surface-muted hover:bg-surface-container-high"
      )}
    >
      {label}
    </button>
  );
}
