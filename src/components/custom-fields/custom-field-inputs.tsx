"use client";

import { usePolling } from "@/lib/use-polling";
import { useLocale, useT } from "@/lib/i18n";
import {
  customFieldLabel,
  type CustomFieldDef,
  type CustomFieldEntity,
  type CustomValue,
  type CustomValues,
} from "@/lib/custom-fields";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export type CustomDraft = Record<string, CustomValue | null>;

/** Active definitions for one entity (definitions rarely change — slow poll). */
export function useCustomFields(entity: CustomFieldEntity): CustomFieldDef[] {
  const { data } = usePolling<CustomFieldDef[]>("/api/custom-fields", { intervalMs: 300_000 });
  return (data ?? []).filter((field) => field.entity === entity && field.isActive);
}

/** True when every required field has a value (booleans always count). */
export function customFieldsComplete(fields: CustomFieldDef[], values: CustomDraft): boolean {
  return fields.every(
    (field) =>
      !field.required ||
      field.type === "boolean" ||
      (values[field.key] !== undefined && values[field.key] !== null && values[field.key] !== "")
  );
}

/** Form inputs for the owner-defined fields; renders nothing when there are none. */
export function CustomFieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: CustomFieldDef[];
  values: CustomDraft;
  onChange: (values: CustomDraft) => void;
}) {
  const locale = useLocale();
  const t = useT();
  if (fields.length === 0) return null;

  const set = (key: string, value: CustomValue | null) => onChange({ ...values, [key]: value });

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const id = `cf-${field.key}`;
        const label = `${customFieldLabel(field, locale)}${field.required ? " *" : ""}`;
        const value = values[field.key];

        if (field.type === "boolean") {
          return (
            <div key={field.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low px-4 py-3">
              <span className="text-sm font-medium">{label}</span>
              <Switch checked={value === true} onChange={(on) => set(field.key, on)} aria-label={label} />
            </div>
          );
        }

        return (
          <Field key={field.id} label={label} htmlFor={id}>
            {field.type === "select" ? (
              <Select id={id} value={value == null ? "" : String(value)} onChange={(event) => set(field.key, event.target.value || null)}>
                <option value="">{t("customFields.none")}</option>
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={id}
                inputMode={field.type === "number" ? "decimal" : undefined}
                value={value == null ? "" : String(value)}
                onChange={(event) => set(field.key, event.target.value)}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

/** Compact "Label: value" line for lists and cards. */
export function CustomFieldSummary({ fields, values }: { fields: CustomFieldDef[]; values: CustomValues | null | undefined }) {
  const locale = useLocale();
  const t = useT();
  const parts = fields
    .filter((field) => values?.[field.key] !== undefined)
    .map((field) => {
      const value = values![field.key];
      const shown = typeof value === "boolean" ? (value ? t("customFields.yes") : t("customFields.no")) : String(value);
      return `${customFieldLabel(field, locale)}: ${shown}`;
    });
  if (parts.length === 0) return null;
  return <p className="line-clamp-2 break-words text-xs text-on-surface-muted">{parts.join(" · ")}</p>;
}
