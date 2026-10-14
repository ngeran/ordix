"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useRef, useState } from "react";
import {
  Check,
  CircleCheck,
  Download,
  FileDown,
  FileUp,
  FolderTree,
  Package,
  TriangleAlert,
  Upload,
  UserRound,
} from "lucide-react";
import { api, showErrorToast } from "@/lib/api-client";
import { useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { saveFile } from "@/lib/download";
import {
  IMPORT_FORMATS,
  IMPORT_SPECS,
  IMPORT_TYPES,
  importTemplate,
  type ImportFormat,
  type ImportReport,
  type ImportType,
} from "@/lib/importer";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { OrdersExportPanel } from "@/components/admin/orders-export-panel";

// ============================================================
// SECTION: Import & export screen
// ------------------------------------------------------------
// Tab 1 — Import, a guided flow:
//   1) pick WHAT (products / categories / customers)
//   2) pick the format (JSON / XML) — template download + field
//      reference for exactly that combination
//   3) choose / drop / paste the file
//   then CHECK FIRST (dry run, changes nothing) → IMPORT NOW.
// Tab 2 — Export completed orders (see OrdersExportPanel).
// ============================================================

type Tab = "import" | "export";

const TYPE_ICONS: Record<ImportType, React.ComponentType<{ className?: string }>> = {
  products: Package,
  categories: FolderTree,
  customers: UserRound,
};

export function ImportScreen() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("import");

  return (
    <div className="mx-auto w-full max-w-[110rem] px-3 py-4 sm:px-5">
      <div role="tablist" className="mb-4 inline-flex rounded-xl border border-border bg-surface-container-low p-1">
        {(
          [
            ["import", "import.tabImport", FileUp],
            ["export", "import.tabExport", FileDown],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors",
              tab === value
                ? "bg-surface text-primary shadow-sm ring-1 ring-primary/40"
                : "text-on-surface-muted hover:bg-surface-container hover:text-on-surface"
            )}
          >
            <Icon className="h-4 w-4" />
            {t(label)}
          </button>
        ))}
      </div>

      {tab === "import" ? <ImportPanel /> : <OrdersExportPanel />}
    </div>
  );
}

// ============================================================
// SECTION: Import panel
// ============================================================

function ImportPanel() {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<ImportType>("products");
  const [format, setFormat] = useState<ImportFormat>("json");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Any change to the inputs invalidates the previous check.
  const reset = () => setReport(null);
  const checked = report?.dryRun === true;

  const loadFile = async (file: File) => {
    const text = await file.text();
    setContent(text);
    setFileName(file.name);
    reset();
    // Follow the file: extension first, then a peek at the content.
    const detected: ImportFormat | null = /\.xml$/i.test(file.name)
      ? "xml"
      : /\.json$/i.test(file.name)
        ? "json"
        : text.trimStart().startsWith("<")
          ? "xml"
          : text.trimStart().match(/^[[{]/)
            ? "json"
            : null;
    if (detected && detected !== format) {
      setFormat(detected);
      toast.info(t("import.formatSwitched", { format: detected.toUpperCase() }));
    }
  };

  const run = async (dryRun: boolean) => {
    if (content.trim().length < 2) return;
    setBusy(true);
    try {
      const result = await api.post<ImportReport>("/api/import", {
        type,
        format,
        content,
        dryRun,
      });
      setReport(result);
      if (!dryRun) {
        toast.success(t("import.applied"));
        // Re-checking the same content against the new state is
        // meaningless — clear it so the flow restarts cleanly.
        setContent("");
        setFileName(null);
      }
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const spec = IMPORT_SPECS[type];
  const errorCount = report?.errors.length ?? 0;
  const changeCount = report ? report.created + report.updated + report.categoriesCreated : 0;

  return (
    <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
      {/* Left column on xl+: steps 1 + 2. Right column: step 3 (file + actions) and the report. */}
      <div className="space-y-4">
      {/* ============================================================
          SECTION: Step 1 — record type
          ============================================================ */}
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">{t("import.stepType")}</h2>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          {IMPORT_TYPES.map((value) => {
            const Icon = TYPE_ICONS[value];
            const selected = type === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setType(value);
                  reset();
                }}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary-soft"
                    : "border-border hover:bg-surface-container-low"
                )}
              >
                <span className={cn("flex items-center gap-2 font-semibold", selected && "text-primary")}>
                  <Icon className="h-5 w-5" />
                  {t(`import.type.${value}` as MessageKey)}
                </span>
                <span className="text-xs text-on-surface-muted">
                  {t(`import.typeHint.${value}` as MessageKey)}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ============================================================
          SECTION: Step 2 — format, template, field reference
          ============================================================ */}
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">{t("import.stepFormat")}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" className="inline-flex rounded-xl border border-border bg-surface-container-low p-1">
            {IMPORT_FORMATS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={format === value}
                onClick={() => {
                  setFormat(value);
                  reset();
                }}
                className={cn(
                  "flex min-h-11 min-w-24 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-bold transition-colors",
                  format === value
                    ? "bg-surface text-primary shadow-sm ring-1 ring-primary/40"
                    : "text-on-surface-muted hover:bg-surface-container hover:text-on-surface"
                )}
              >
                {format === value && <Check className="h-4 w-4" aria-hidden />}
                {value.toUpperCase()}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              saveFile(
                importTemplate(type, format),
                `ordix-${type}-template.${format}`,
                format === "xml" ? "application/xml" : "application/json"
              )
            }
          >
            <Download className="h-4 w-4" />
            {t("import.template", { format: format.toUpperCase() })}
          </Button>
        </div>

        <div className="text-sm">
          <span className="text-on-surface-muted">{t("import.fields")}: </span>
          {spec.fields.map((field, index) => (
            <span key={field.name}>
              {index > 0 && ", "}
              <code className="rounded bg-surface-container-low px-1 font-mono text-xs">
                {field.name}
              </code>
              {field.required && (
                <span className="text-xs text-error"> ({t("import.required")})</span>
              )}
            </span>
          ))}
        </div>
      </Card>
      </div>

      <div className="space-y-4">
      {/* ============================================================
          SECTION: Step 3 — file (choose / drop / paste) + actions
          ============================================================ */}
      <div
        className={cn("rounded-2xl transition-shadow", dragging && "ring-2 ring-primary")}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void loadFile(file);
        }}
      >
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">{t("import.stepFile")}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload className="h-5 w-5" />
            {t("import.chooseFile")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.xml,application/json,application/xml,text/xml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
              event.target.value = ""; // allow re-picking the same file
            }}
          />
          <span className="text-sm text-on-surface-muted">
            {fileName ? t("import.fileLoaded", { name: fileName }) : t("import.dropHint")}
          </span>
        </div>

        <Field label={t("import.paste")} htmlFor="import-content">
          <Textarea
            id="import-content"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setFileName(null);
              reset();
            }}
            className="h-[clamp(10rem,26dvh,22rem)] min-h-40 font-mono"
            spellCheck={false}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            loading={busy && !checked}
            disabled={busy || content.trim().length < 2}
            onClick={() => run(true)}
          >
            {t("import.dryRun")}
          </Button>
          <Button
            loading={busy && checked}
            disabled={!checked || busy || changeCount === 0}
            onClick={() => run(false)}
          >
            <FileUp className="h-5 w-5" />
            {t("import.apply")}
          </Button>
        </div>
      </Card>
      </div>

      {/* ============================================================
          SECTION: Report (dry run or applied)
          ============================================================ */}
      {report && (
        <Card className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            {!report.dryRun && <CircleCheck className="h-5 w-5 text-success" aria-hidden />}
            {report.dryRun ? t("import.report") : t("import.applied")}
            <span className="font-normal text-on-surface-muted">
              · {t(`import.type.${report.type}` as MessageKey)}
            </span>
          </h2>

          <div className="flex flex-wrap gap-2 text-sm">
            <Stat label={t("import.created", { count: report.created })} tone="success" />
            <Stat label={t("import.updated", { count: report.updated })} tone="primary" />
            <Stat label={t("import.unchanged", { count: report.unchanged })} />
            {report.type === "products" && report.categoriesCreated > 0 && (
              <Stat label={t("import.categoriesCreated", { count: report.categoriesCreated })} tone="primary" />
            )}
          </div>

          {report.dryRun && changeCount === 0 && errorCount === 0 && (
            <p className="text-sm text-on-surface-muted">{t("import.nothingToDo")}</p>
          )}

          {errorCount > 0 && (
            <div className="rounded-xl bg-error-soft p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-error">
                <TriangleAlert className="h-4 w-4" aria-hidden />
                {t("import.errorCount", { count: errorCount })}
              </p>
              {report.dryRun && (
                <p className="mt-0.5 text-xs text-error">{t("import.errorsSkipped")}</p>
              )}
              <ul className="scrollbar-thin mt-1 max-h-48 list-inside list-disc space-y-0.5 overflow-y-auto text-xs text-error">
                {report.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
      </div>
    </div>
  );
}

// ============================================================
// SECTION: Internal helpers
// ============================================================

function Stat({ label, tone }: { label: string; tone?: "success" | "primary" }) {
  return (
    <span
      className={cn(
        "rounded-lg px-2.5 py-1 font-medium",
        tone === "success" && "bg-success-soft text-success",
        tone === "primary" && "bg-primary-soft text-primary",
        !tone && "bg-surface-container-low text-on-surface-muted"
      )}
    >
      {label}
    </span>
  );
}
