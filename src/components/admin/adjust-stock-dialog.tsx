"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import type { ProductWithCategory } from "@/types";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

// ============================================================
// SECTION: Adjust-stock dialog
// ------------------------------------------------------------
// Shared by the stock screen and the products table. Two modes:
//   - "set": type the counted shelf quantity (typical stocktake)
//   - "delta": add/remove a signed amount (+10 received, −2 damaged)
// The reason is mandatory and is written to stock_movements.
// ============================================================

export function AdjustStockDialog({
  product,
  onClose,
  onAdjusted,
}: {
  product: ProductWithCategory | null;
  onClose: () => void;
  onAdjusted: (newQuantity: number) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<"set" | "delta">("set");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const parsedValue = Number(value);
  const isValid =
    value !== "" &&
    Number.isFinite(parsedValue) &&
    (mode === "set"
      ? Number.isInteger(parsedValue) && parsedValue >= 0
      : Number.isInteger(parsedValue) && parsedValue !== 0) &&
    reason.trim().length >= 3;

  const submit = async () => {
    if (!product || !isValid) return;
    setBusy(true);
    try {
      const response = await api.post<{ newQuantity: number }>(
        "/api/stock/adjust",
        mode === "set"
          ? { productId: product.id, newQuantity: parsedValue, reason: reason.trim() }
          : { productId: product.id, delta: parsedValue, reason: reason.trim() }
      );
      toast.success(t("stock.adjusted"));
      onAdjusted(response.newQuantity);
      // Reset for the next open.
      setValue("");
      setReason("");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={product !== null}
      onClose={onClose}
      title={t("stock.adjustTitle", { name: product?.name ?? "" })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={busy} disabled={!isValid} onClick={submit}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      {product && (
        <div className="space-y-4">
          {/* Current level readout */}
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-sm text-on-surface-muted">{t("stock.currentLevel")}</p>
            <p className="text-2xl font-bold">
              {product.stockQuantity}{" "}
              <span className="text-sm font-normal text-on-surface-muted">
                {product.unit} · min {product.minStock}
              </span>
            </p>
          </div>

          {/* Mode picker */}
          <Field label={t("stock.adjust")} htmlFor="adjust-mode">
            <Select
              id="adjust-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as "set" | "delta")}
            >
              <option value="set">{t("stock.newLevel")}</option>
              <option value="delta">{t("stock.delta")}</option>
            </Select>
          </Field>

          <Field
            label={mode === "set" ? t("stock.newLevel") : t("stock.delta")}
            htmlFor="adjust-value"
          >
            <Input
              id="adjust-value"
              type="number"
              inputMode={mode === "set" ? "numeric" : "text"}
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={mode === "set" ? "e.g. 42" : "e.g. -3 or +25"}
            />
          </Field>

          <Field label={t("stock.reasonLabel")} htmlFor="adjust-reason">
            <Textarea
              id="adjust-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("stock.reasonPlaceholder")}
            />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
