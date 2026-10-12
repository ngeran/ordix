"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import { FileUp, TriangleAlert } from "lucide-react";
import { api, showErrorToast } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";

// ============================================================
// SECTION: Import screen
// ------------------------------------------------------------
// Two-step, admin-friendly flow:
//   1) CHECK FIRST — sends the file as a dry run and shows what
//      would happen (created/updated/errors), changing nothing
//   2) IMPORT NOW — actually applies it
// Accepts the JSON and XML shapes documented in the README and
// in src/lib/importer.ts (the same format our sample files use).
// ============================================================

interface ImportReport {
  dryRun: boolean;
  customersCreated: number;
  customersUpdated: number;
  productsCreated: number;
  productsUpdated: number;
  categoriesCreated: number;
  errors: string[];
}

export function ImportScreen() {
  const t = useT();

  const [format, setFormat] = useState<"json" | "xml">("json");
  const [content, setContent] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  const run = async (dryRun: boolean) => {
    if (content.trim().length < 2) return;
    setBusy(true);
    try {
      const result = await api.post<ImportReport>("/api/import", {
        format,
        content,
        dryRun,
      });
      setReport(result);
      setChecked(true);
      if (!dryRun) {
        toast.success(t("import.applied"));
        // A fresh check against the new state is meaningless with the
        // same content — clear the report so the button flow restarts.
        setContent("");
      }
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const blockingErrors = report?.errors.length ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <h1 className="mb-4 text-2xl font-bold">{t("import.title")}</h1>

      <Card className="space-y-4 p-4">
        <Field label={t("import.format")} htmlFor="import-format">
          <Select
            id="import-format"
            value={format}
            onChange={(event) => {
              setFormat(event.target.value as "json" | "xml");
              setReport(null);
              setChecked(false);
            }}
          >
            <option value="json">JSON</option>
            <option value="xml">XML</option>
          </Select>
        </Field>

        <Field label={t("import.paste")} htmlFor="import-content">
          <Textarea
            id="import-content"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setReport(null);
              setChecked(false);
            }}
            className="min-h-56 font-mono text-sm"
            spellCheck={false}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            loading={busy}
            disabled={content.trim().length < 2}
            onClick={() => run(true)}
          >
            {t("import.dryRun")}
          </Button>
          <Button
            loading={busy}
            disabled={!checked || busy}
            onClick={() => run(false)}
          >
            <FileUp className="h-5 w-5" />
            {t("import.apply")}
          </Button>
        </div>
      </Card>

      {/* -- Report -- */}
      {report && (
        <Card className="mt-4 space-y-2 p-4">
          <h2 className="font-semibold">
            {report.dryRun ? t("import.report") : t("import.applied")}
          </h2>
          <ul className="space-y-1 text-sm">
            <li>{t("import.customersCreated", { count: report.customersCreated })}</li>
            <li>{t("import.customersUpdated", { count: report.customersUpdated })}</li>
            <li>{t("import.productsCreated", { count: report.productsCreated })}</li>
            <li>{t("import.productsUpdated", { count: report.productsUpdated })}</li>
            <li>{t("import.categoriesCreated", { count: report.categoriesCreated })}</li>
          </ul>

          {blockingErrors > 0 && (
            <div className="rounded-xl bg-error-soft p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-error">
                <TriangleAlert className="h-4 w-4" aria-hidden />
                {t("import.errorCount", { count: blockingErrors })}
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-error">
                {report.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
