"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import { FileDown } from "lucide-react";
import { ApiError, showErrorToast } from "@/lib/api-client";
import { useT, type MessageKey } from "@/lib/i18n";
import { cn, getBusinessDate } from "@/lib/utils";
import { saveFile } from "@/lib/download";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// ============================================================
// SECTION: Completed-orders export
// ------------------------------------------------------------
// Pick a completion-date range (quick presets for the usual
// accounting periods) and a format; the file is fetched first so
// failures and "nothing in range" show as toasts, then saved.
// ============================================================

type ExportFormat = "json" | "xml";

/** Calendar math on YYYY-MM-DD strings (no timezone involved). */
function shiftMonth(day: string, months: number): string {
  const [year, month] = day.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return date.toISOString().slice(0, 10);
}
function lastDayOfMonth(firstDay: string): string {
  const next = new Date(`${shiftMonth(firstDay, 1)}T00:00:00Z`);
  next.setUTCDate(0);
  return next.toISOString().slice(0, 10);
}

function presetRange(preset: "today" | "thisMonth" | "lastMonth"): [string, string] {
  const today = getBusinessDate();
  const monthStart = `${today.slice(0, 7)}-01`;
  if (preset === "today") return [today, today];
  if (preset === "thisMonth") return [monthStart, today];
  const lastStart = shiftMonth(monthStart, -1);
  return [lastStart, lastDayOfMonth(lastStart)];
}

const PRESETS = [
  ["today", "export.today"],
  ["thisMonth", "export.thisMonth"],
  ["lastMonth", "export.lastMonth"],
] as const satisfies readonly (readonly [Parameters<typeof presetRange>[0], MessageKey])[];

export function OrdersExportPanel() {
  const t = useT();
  const [initialFrom, initialTo] = presetRange("thisMonth");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const download = async (format: ExportFormat) => {
    setBusy(format);
    try {
      const params = new URLSearchParams({ from, to, format });
      const response = await fetch(`/api/export/orders?${params}`, { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new ApiError(body?.error ?? t("error.generic"), response.status);
      }
      const count = Number(response.headers.get("X-Order-Count") ?? "0");
      if (count === 0) {
        toast.info(t("export.empty"));
        return;
      }
      saveFile(await response.blob(), `ordix-completed-orders_${from}_${to}.${format}`);
      toast.success(t("export.done", { count }));
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setBusy(null);
    }
  };

  const valid = Boolean(from && to && from <= to);
  const activePreset = PRESETS.find(([preset]) => {
    const [presetFrom, presetTo] = presetRange(preset);
    return presetFrom === from && presetTo === to;
  })?.[0];

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="font-semibold">{t("export.title")}</h2>
        <p className="text-sm text-on-surface-muted">{t("export.hint")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map(([preset, label]) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              const [presetFrom, presetTo] = presetRange(preset);
              setFrom(presetFrom);
              setTo(presetTo);
            }}
            className={cn(
              "h-10 rounded-full border px-4 text-sm font-medium transition-colors",
              activePreset === preset
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-on-surface-muted hover:bg-surface-container-low"
            )}
          >
            {t(label)}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("export.from")} htmlFor="export-from">
          <Input
            id="export-from"
            type="date"
            className="appearance-none min-h-12 [&::-webkit-date-and-time-value]:text-left"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
          />
        </Field>
        <Field label={t("export.to")} htmlFor="export-to">
          <Input
            id="export-to"
            type="date"
            className="appearance-none min-h-12 [&::-webkit-date-and-time-value]:text-left"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["json", "xml"] as const).map((format) => (
          <Button
            key={format}
            variant={format === "json" ? "primary" : "outline"}
            loading={busy === format}
            disabled={!valid || busy !== null}
            onClick={() => download(format)}
          >
            <FileDown className="h-5 w-5" />
            {t("export.download", { format: format.toUpperCase() })}
          </Button>
        ))}
      </div>
    </Card>
  );
}
