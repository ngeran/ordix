"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useMemo, useState } from "react";
import { Boxes, LayoutGrid, Package, Plus, Search, Table2 } from "lucide-react";
import type { Category } from "@/db/schema";
import type { ProductWithCategory } from "@/types";
import { useCartStore } from "@/stores/cart-store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

// ============================================================
// SECTION: Product grid (Factory Parts Ledger)
// ------------------------------------------------------------
// Two views, operator's choice (remembered per device):
//   - Cards: compact code + name + box size + Add button
//   - Table: dense rows for large catalogs on desktop
// Both feed the same Order Tray on the right.
// ============================================================

type CatalogView = "cards" | "table";

/** Remembered per device so the operator keeps their layout. */
function readSavedView(): CatalogView {
  try {
    return localStorage.getItem("ordix-catalog-view") === "table"
      ? "table"
      : "cards";
  } catch {
    return "cards";
  }
}

interface ProductGridProps {
  products: ProductWithCategory[] | null;
  categories: Category[];
  isStale: boolean;
  /** Tapping a card (or Add) pushes one box onto the tray. */
  onAdd: (product: ProductWithCategory) => void;
}

export function ProductGrid({
  products,
  categories,
  isStale,
  onAdd,
}: ProductGridProps) {
  const t = useT();
  const items = useCartStore((state) => state.items);

  // -- Client-side filtering state (catalog is small: ~dozens) --
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [view, setView] = useState<CatalogView>(readSavedView);

  const switchView = (next: CatalogView) => {
    setView(next);
    try {
      localStorage.setItem("ordix-catalog-view", next);
    } catch {
      // storage unavailable — view just won't persist
    }
  };

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
          SECTION: Search + view toggle
          ============================================================ */}
      <div className="border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-muted"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("pos.searchPlaceholder")}
              aria-label={t("common.search")}
              className="pl-11 font-medium"
              type="search"
            />
          </div>

          {/* Cards / Table toggle */}
          <div
            className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-surface p-1"
            role="group"
            aria-label={t("products.category")}
          >
            <ViewButton
              active={view === "cards"}
              onClick={() => switchView("cards")}
              label={t("pos.viewCards")}
              icon={<LayoutGrid className="h-5 w-5" />}
            />
            <ViewButton
              active={view === "table"}
              onClick={() => switchView("table")}
              label={t("pos.viewTable")}
              icon={<Table2 className="h-5 w-5" />}
            />
          </div>
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
          SECTION: Catalog content (cards or table)
          ============================================================ */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
        {products === null ? null : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title={t("products.empty")}
            hint={t("pos.searchPlaceholder")}
          />
        ) : view === "cards" ? (
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((product) => (
              <CompactCard
                key={product.id}
                product={product}
                queued={
                  items.find((item) => item.productId === product.id)
                    ?.quantityBoxes ?? 0
                }
                onAdd={onAdd}
              />
            ))}
          </ul>
        ) : (
          <CatalogTable
            products={filtered}
            onAdd={onAdd}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// SECTION: View toggle button
// ============================================================

function ViewButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-10 items-center justify-center rounded-lg transition-colors",
        active
          ? "bg-primary text-on-primary"
          : "text-on-surface-muted hover:bg-surface-container-high hover:text-on-surface"
      )}
    >
      {icon}
    </button>
  );
}

// ============================================================
// SECTION: Compact card (small footprint, tap = add)
// ============================================================

function CompactCard({
  product,
  queued,
  onAdd,
}: {
  product: ProductWithCategory;
  queued: number;
  onAdd: (product: ProductWithCategory) => void;
}) {
  const t = useT();

  return (
    <article
      className={cn(
        "flex h-full flex-col justify-between gap-2 rounded-xl border bg-surface p-3 transition-all",
        queued > 0
          ? "border-primary/70"
          : "border-border hover:border-primary/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="rounded border border-primary/20 bg-primary-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
          {product.partNumber}
        </span>
        {queued > 0 && (
          <span className="font-mono text-xs text-on-surface-muted">×{queued}</span>
        )}
      </div>

      <h3 className="text-sm font-bold leading-snug text-on-surface">
        {product.name}
      </h3>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        {product.itemsPerBox ? (
          <span className="flex items-center gap-1.5 font-mono text-xs text-on-surface-muted">
            <Boxes className="h-4 w-4" aria-hidden />
            {t("pos.boxEquals", { count: product.itemsPerBox })}
          </span>
        ) : (
          <span />
        )}
        <Button variant="secondary" size="sm" onClick={() => onAdd(product)}>
          <Plus className="h-4 w-4" />
          {t("pos.addToTray")}
        </Button>
      </div>
    </article>
  );
}

// ============================================================
// SECTION: Table view (dense rows for big catalogs)
// ============================================================

function CatalogTable({
  products,
  onAdd,
}: {
  products: ProductWithCategory[];
  onAdd: (product: ProductWithCategory) => void;
}) {
  const t = useT();

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-on-surface-muted">
          <th className="px-3 py-2">{t("products.partNumber")}</th>
          <th className="px-3 py-2">{t("products.name")}</th>
          <th className="px-3 py-2 text-right">{t("pos.boxSize")}</th>
          <th className="px-3 py-2" />
        </tr>
      </thead>
      <tbody>
        {products.map((product) => (
          <tr
            key={product.id}
            className="border-b border-border/60 transition-colors hover:bg-surface-container-low"
          >
            <td className="px-3 py-2">
              <span className="rounded border border-primary/20 bg-primary-soft px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                {product.partNumber}
              </span>
            </td>
            <td className="max-w-0 truncate px-3 py-2 font-medium text-on-surface">
              {product.name}
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs text-on-surface-muted">
              {product.itemsPerBox
                ? t("pos.boxEquals", { count: product.itemsPerBox })
                : "—"}
            </td>
            <td className="px-3 py-2 text-right">
              <Button variant="secondary" size="sm" onClick={() => onAdd(product)}>
                <Plus className="h-4 w-4" />
                {t("pos.addToTray")}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
        "flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm transition-all",
        selected
          ? "bg-primary font-semibold text-on-primary shadow-md"
          : "border border-border bg-surface text-on-surface-muted hover:bg-surface-container-high hover:text-on-surface"
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 font-mono text-[11px]",
          selected ? "bg-on-primary/20 text-on-primary" : "text-on-surface-muted"
        )}
      >
        {count}
      </span>
    </button>
  );
}
