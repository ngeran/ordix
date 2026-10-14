"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useMemo, useState } from "react";
import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Category, Product } from "@/db/schema";
import type { ProductWithCategory } from "@/types";
import { api, showErrorToast } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductFormDialog } from "@/components/admin/product-form-dialog";

// ============================================================
// SECTION: Admin products screen
// ------------------------------------------------------------
// The catalog is pure identifiers (build-to-order): six fields,
// no stock, no prices — money is quoted on each order line.
// ============================================================

export function ProductsScreen() {
  const t = useT();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // -- Data (catalog includes inactive rows for management) --
  const productsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (categoryFilter) params.set("categoryId", categoryFilter);
    return `/api/products?${params.toString()}`;
  }, [search, categoryFilter]);

  const { data: products, refresh: refreshProducts } = usePolling<
    ProductWithCategory[]
  >(productsUrl, { intervalMs: 20_000 });
  const { data: categories, refresh: refreshCategories } = usePolling<
    Category[]
  >("/api/categories", { intervalMs: 60_000 });

  // -- Dialog state --
  const [editing, setEditing] = useState<
    ProductWithCategory | null | undefined
  >(undefined);
  const [deleting, setDeleting] = useState<ProductWithCategory | null>(null);

  // ============================================================
  // SECTION: Mutations
  // ============================================================

  const toggleActive = async (
    product: ProductWithCategory,
    next: boolean
  ) => {
    try {
      await api.patch<Product>(`/api/products/${product.id}`, {
        isActive: next,
      });
      refreshProducts();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      const result = await api.delete<{
        deleted: boolean;
        deactivated: boolean;
      }>(`/api/products/${deleting.id}`);
      if (result.deactivated) {
        toast.info(t("products.deleteConfirm", { name: deleting.name }));
      } else {
        toast.success(t("products.deleted"));
      }
      refreshProducts();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="w-full px-3 py-4 sm:px-5">
      {/* -- Header -- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("products.title")}</h1>
        <Button onClick={() => setEditing(null)}>
          <Plus className="h-5 w-5" />
          {t("products.new")}
        </Button>
      </div>

      {/* -- Filters -- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-muted"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("pos.searchPlaceholder")}
            aria-label={t("common.search")}
            className="pl-11"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label={t("products.category")}
          className="w-52"
        >
          <option value="">{t("common.all")}</option>
          {(categories ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>

      {/* -- Product cards -- */}
      {products === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : products.length === 0 ? (
        <EmptyState icon={Package} title={t("products.empty")} />
      ) : (
        <ul className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,24rem),1fr))]">
          {products.map((product) => (
            <li key={product.id} className="min-w-0">
              <Card
                className={cn(
                  "flex h-full flex-col gap-3 p-4",
                  !product.isActive && "opacity-60"
                )}
              >
                {/* Title */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 break-words font-semibold leading-snug">
                      {product.name}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-on-surface-muted">
                      {product.partNumber} · {product.categoryName ?? "—"}
                      {product.barcode ? ` · ${product.barcode}` : ""}
                    </p>
                  </div>
                </div>

                {/* Description (when present) */}
                {product.description && (
                  <p className="line-clamp-2 text-sm text-on-surface-muted">
                    {product.description}
                  </p>
                )}

                {/* Actions pinned to the card bottom */}
                <div className="mt-auto flex gap-2 border-t border-border pt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => setEditing(product)}
                  >
                    <Pencil className="h-4 w-4" />
                    {t("common.edit")}
                  </Button>
                  <div className="flex shrink-0 items-center gap-2 px-1">
                    <span className="text-xs text-on-surface-muted">
                      {product.isActive
                        ? t("common.active")
                        : t("common.inactive")}
                    </span>
                    <Switch
                      checked={product.isActive}
                      onChange={(next) => toggleActive(product, next)}
                      aria-label={t("products.isActive")}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="h-11 w-11 shrink-0"
                    onClick={() => setDeleting(product)}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="h-4 w-4 text-error" />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* -- Dialogs -- */}
      {/* editing === undefined → closed; null → create; product → edit */}
      {editing !== undefined && (
        <ProductFormDialog
          product={editing}
          categories={categories ?? []}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            refreshProducts();
            refreshCategories();
          }}
        />
      )}

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("common.delete")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-on-surface-muted">
          {t("products.deleteConfirm", { name: deleting?.name ?? "" })}
        </p>
      </Dialog>
    </div>
  );
}
