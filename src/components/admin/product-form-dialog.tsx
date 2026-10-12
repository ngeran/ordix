"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import type { Category, Product } from "@/db/schema";
import type { ProductWithCategory } from "@/types";
import { api, showErrorToast } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/ui/field";

// ============================================================
// SECTION: Product form dialog (create + edit)
// ------------------------------------------------------------
// Price is entered in euros and converted to integer cents on
// submit (the ONLY place money touches a float, at the input
// boundary). All server rules (Zod) still apply.
// ============================================================

export function ProductFormDialog({
  /** Null = create mode, product = edit mode. */
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: ProductWithCategory | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isEdit = product !== null;

  // -- Form state (strings because inputs are strings) --
  const [partNumber, setPartNumber] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priceEuros, setPriceEuros] = useState("");
  const [itemsPerBox, setItemsPerBox] = useState("");
  const [pricePerBoxEuros, setPricePerBoxEuros] = useState("");
  const [pricePerItemEuros, setPricePerItemEuros] = useState("");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [unit, setUnit] = useState("pcs");
  const [barcode, setBarcode] = useState("");
  const [supplier, setSupplier] = useState("");
  const [weightGrams, setWeightGrams] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [busy, setBusy] = useState(false);

  // Prefill on open (edit mode).
  useEffect(() => {
    if (product) {
      setPartNumber(product.partNumber);
      setName(product.name);
      setDescription(product.description ?? "");
      setCategoryId(product.categoryId);
      setPriceEuros((product.priceCents / 100).toFixed(2));
      setItemsPerBox(product.itemsPerBox ? String(product.itemsPerBox) : "");
      setPricePerBoxEuros(
        product.pricePerBoxCents ? (product.pricePerBoxCents / 100).toFixed(2) : ""
      );
      setPricePerItemEuros(
        product.pricePerItemCents ? (product.pricePerItemCents / 100).toFixed(2) : ""
      );
      setStockQuantity(String(product.stockQuantity));
      setMinStock(String(product.minStock));
      setUnit(product.unit);
      setBarcode(product.barcode ?? "");
      setSupplier(product.supplier ?? "");
      setWeightGrams(product.weightGrams ? String(product.weightGrams) : "");
      setImageUrl(product.imageUrl ?? "");
      setIsActive(product.isActive);
    } else {
      // Create mode defaults.
      setPartNumber("");
      setName("");
      setDescription("");
      setCategoryId(categories[0]?.id ?? "");
      setPriceEuros("");
      setItemsPerBox("");
      setPricePerBoxEuros("");
      setPricePerItemEuros("");
      setStockQuantity("0");
      setMinStock("0");
      setUnit("pcs");
      setBarcode("");
      setSupplier("");
      setWeightGrams("");
      setImageUrl("");
      setIsActive(true);
    }
  }, [product, categories]);

  /** "12.50" → 1250 cents; invalid input → undefined. */
  const parsePriceCents = (value: string): number | undefined => {
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return undefined;
    return Math.round(parsed * 100);
  };

  const canSubmit =
    partNumber.trim().length > 0 &&
    name.trim().length > 0 &&
    categoryId !== "" &&
    parsePriceCents(priceEuros) !== undefined;

  const submit = async () => {
    const priceCents = parsePriceCents(priceEuros);
    if (!canSubmit || priceCents === undefined) return;
    setBusy(true);
    try {
      const payload = {
        partNumber: partNumber.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        categoryId,
        priceCents,
        itemsPerBox: itemsPerBox ? Number(itemsPerBox) : null,
        pricePerBoxCents: pricePerBoxEuros
          ? parsePriceCents(pricePerBoxEuros)
          : null,
        pricePerItemCents: pricePerItemEuros
          ? parsePriceCents(pricePerItemEuros)
          : null,
        stockQuantity: Number(stockQuantity) || 0,
        minStock: Number(minStock) || 0,
        unit: unit.trim() || "pcs",
        barcode: barcode.trim() || undefined,
        supplier: supplier.trim() || undefined,
        weightGrams: weightGrams ? Number(weightGrams) : null,
        imageUrl: imageUrl.trim() || undefined,
        isActive,
      };
      if (isEdit) {
        await api.patch<Product>(`/api/products/${product.id}`, payload);
      } else {
        await api.post<Product>("/api/products", payload);
      }
      toast.success(t("products.saved"));
      onSaved();
      onClose();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={isEdit ? t("products.edit") : t("products.new")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={busy} disabled={!canSubmit} onClick={submit}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("products.partNumber")} htmlFor="p-part">
          <Input
            id="p-part"
            autoFocus
            value={partNumber}
            onChange={(event) => setPartNumber(event.target.value)}
            className="font-mono"
            required
          />
        </Field>
        <Field label={t("products.name")} htmlFor="p-name">
          <Input id="p-name" value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>

        <Field label={t("products.category")} htmlFor="p-category">
          <Select id="p-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">{t("products.selectCategory")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("products.price")} htmlFor="p-price" hint={t("products.priceHelp")}>
          <Input
            id="p-price"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={priceEuros}
            onChange={(event) => setPriceEuros(event.target.value)}
            required
          />
        </Field>

        <Field label={t("products.itemsPerBox")} htmlFor="p-ipb">
          <Input
            id="p-ipb"
            type="number"
            min="0"
            inputMode="numeric"
            value={itemsPerBox}
            onChange={(event) => setItemsPerBox(event.target.value)}
            placeholder="e.g. 6"
          />
        </Field>
        <Field label={t("products.pricePerBox")} htmlFor="p-ppb">
          <Input
            id="p-ppb"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={pricePerBoxEuros}
            onChange={(event) => setPricePerBoxEuros(event.target.value)}
          />
        </Field>
        <Field label={t("products.pricePerItem")} htmlFor="p-ppi">
          <Input
            id="p-ppi"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={pricePerItemEuros}
            onChange={(event) => setPricePerItemEuros(event.target.value)}
          />
        </Field>

        <Field label={t("products.stock")} htmlFor="p-stock">
          <Input
            id="p-stock"
            type="number"
            min="0"
            value={stockQuantity}
            onChange={(event) => setStockQuantity(event.target.value)}
          />
        </Field>
        <Field label={t("products.minStock")} htmlFor="p-min">
          <Input
            id="p-min"
            type="number"
            min="0"
            value={minStock}
            onChange={(event) => setMinStock(event.target.value)}
          />
        </Field>

        <Field label={t("products.unit")} htmlFor="p-unit">
          <Input id="p-unit" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="pcs / m / kg / set" />
        </Field>
        <Field label={t("products.barcode")} htmlFor="p-barcode">
          <Input id="p-barcode" value={barcode} onChange={(event) => setBarcode(event.target.value)} />
        </Field>

        <Field label={t("products.supplier")} htmlFor="p-supplier">
          <Input id="p-supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} />
        </Field>
        <Field label={t("products.weight")} htmlFor="p-weight">
          <Input
            id="p-weight"
            type="number"
            min="0"
            value={weightGrams}
            onChange={(event) => setWeightGrams(event.target.value)}
          />
        </Field>

        <Field label={t("products.imageUrl")} htmlFor="p-image" className="sm:col-span-2">
          <Input id="p-image" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…" />
        </Field>
        <Field label={t("products.description")} htmlFor="p-desc" className="sm:col-span-2">
          <Textarea id="p-desc" value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>

        <div className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3 sm:col-span-2">
          <span className="text-sm font-medium">{t("products.isActive")}</span>
          <Switch checked={isActive} onChange={setIsActive} aria-label={t("products.isActive")} />
        </div>
      </div>
    </Dialog>
  );
}
