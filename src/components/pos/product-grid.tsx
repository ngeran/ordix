"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useMemo } from "react";
import { Package, Search } from "lucide-react";
import type { Category } from "@/db/schema";
import type { ProductWithCategory } from "@/types";
import { useCartStore } from "@/stores/cart-store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================
// SECTION: Product grid
// ------------------------------------------------------------
// Search + category chips + responsive card grid. Tap a card to
// push it onto the ticket (one box by default — adjust κουτιά /
// τεμάχια in the ticket). Build-to-order: no stock badges, no
// oversell guard — every product is made to order.
// ============================================================

interface ProductGridProps {
  products: ProductWithCategory[] | null;
  categories: Category[];
  search: string;
  onSearch: (value: string) => void;
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  isStale: boolean;
}

export function ProductGrid({
  products,
  categories,
  search,
  onSearch,
  selectedCategoryId,
  onSelectCategory,
  isStale,
}: ProductGridProps) {
  const t = useT();
  const addProduct = useCartStore((state) => state.addProduct);

  // Only categories with active placement in the tabs; inactive
  // categories disappear from the ordering surface entirely.
  const visibleCategories = useMemo(
    () => categories.filter((category) => category.isActive),
    [categories]
  );

  // ============================================================
  // SECTION: Add-to-ticket
  // ============================================================

  const handleAdd = (product: ProductWithCategory) => {
    addProduct({
      productId: product.id,
      partNumber: product.partNumber,
      name: product.name,
      imageUrl: product.imageUrl,
    });
  };

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
          <p className="mt-2 text-xs text-warning">{t("orders.staleData")}</p>
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
            {products.map((product) => (
              <li key={product.id}>
                <button
                  onClick={() => handleAdd(product)}
                  className="flex h-full w-full flex-col rounded-2xl border-2 border-border bg-surface p-4 text-left shadow-card transition-all hover:border-primary hover:shadow-pop active:scale-[0.97]"
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
                      <Package
                        className="h-10 w-10 text-on-surface-muted/50"
                        aria-hidden
                      />
                    )}
                  </div>

                  {/* Name + part number + barcode */}
                  <span className="line-clamp-2 text-base font-semibold leading-snug">
                    {product.name}
                  </span>
                  <span className="mt-1 font-mono text-sm text-on-surface-muted">
                    {product.partNumber}
                  </span>
                  {product.barcode && (
                    <span className="mt-0.5 font-mono text-xs text-on-surface-muted/70">
                      {product.barcode}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
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
