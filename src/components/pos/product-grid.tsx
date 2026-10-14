"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Check, LayoutGrid, LayoutList, Package, Plus, Search, Table2, X } from "lucide-react";
import type { Category } from "@/db/schema";
import type { ProductWithCategory } from "@/types";
import { useCartStore } from "@/stores/cart-store";
import { useLocale, useT } from "@/lib/i18n";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

// ============================================================
// SECTION: Product catalog (order entry)
// ------------------------------------------------------------
//   - One big search box: name, part number, barcode, category.
//     Enter on an exact code (or a single result) adds it and
//     clears the box — so a barcode scanner "just works".
//   - Category chips with live counts.
//   - Cards: the WHOLE card is the add button; a green badge
//     shows what's already in the tray.
//   - Table view for big catalogs (remembered per device).
// ============================================================

type CatalogView = "cards" | "table";

/** Remembered per device so the operator keeps their layout. */
function readSavedView(): CatalogView {
  try {
    return localStorage.getItem("ordix-catalog-view") === "table" ? "table" : "cards";
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

export function ProductGrid({ products, categories, isStale, onAdd }: ProductGridProps) {
  const t = useT();
  const locale = useLocale();
  const items = useCartStore((state) => state.items);
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [view, setView] = useState<CatalogView>("cards");

  // Restore the saved view after mount (localStorage is client-only).
  useEffect(() => setView(readSavedView()), []);

  // Desktop (mouse/keyboard): put the cursor in the search box.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) searchRef.current?.focus();
  }, []);

  const switchView = (next: CatalogView) => {
    setView(next);
    try {
      localStorage.setItem("ordix-catalog-view", next);
    } catch {
      // storage unavailable — view just won't persist
    }
  };

  const categoryName = (category: Category) =>
    locale === "el" && category.nameEl ? category.nameEl : category.name;

  const filtered = useMemo(() => {
    let list = products ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (product) =>
          product.name.toLowerCase().includes(q) ||
          product.partNumber.toLowerCase().includes(q) ||
          (product.barcode ?? "").toLowerCase().includes(q) ||
          (product.categoryName ?? "").toLowerCase().includes(q) ||
          (product.description ?? "").toLowerCase().includes(q)
      );
    }
    if (categoryId) {
      list = list.filter((product) => product.categoryId === categoryId);
    }
    return list;
  }, [products, search, categoryId]);

  // Card taps give visual feedback on the card itself (green
  // badge); only a scan/Enter add — where the eyes are on the
  // scanner, not the card — confirms with a toast.
  const add = (product: ProductWithCategory) => onAdd(product);

  // Enter: exact code match → add; else a single result → add.
  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    const exact = (products ?? []).find(
      (product) =>
        product.partNumber.toLowerCase() === q || (product.barcode ?? "").toLowerCase() === q
    );
    const target = exact ?? (filtered.length === 1 ? filtered[0] : null);
    if (target) {
      event.preventDefault();
      add(target);
      toast.success(t("pos.added", { name: target.name }));
      setSearch("");
    }
  };

  const countFor = (id: string | null) =>
    id === null
      ? (products ?? []).length
      : (products ?? []).filter((product) => product.categoryId === id).length;

  const visibleCategories = categories.filter((category) => category.isActive);

  // One option list feeds the strip, the vertical list and the sheet.
  // Tapping the selected category again returns to "All".
  const categoryOptions = [
    { id: null, label: t("common.all"), count: countFor(null), selected: categoryId === null, onClick: () => setCategoryId(null) },
    ...visibleCategories.map((category) => ({
      id: category.id,
      label: categoryName(category),
      count: countFor(category.id),
      selected: categoryId === category.id,
      onClick: () => setCategoryId(categoryId === category.id ? null : category.id),
    })),
  ];

  // Keep the chosen chip visible in the strip (e.g. picked from the sheet).
  const stripRef = useRef<HTMLDivElement>(null);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [categoryId]);
  const qtyInTray = (productId: string) => {
    const line = items.find((item) => item.productId === productId);
    return line ? { boxes: line.quantityBoxes, pcs: line.quantityItems } : null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ============================================================
          SECTION: Search + view toggle
          ============================================================ */}
      <div className="shrink-0 px-3 pb-2 pt-3 sm:px-4 short:pb-1 short:pt-1.5">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-6 w-6 -translate-y-1/2 text-on-surface-muted"
              aria-hidden
            />
            <Input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={onSearchKey}
              placeholder={t("pos.searchPlaceholder")}
              aria-label={t("common.search")}
              className="h-14 short:h-11 pl-12 pr-12 text-lg font-medium"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  searchRef.current?.focus();
                }}
                aria-label={t("pos.clearSearch")}
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-on-surface-muted hover:bg-surface-container"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <div
            className="hidden shrink-0 items-center gap-1 rounded-xl border border-border bg-surface p-1 sm:flex"
            role="group"
          >
            <ViewButton active={view === "cards"} onClick={() => switchView("cards")} label={t("pos.viewCards")} icon={<LayoutGrid className="h-5 w-5" />} />
            <ViewButton active={view === "table"} onClick={() => switchView("table")} label={t("pos.viewTable")} icon={<Table2 className="h-5 w-5" />} />
          </div>
        </div>
        <p className="mt-1.5 flex items-center short:hidden justify-between short:mt-0.5 gap-2 px-1 text-xs text-on-surface-muted">
          <span className="min-w-0 truncate short:hidden">{t("pos.scanHint")}</span>
          {products && <span className="shrink-0 font-semibold">{t("pos.resultsCount", { count: filtered.length })}</span>}
        </p>
        {isStale && <p className="mt-1 text-xs text-warning">{t("orders.staleData")}</p>}
      </div>

      {/* ============================================================
          SECTION: Categories (live counts) + catalog
          ------------------------------------------------------------
          xl+ (iPad Pro / 10" Android landscape, desktops): a vertical
          list beside the catalog — every category visible at once.
          Below: a swipeable strip (fades at the edges so it reads as
          "more this way", keeps the selection in view) plus an
          "All categories" button opening a sheet of big tiles, so a
          category is never more than two taps away.
          ============================================================ */}
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
      {visibleCategories.length > 0 && (
        <>
          <div
            className="scrollbar-thin hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-3 xl:flex"
            role="tablist"
            aria-orientation="vertical"
            aria-label={t("products.category")}
          >
            {categoryOptions.map((option) => (
              <CategoryOption key={option.id ?? "all"} variant="row" {...option} />
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 border-b border-border pb-3 pl-2 pr-3 short:pb-1.5 sm:pl-3 sm:pr-4 xl:hidden">
            <div
              ref={stripRef}
              className="scrollbar-hide flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 [mask-image:linear-gradient(to_right,transparent,#000_0.75rem,#000_calc(100%-2.5rem),transparent)]"
              role="tablist"
              aria-label={t("products.category")}
            >
              {categoryOptions.map((option) => (
                <CategoryOption key={option.id ?? "all"} variant="pill" {...option} />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCategorySheetOpen(true)}
              aria-label={t("pos.allCategories")}
              title={t("pos.allCategories")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-on-surface-muted transition-colors hover:bg-surface-container-high hover:text-on-surface short:h-10 short:w-10"
            >
              <LayoutList className="h-5 w-5" />
            </button>
          </div>

          <Dialog
            open={categorySheetOpen}
            onClose={() => setCategorySheetOpen(false)}
            title={t("pos.chooseCategory")}
            wide
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categoryOptions.map((option) => (
                <CategoryOption
                  key={option.id ?? "all"}
                  variant="tile"
                  {...option}
                  onClick={() => {
                    option.onClick();
                    setCategorySheetOpen(false);
                  }}
                />
              ))}
            </div>
          </Dialog>
        </>
      )}

      {/* ============================================================
          SECTION: Catalog content (cards or table)
          ============================================================ */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {products === null ? null : filtered.length === 0 ? (
          <EmptyState icon={Package} title={t("products.empty")} hint={t("pos.searchPlaceholder")} />
        ) : view === "cards" ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-2.5">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} inTray={qtyInTray(product.id)} onAdd={add} />
            ))}
          </ul>
        ) : (
          <CatalogTable products={filtered} qtyInTray={qtyInTray} onAdd={add} />
        )}
      </div>
      </div>
    </div>
  );
}

// ============================================================
// SECTION: Product card — the whole card adds one box
// ============================================================

function ProductCard({
  product,
  inTray,
  onAdd,
}: {
  product: ProductWithCategory;
  inTray: { boxes: number; pcs: number } | null;
  onAdd: (product: ProductWithCategory) => void;
}) {
  const t = useT();

  return (
    <li>
      <button
        type="button"
        onClick={() => onAdd(product)}
        className={cn(
          "group flex h-full w-full flex-col gap-2 rounded-2xl border-2 bg-surface p-3 text-left transition-all active:scale-[0.98]",
          inTray ? "border-success/70 bg-success-soft/40" : "border-border hover:border-primary/60"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <span className="rounded-md border border-primary/20 bg-primary-soft px-2 py-0.5 font-mono text-xs font-semibold text-primary">
            {product.partNumber}
          </span>
          {inTray && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success px-2 py-0.5 text-xs font-bold text-white">
              <Check className="h-3.5 w-3.5" aria-hidden />
              {inTray.boxes > 0 ? `${inTray.boxes} ${t("pos.boxShort")}` : ""}
              {inTray.boxes > 0 && inTray.pcs > 0 ? " + " : ""}
              {inTray.pcs > 0 ? `${inTray.pcs} ${t("pos.pcsField")}` : ""}
              {inTray.boxes === 0 && inTray.pcs === 0 ? t("pos.inTray") : ""}
            </span>
          )}
        </div>

        <h3 className="text-base font-bold leading-snug text-on-surface [overflow-wrap:anywhere]">{product.name}</h3>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-on-surface-muted">
            {product.itemsPerBox ? (
              <>
                <Boxes className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{t("pos.boxEquals", { count: product.itemsPerBox })}</span>
              </>
            ) : (
              // Own span: `truncate` on the flex parent can't ellipsize bare text.
              <span className="truncate">{product.categoryName ?? ""}</span>
            )}
          </span>
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary transition-transform group-hover:scale-105"
          >
            <Plus className="h-6 w-6" />
          </span>
        </div>
        <span className="sr-only">{t("pos.addToTray")}</span>
      </button>
    </li>
  );
}

// ============================================================
// SECTION: Table view (dense rows for big catalogs)
// ============================================================

function CatalogTable({
  products,
  qtyInTray,
  onAdd,
}: {
  products: ProductWithCategory[];
  qtyInTray: (productId: string) => { boxes: number; pcs: number } | null;
  onAdd: (product: ProductWithCategory) => void;
}) {
  const t = useT();

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-on-surface-muted">
          <th className="px-3 py-2">{t("products.partNumber")}</th>
          <th className="px-3 py-2">{t("products.name")}</th>
          <th className="hidden px-3 py-2 text-right lg:table-cell">{t("pos.boxSize")}</th>
          <th className="px-3 py-2" />
        </tr>
      </thead>
      <tbody>
        {products.map((product) => {
          const inTray = qtyInTray(product.id);
          return (
            <tr
              key={product.id}
              className={cn(
                "border-b border-border/60 transition-colors hover:bg-surface-container-low",
                inTray && "bg-success-soft/40"
              )}
            >
              <td className="px-3 py-2">
                <span className="rounded border border-primary/20 bg-primary-soft px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                  {product.partNumber}
                </span>
              </td>
              <td className="max-w-0 truncate px-3 py-2 font-medium text-on-surface">{product.name}</td>
              <td className="hidden px-3 py-2 text-right font-mono text-xs text-on-surface-muted lg:table-cell">
                {product.itemsPerBox ? t("pos.boxEquals", { count: product.itemsPerBox }) : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <Button variant={inTray ? "success" : "secondary"} size="sm" onClick={() => onAdd(product)}>
                  {inTray ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {t("pos.addToTray")}
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ============================================================
// SECTION: Category option (strip pill / list row / sheet tile)
// ============================================================

function CategoryOption({
  variant,
  label,
  count,
  selected,
  onClick,
}: {
  variant: "pill" | "row" | "tile";
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 text-sm font-medium transition-all",
        variant === "pill" && "h-11 shrink-0 whitespace-nowrap rounded-full px-4 short:h-10",
        variant === "row" && "min-h-12 w-full justify-between rounded-xl px-3.5 py-2 text-left",
        variant === "tile" && "min-h-16 flex-col items-start justify-center rounded-2xl px-4 py-3 text-left text-base",
        selected
          ? "bg-primary font-semibold text-on-primary shadow-md"
          : "border border-border bg-surface text-on-surface-muted hover:bg-surface-container-high hover:text-on-surface"
      )}
    >
      <span className={cn(variant !== "pill" && "min-w-0 [overflow-wrap:anywhere]")}>{label}</span>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-xs",
          selected ? "bg-on-primary/20 text-on-primary" : "bg-surface-container-high"
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ============================================================
// SECTION: Cards / table view toggle button
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
        "flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
        active ? "bg-primary text-on-primary" : "text-on-surface-muted hover:bg-surface-container-high hover:text-on-surface"
      )}
    >
      {icon}
    </button>
  );
}
