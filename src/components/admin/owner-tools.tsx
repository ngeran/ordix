"use client";

import { useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { DatabaseBackup, Download, Eye, EyeOff, ListPlus, Pencil, Plus, Upload } from "lucide-react";
import { api, showErrorToast } from "@/lib/api-client";
import { saveFile } from "@/lib/download";
import { useLocale, useT, type MessageKey } from "@/lib/i18n";
import { usePolling } from "@/lib/use-polling";
import { cn } from "@/lib/utils";
import type { BackupFile } from "@/lib/backup";
import {
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_TYPES,
  customFieldLabel,
  slugifyKey,
  type CustomFieldDef,
  type CustomFieldEntity,
  type CustomFieldType,
} from "@/lib/custom-fields";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

// ============================================================
// SECTION: Backup & restore (owner)
// ============================================================

export function BackupCard() {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const backup = await api.get<BackupFile>("/api/system/backup");
      const stamp = backup.exportedAt.slice(0, 16).replace(/[:T]/g, "-");
      saveFile(JSON.stringify(backup), `ordix-backup-${stamp}.json`, "application/json");
      toast.success(t("backup.downloaded"));
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setDownloading(false);
    }
  };

  const pick = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile;
      if (parsed?.app !== "ordix" || typeof parsed.tables !== "object") throw new Error();
      setPending(parsed);
    } catch {
      toast.error(t("backup.invalidFile"));
    }
  };

  const close = () => {
    setPending(null);
    setTyped("");
    setPassword("");
  };

  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await api.post("/api/system/restore", { password, backup: pending });
      toast.success(t("backup.restored"));
      // Sessions now point at the backup's accounts — start clean.
      await signOut({ callbackUrl: "/login" });
    } catch (error) {
      showErrorToast(error, t("error.generic"));
      setBusy(false);
    }
  };

  const count = (table: string) => String(pending?.tables[table]?.length ?? 0);

  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <DatabaseBackup className="h-5 w-5 text-primary" />
        {t("backup.title")}
      </h2>
      <p className="text-xs text-on-surface-muted">{t("backup.hint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button loading={downloading} onClick={download}>
          <Download className="h-5 w-5" />
          {t("backup.download")}
        </Button>
        <Button variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload className="h-5 w-5" />
          {t("backup.restore")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void pick(file);
            event.target.value = "";
          }}
        />
      </div>

      {pending && (
        <Dialog
          open
          onClose={close}
          title={t("backup.restoreTitle")}
          footer={
            <>
              <Button variant="ghost" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                loading={busy}
                disabled={typed.trim().toUpperCase() !== "DELETE" || password.length === 0}
                onClick={restore}
              >
                {t("backup.restoreRun")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm">
              {t("backup.restoreWarning", { date: new Date(pending.exportedAt).toLocaleString() })}
            </p>
            <p className="rounded-xl bg-surface-container-low px-4 py-3 text-sm">
              {t("backup.summary", {
                orders: count("orders"),
                products: count("products"),
                customers: count("customers"),
                users: count("users"),
              })}
            </p>
            <Field label={t("danger.typeDelete")} htmlFor="b-confirm">
              <Input id="b-confirm" autoComplete="off" autoCapitalize="characters" value={typed} onChange={(event) => setTyped(event.target.value)} />
            </Field>
            <Field label={t("danger.password")} htmlFor="b-password">
              <Input id="b-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
          </div>
        </Dialog>
      )}
    </Card>
  );
}

// ============================================================
// SECTION: Custom fields manager (owner)
// ============================================================

export function CustomFieldsCard() {
  const t = useT();
  const locale = useLocale();
  const { data, refresh } = usePolling<CustomFieldDef[]>("/api/custom-fields", { intervalMs: 60_000 });
  const [entity, setEntity] = useState<CustomFieldEntity>("products");
  const [editing, setEditing] = useState<CustomFieldDef | null | undefined>(undefined);
  const fields = (data ?? []).filter((field) => field.entity === entity);

  const toggle = async (field: CustomFieldDef, isActive: boolean) => {
    try {
      await api.patch(`/api/custom-fields/${field.id}`, { isActive });
      refresh();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <ListPlus className="h-5 w-5 text-primary" />
          {t("customFields.title")}
        </h2>
        <Button size="sm" onClick={() => setEditing(null)}>
          <Plus className="h-4 w-4" />
          {t("customFields.new")}
        </Button>
      </div>
      <p className="text-xs text-on-surface-muted">{t("customFields.hint")}</p>

      <div role="tablist" className="flex gap-1 rounded-xl border border-border bg-surface-container-low p-1">
        {CUSTOM_FIELD_ENTITIES.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={entity === value}
            onClick={() => setEntity(value)}
            className={cn(
              "min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors",
              entity === value ? "bg-surface text-primary shadow-sm ring-1 ring-primary/40" : "text-on-surface-muted hover:bg-surface-container"
            )}
          >
            {t(`customFields.entity.${value}` as MessageKey)}
          </button>
        ))}
      </div>

      {fields.length === 0 ? (
        <p className="py-4 text-center text-sm text-on-surface-muted">{t("customFields.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {fields.map((field) => (
            <li key={field.id} className={cn("flex items-center gap-3 rounded-xl bg-surface-container-low px-4 py-3", !field.isActive && "opacity-60")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {customFieldLabel(field, locale)}
                  {field.required && " *"}
                </span>
                <span className="block truncate text-xs text-on-surface-muted">
                  <span className="font-mono">{field.key}</span> · {t(`customFields.type.${field.type}` as MessageKey)}
                  {!field.isActive && ` · ${t("customFields.hidden")}`}
                </span>
              </span>
              <span className="text-on-surface-muted" aria-hidden>
                {field.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </span>
              <Switch checked={field.isActive} onChange={(on) => toggle(field, on)} aria-label={t("common.active")} />
              <Button variant="secondary" size="iconSm" onClick={() => setEditing(field)} aria-label={t("common.edit")}>
                <Pencil className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing !== undefined && (
        <CustomFieldDialog
          field={editing}
          entity={entity}
          nextSortOrder={fields.length}
          onClose={() => setEditing(undefined)}
          onSaved={refresh}
        />
      )}
    </Card>
  );
}

function CustomFieldDialog({
  field,
  entity,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  field: CustomFieldDef | null;
  entity: CustomFieldEntity;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isEdit = field !== null;
  const [labelEn, setLabelEn] = useState(field?.labelEn ?? "");
  const [labelEl, setLabelEl] = useState(field?.labelEl ?? "");
  const [key, setKey] = useState(field?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(isEdit);
  const [type, setType] = useState<CustomFieldType>(field?.type ?? "text");
  const [options, setOptions] = useState((field?.options ?? []).join("\n"));
  const [required, setRequired] = useState(field?.required ?? false);
  const [busy, setBusy] = useState(false);

  const optionList = options.split("\n").map((option) => option.trim()).filter(Boolean);
  const keyValid = /^[a-z][a-z0-9_]{0,39}$/.test(key);
  const canSave = labelEn.trim().length > 0 && keyValid && (type !== "select" || optionList.length > 0);

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const common = {
        labelEn: labelEn.trim(),
        labelEl: labelEl.trim() || null,
        options: type === "select" ? optionList : null,
        required,
      };
      if (isEdit) {
        await api.patch(`/api/custom-fields/${field.id}`, common);
      } else {
        await api.post("/api/custom-fields", { ...common, entity, key, type, sortOrder: nextSortOrder });
      }
      toast.success(t("customFields.saved"));
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
      onClose={onClose}
      title={isEdit ? field.labelEn : t("customFields.new")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={busy} disabled={!canSave} onClick={submit}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t("customFields.labelEn")} htmlFor="cf-label-en">
          <Input
            id="cf-label-en"
            autoFocus
            value={labelEn}
            onChange={(event) => {
              setLabelEn(event.target.value);
              if (!keyTouched) setKey(slugifyKey(event.target.value));
            }}
          />
        </Field>
        <Field label={t("customFields.labelEl")} htmlFor="cf-label-el">
          <Input id="cf-label-el" value={labelEl} onChange={(event) => setLabelEl(event.target.value)} />
        </Field>
        <Field
          label={t("customFields.key")}
          htmlFor="cf-key"
          hint={t("customFields.keyHint")}
          error={key && !keyValid ? t("customFields.keyHint") : undefined}
        >
          <Input
            id="cf-key"
            className="font-mono"
            disabled={isEdit}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={key}
            onChange={(event) => {
              setKeyTouched(true);
              setKey(event.target.value.toLowerCase().replace(/\s/g, "_"));
            }}
          />
        </Field>
        <Field label={t("customFields.typeLabel")} htmlFor="cf-type">
          <Select id="cf-type" disabled={isEdit} value={type} onChange={(event) => setType(event.target.value as CustomFieldType)}>
            {CUSTOM_FIELD_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`customFields.type.${value}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>
        {type === "select" && (
          <Field label={t("customFields.options")} htmlFor="cf-options">
            <Textarea id="cf-options" value={options} onChange={(event) => setOptions(event.target.value)} />
          </Field>
        )}
        <div className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3">
          <span className="text-sm font-medium">{t("customFields.required")}</span>
          <Switch checked={required} onChange={setRequired} aria-label={t("customFields.required")} />
        </div>
      </div>
    </Dialog>
  );
}
