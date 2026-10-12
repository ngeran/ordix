"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import type { Product } from "@/db/schema";
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
// Products are pure identifiers in a build-to-order shop —
// exactly six fields, nothing to track:
//   κωδικός · όνομα · κατηγορία · barcode (optional) ·
//   περιγραφή (optional) · ενεργό
// The PRICE is quoted per order line in the ticket, not here.
// ============================================================

export function ProductFormDialog({
  /** Null = create mode, product = edit mode. */
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: ProductWithCategory | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isEdit = product !== null;

  // -- Form state --
  const [partNumber, setPartNumber] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  // Prefill on open (edit) / reset (create).
  useEffect(() => {
    if (product) {
      setPartNumber(product.partNumber);
      setName(product.name);
      setCategoryId(product.categoryId);
      setBarcode(product.barcode ?? "");
      setDescription(product.description ?? "");
      setIsActive(product.isActive);
    } else {
      setPartNumber("");
      setName("");
      setCategoryId(categories[0]?.id ?? "");
      setBarcode("");
      setDescription("");
      setIsActive(true);
    }
  }, [product, categories]);

  const canSubmit =
    partNumber.trim().length > 0 && name.trim().length > 0 && categoryId !== "";

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const payload = {
        partNumber: partNumber.trim(),
        name: name.trim(),
        categoryId,
        barcode: barcode.trim() || undefined,
        description: description.trim() || undefined,
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
        <Field label={`${t("products.barcode")} (${t("common.optional")})`} htmlFor="p-barcode">
          <Input id="p-barcode" value={barcode} onChange={(event) => setBarcode(event.target.value)} />
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
