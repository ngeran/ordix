"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useMemo, useState } from "react";
import { AlertTriangle, Package, Pencil, Plus, Search, Trash2, Warehouse } from "lucide-react";
import type { Category, Product } from "@/db/schema";
import type { ProductWithCategory } from "@/types";
import { api } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import { useLocale, useT } from "@/lib/i18n";
import { cn, formatMoney } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductFormDialog } from "@/components/admin/product-form-dialog";
import { AdjustStockDialog } from "@/components/admin/adjust-stock-dialog";

// ============================================================
// SECTION: Admin products screen
// ------------------------------------------------------------
// Catalog CRUD for admins: search, category filter, create/
// edit dialog, deactivate toggle, delete (soft when the product
// has history), quick stock adjust.
// ============================================================

export function ProductsScreen() {
  const t = useT();
  const locale = useLocale();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // -- Data (catalog includes inactive rows for management) --
  const productsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (categoryFilter) params.set("categoryId", categoryFilter);
    return `/api/products?${params.toString()}`;
  }, [search, categoryFilter]);

  const { data: products, refresh: refreshProducts } = usePolling<ProductWithCategory[]>(
    productsUrl,
    { intervalMs: 20_000 }
  );
  const { data: categories, refresh: refreshCategories } = usePolling<Category[]>(
    "/api/categories",
    { intervalMs: 60_000 }
  );

  // -- Dialog state --
  const [editing, setEditing] = useState<ProductWithCategory | null | undefined>(undefined);
  const [adjusting, setAdjusting] = useState<ProductWithCategory | null>(null);
  const [deleting, setDeleting] = useState<ProductWithCategory | null>(null);

  // ============================================================
  // SECTION: Mutations
  // ============================================================

  const toggleActive = async (product: ProductWithCategory, next: boolean) => {
    try {
      await api.patch<Product>(`/api/products/${product.id}`, { isActive: next });
      refreshProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error.generic"));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      const result = await api.delete<{ deleted: boolean; deactivated: boolean }>(
        `/api/products/${deleting.id}`
      );
      if (result.deactivated) {
        toast.info(t("products.deleteConfirm", { name: deleting.name })); // explain soft-delete
      } else {
        toast.success(t("products.deleted"));
      }
      refreshProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error.generic"));
    } finally {
      setDeleting(null);
    }
  };

  const lowStockCount = (products ?? []).filter((product) => product.isLowStock).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-4">
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-muted" aria-hidden />
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
        {lowStockCount > 0 && (
          <Badge className="bg-warning-soft text-warning" dot="bg-warning">
            {t("stock.lowStockAlert", { count: lowStockCount })}
          </Badge>
        )}
      </div>

      {/* -- Product cards -- */}
      {products === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : products.length === 0 ? (
        <EmptyState icon={Package} title={t("products.empty")} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <li key={product.id}>
              <Card className={cn("flex h-full flex-col p-4", !product.isActive && "opacity-60")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{product.name}</p>
                    <p className="font-mono text-xs text-on-surface-muted">
                      {product.partNumber} · {product.categoryName ?? "—"}
                    </p>
                  </div>
                  <Switch
                    checked={product.isActive}
                    onChange={(next) => toggleActive(product, next)}
                    aria-label={t("products.isActive")}
                  />
                </div>

                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold text-primary">
                      {formatMoney(product.priceCents, locale)}
                    </p>
                    <p className={cn("text-sm font-medium", product.isLowStock ? "text-warning" : "text-on-surface-muted")}>
                      {product.isLowStock && <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden />}
                      {t("stock.current")}: {product.stockQuantity} {product.unit} · min {product.minStock}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2 border-t border-border pt-3">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => setEditing(product)}>
                    <Pencil className="h-4 w-4" />
                    {t("common.edit")}
                  </Button>
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => setAdjusting(product)}>
                    <Warehouse className="h-4 w-4" />
                    {t("stock.adjust")}
                  </Button>
                  <Button variant="ghost" size="iconSm" onClick={() => setDeleting(product)} aria-label={t("common.delete")}>
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

      <AdjustStockDialog
        product={adjusting}
        onClose={() => setAdjusting(null)}
        onAdjusted={() => refreshProducts()}
      />

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
