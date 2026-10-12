"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useMemo, useState } from "react";
import { Boxes, Package, Search } from "lucide-react";
import type { Category } from "@/db/schema";
import type { ProductWithCategory } from "@/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================
// SECTION: Product grid (Factory Parts Ledger)
// ------------------------------------------------------------
// Mockup-faithful cards: SKU pill + bin badge on top, bold name,
// one-line description, and a footer showing the sealed-box size
// ("Box = 25 pcs") with a Select button. Filtering (search +
// category) happens client-side so counts stay instant.
// ============================================================

interface ProductGridProps {
  products: ProductWithCategory[] | null;
  categories: Category[];
  activeProductId?: string;
  isStale: boolean;
  /** Tapping a card (or Select) loads it into the calculator. */
  onSelect: (product: ProductWithCategory) => void;
}

export function ProductGrid({
  products,
  categories,
  activeProductId,
  isStale,
  onSelect,
}: ProductGridProps) {
  const t = useT();

  // -- Client-side filtering state (catalog is small: ~dozens) --
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = products ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (product) =>
          product.name.toLowerCase().includes(q) ||
          product.partNumber.toLowerCase().includes(q) ||
          (product.barcode ?? "").toLowerCase().includes(q)
      );
    }
    if (categoryId) {
      list = list.filter((product) => product.categoryId === categoryId);
    }
    return list;
  }, [products, search, categoryId]);

  const countFor = (id: string | null) =>
    id === null
      ? (products ?? []).length
      : (products ?? []).filter((product) => product.categoryId === id).length;

  const visibleCategories = categories.filter((category) => category.isActive);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ============================================================
          SECTION: Scan-style search header
          ============================================================ */}
      <div className="border-b border-border px-4 pb-3 pt-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-muted"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("pos.searchPlaceholder")}
            aria-label={t("common.search")}
            className="pl-11 font-mono"
            type="search"
          />
        </div>
        {isStale && (
          <p className="mt-2 text-xs text-warning">{t("orders.staleData")}</p>
        )}
      </div>

      {/* ============================================================
          SECTION: Category pills with live counts
          ============================================================ */}
      <div
        className="scrollbar-hide flex gap-2 overflow-x-auto border-b border-border px-4 py-3"
        role="tablist"
        aria-label={t("products.category")}
      >
        <CategoryPill
          label={t("common.all")}
          count={countFor(null)}
          selected={categoryId === null}
          onClick={() => setCategoryId(null)}
        />
        {visibleCategories.map((category) => (
          <CategoryPill
            key={category.id}
            label={category.name}
            count={countFor(category.id)}
            selected={categoryId === category.id}
            onClick={() =>
              setCategoryId(categoryId === category.id ? null : category.id)
            }
          />
        ))}
      </div>

      {/* ============================================================
          SECTION: Part cards
          ============================================================ */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
        {products === null ? null : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title={t("products.empty")}
            hint={t("pos.searchPlaceholder")}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filtered.map((product) => (
              <PartCard
                key={product.id}
                product={product}
                active={product.id === activeProductId}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SECTION: Part card (mockup style — no images/prices/stock)
// ============================================================

function PartCard({
  product,
  active,
  onSelect,
}: {
  product: ProductWithCategory;
  active: boolean;
  onSelect: (product: ProductWithCategory) => void;
}) {
  const t = useT();

  return (
    <button
      onClick={() => onSelect(product)}
      className={cn(
        "flex h-full flex-col justify-between gap-3 rounded-xl border-2 bg-surface-container-low p-4 text-left shadow-card transition-all duration-150 hover:bg-surface-container",
        active
          ? "border-primary/80"
          : "border-border hover:border-primary/40"
      )}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="rounded border border-border bg-surface-container-high px-2.5 py-1 font-mono text-xs font-bold text-primary">
            {product.partNumber}
          </span>
        </div>
        <div>
          <h3 className="text-base font-extrabold leading-snug text-on-surface">
            {product.name}
          </h3>
          {product.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-on-surface-muted">
              {product.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2">
        {product.itemsPerBox ? (
          <span className="flex items-center gap-2 text-sm font-bold text-on-surface">
            <Boxes className="h-5 w-5 text-success" aria-hidden />
            {t("pos.boxEquals", { count: product.itemsPerBox })}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm font-bold text-on-surface-muted">
            <Package className="h-5 w-5" aria-hidden />
            {t("pos.looseOnly")}
          </span>
        )}
        <span
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-bold transition-all",
            active
              ? "bg-primary text-on-primary"
              : "bg-surface-container-high text-on-surface hover:bg-primary hover:text-on-primary"
          )}
        >
          {t("pos.select")}
        </span>
      </div>
    </button>
  );
}

// ============================================================
// SECTION: Category pill with count
// ============================================================

function CategoryPill({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 font-semibold transition-all",
        selected
          ? "bg-primary text-on-primary shadow"
          : "border border-border bg-surface-container text-on-surface-muted hover:bg-surface-container-high hover:text-on-surface"
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 font-mono text-xs",
          selected ? "bg-on-primary/20 text-on-primary" : "text-on-surface-muted"
        )}
      >
        {count}
      </span>
    </button>
  );
}
