"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, Warehouse } from "lucide-react";
import type { ProductWithCategory } from "@/types";
import type { OrdixSettingsDTO } from "@/types";
import { api } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { AdjustStockDialog } from "@/components/admin/adjust-stock-dialog";

// ============================================================
// SECTION: Admin stock screen
// ------------------------------------------------------------
// Stock overview with low-stock-first sorting option, manual
// adjustments (audited) and the two behavior switches
// (overselling, restock-on-void) backed by the settings API.
// ============================================================

export function StockScreen() {
  const t = useT();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  const productsUrl = useMemo(() => {
    const params = new URLSearchParams({ active: "true" });
    if (search.trim()) params.set("q", search.trim());
    if (categoryFilter) params.set("categoryId", categoryFilter);
    return `/api/products?${params.toString()}`;
  }, [search, categoryFilter]);

  const { data: products, refresh } = usePolling<ProductWithCategory[]>(productsUrl, {
    intervalMs: 10_000,
  });
  const { data: settings, refresh: refreshSettings } = usePolling<OrdixSettingsDTO>(
    "/api/settings",
    { intervalMs: 60_000 }
  );

  const [adjusting, setAdjusting] = useState<ProductWithCategory | null>(null);

  // -- Derived list: filtered + optionally low-stock only, sorted
  //    so the most critical rows are on top when filtered --
  const visibleProducts = useMemo(() => {
    let list = products ?? [];
    if (lowOnly) list = list.filter((product) => product.isLowStock);
    return [...list].sort((a, b) => {
      if (lowOnly) {
        // Most negative headroom first (worst offenders on top).
        const headroomA = a.stockQuantity - a.minStock;
        const headroomB = b.stockQuantity - b.minStock;
        return headroomA - headroomB;
      }
      return a.name.localeCompare(b.name);
    });
  }, [products, lowOnly]);

  const lowStockCount = (products ?? []).filter((product) => product.isLowStock).length;

  // ============================================================
  // SECTION: Settings toggle (optimistic UI, server persists)
  // ============================================================

  const updateSetting = async (key: "allowOversell" | "restockOnVoid", value: boolean) => {
    try {
      await api.patch<OrdixSettingsDTO>("/api/settings", { [key]: value });
      refreshSettings();
      toast.success(t("stock.settingsSaved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error.generic"));
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <h1 className="mb-4 text-2xl font-bold">{t("stock.title")}</h1>

      {/* ============================================================
          SECTION: Behavior settings
          ============================================================ */}
      <Card className="mb-4 p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Boxes className="h-5 w-5 text-primary" aria-hidden />
          {t("stock.settings")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low px-4 py-3">
            <div>
              <p className="text-sm font-medium">{t("stock.allowOversell")}</p>
              <p className="text-xs text-on-surface-muted">{t("stock.allowOversellHint")}</p>
            </div>
            <Switch
              checked={settings?.allowOversell ?? false}
              onChange={(value) => updateSetting("allowOversell", value)}
              aria-label={t("stock.allowOversell")}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low px-4 py-3">
            <div>
              <p className="text-sm font-medium">{t("stock.restockOnVoid")}</p>
              <p className="text-xs text-on-surface-muted">{t("stock.restockOnVoidHint")}</p>
            </div>
            <Switch
              checked={settings?.restockOnVoid ?? true}
              onChange={(value) => updateSetting("restockOnVoid", value)}
              aria-label={t("stock.restockOnVoid")}
            />
          </div>
        </div>
      </Card>

      {/* ============================================================
          SECTION: Filters
          ============================================================ */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("pos.searchPlaceholder")}
          aria-label={t("common.search")}
          className="min-w-56 flex-1"
        />
        <Select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label={t("products.category")}
          className="w-48"
        >
          <option value="">{t("common.all")}</option>
          {/* Categories come embedded in products; build a light list */}
          {[...new Map((products ?? []).map((p) => [p.categoryId, p.categoryName])).entries()].map(
            ([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            )
          )}
        </Select>
        <label className="flex h-12 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(event) => setLowOnly(event.target.checked)}
            className="h-5 w-5 accent-[var(--warning)]"
          />
          {t("stock.lowStockOnly")}
        </label>
      </div>

      {lowStockCount > 0 && (
        <Badge className="mb-4 bg-warning-soft text-warning" dot="bg-warning">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          {t("stock.lowStockAlert", { count: lowStockCount })}
        </Badge>
      )}

      {/* ============================================================
          SECTION: Stock rows
          ============================================================ */}
      {products === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : visibleProducts.length === 0 ? (
        <EmptyState icon={Boxes} title={t("products.empty")} />
      ) : (
        <ul className="space-y-2">
          {visibleProducts.map((product) => (
            <li key={product.id}>
              <Card
                className={cn(
                  "flex flex-wrap items-center gap-3 p-3",
                  product.isLowStock && "border-warning/50"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{product.name}</p>
                  <p className="font-mono text-xs text-on-surface-muted">
                    {product.partNumber} · {product.categoryName ?? "—"}
                  </p>
                </div>

                {/* Stock readout */}
                <div className="text-right">
                  <p
                    className={cn(
                      "text-xl font-bold",
                      product.isLowStock ? "text-warning" : "text-on-surface"
                    )}
                  >
                    {product.stockQuantity}
                    <span className="ml-1 text-xs font-normal text-on-surface-muted">
                      {product.unit}
                    </span>
                  </p>
                  <p className="text-xs text-on-surface-muted">
                    {t("stock.min")}: {product.minStock}
                  </p>
                </div>

                {product.isLowStock && (
                  <Badge className="bg-warning-soft text-warning" dot="bg-warning">
                    {t("pos.lowStock")}
                  </Badge>
                )}

                <Button variant="secondary" size="sm" onClick={() => setAdjusting(product)}>
                  <Warehouse className="h-4 w-4" />
                  {t("stock.adjust")}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AdjustStockDialog
        product={adjusting}
        onClose={() => setAdjusting(null)}
        onAdjusted={() => refresh()}
      />
    </div>
  );
}
