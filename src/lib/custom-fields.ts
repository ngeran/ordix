import { z } from "zod";

// Owner-defined extra fields for products, customers and categories. Values
// live in each row's `extra` JSON column, keyed by the field's `key`, so adding
// or hiding a field never changes the database structure.

export const CUSTOM_FIELD_ENTITIES = ["products", "customers", "categories"] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export const CUSTOM_FIELD_TYPES = ["text", "number", "boolean", "select"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export type CustomValue = string | number | boolean;
export type CustomValues = Record<string, CustomValue>;

export interface CustomFieldDef {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  labelEn: string;
  labelEl: string | null;
  type: CustomFieldType;
  options: string[] | null;
  required: boolean;
  sortOrder: number;
  isActive: boolean;
}

export const customFieldLabel = (field: CustomFieldDef, locale: string) =>
  (locale === "el" && field.labelEl) || field.labelEn;

/** "Warranty (months)" → "warranty_months" */
export const slugifyKey = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

export const customValuesSchema = z
  .record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]))
  .optional();

const label = z.string().trim().min(1).max(60);

export const customFieldCreateSchema = z
  .object({
    entity: z.enum(CUSTOM_FIELD_ENTITIES),
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,39}$/, "Key: a–z, digits and _, starting with a letter"),
    labelEn: label,
    labelEl: label.nullable().optional(),
    type: z.enum(CUSTOM_FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(60)).max(50).nullable().optional(),
    required: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(9999).default(0),
  })
  .refine((field) => field.type !== "select" || (field.options?.length ?? 0) > 0, {
    message: "A list field needs at least one option",
  });

// entity/key/type are fixed after creation — changing them would orphan stored values.
export const customFieldUpdateSchema = z.object({
  labelEn: label.optional(),
  labelEl: label.nullable().optional(),
  options: z.array(z.string().trim().min(1).max(60)).max(50).nullable().optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Checks submitted values against the active definitions and returns the
 * cleaned object to store. Values of hidden (inactive) fields already on the
 * row are kept, so re-activating a field brings its data back.
 */
export function cleanCustomValues(
  defs: CustomFieldDef[],
  input: Record<string, CustomValue | null> | undefined,
  existing: CustomValues | null | undefined
): { values: CustomValues; error?: string } {
  const values: CustomValues = {};
  const activeKeys = new Set(defs.filter((def) => def.isActive).map((def) => def.key));
  for (const [key, value] of Object.entries(existing ?? {})) {
    if (!activeKeys.has(key)) values[key] = value;
  }

  for (const def of defs.filter((field) => field.isActive)) {
    const raw = input === undefined ? existing?.[def.key] : input[def.key];
    const empty = raw === undefined || raw === null || raw === "";
    if (empty) {
      if (def.required && def.type !== "boolean") return { values, error: `"${def.labelEn}" is required` };
      continue;
    }
    switch (def.type) {
      case "number": {
        const number = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
        if (!Number.isFinite(number)) return { values, error: `"${def.labelEn}" must be a number` };
        values[def.key] = number;
        break;
      }
      case "boolean":
        values[def.key] = raw === true || raw === "true" || raw === 1 || raw === "1";
        break;
      case "select":
        if (!def.options?.includes(String(raw))) {
          return { values, error: `"${def.labelEn}" must be one of: ${def.options?.join(", ")}` };
        }
        values[def.key] = String(raw);
        break;
      default:
        values[def.key] = String(raw).trim();
    }
  }
  return { values };
}
