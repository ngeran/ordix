// ============================================================
// SECTION: Imports
// ============================================================

import { z } from "zod";
import { stripXmlNoise, xmlBlocks, xmlDocument, xmlField, type XmlNode } from "@/lib/xml";
import type { CustomValue } from "@/lib/custom-fields";

// ============================================================
// SECTION: Import file formats (one record type per file)
// ------------------------------------------------------------
// The admin picks WHAT to import (products / categories /
// customers) and the format. Each type accepts:
//
// JSON — a wrapped list or a bare array:
//   { "products": [ { "partNumber": "…", "name": "…" } ] }
//   [ { "partNumber": "…", "name": "…" } ]
//
// XML — one element per record, one child per field:
//   <ordix><products><product><partNumber>…</partNumber>…</product></products></ordix>
//   (the <ordix> root is optional)
//
// Matching rules (create when no match, else update):
//   - product  → partNumber (case-insensitive)
//   - category → name (case-insensitive)
//   - customer → phone (if present), else name
//
// Products are pure identifiers (build-to-order): no prices, no
// stock — money is quoted per order line. A product's "category"
// is created automatically when it doesn't exist yet.
// ============================================================

export const IMPORT_TYPES = ["products", "categories", "customers"] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export const IMPORT_FORMATS = ["json", "xml"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

// ============================================================
// SECTION: Record schemas (file shape → normalized rows)
// ------------------------------------------------------------
// Empty strings count as "not provided" so blank spreadsheet
// cells / empty XML elements never wipe existing values.
// ============================================================

/** Numbers in a text field (e.g. a numeric part number) are fine. */
const asText = (value: unknown) => (typeof value === "number" ? String(value) : value);

const optionalText = z.preprocess((value) => {
  const text = asText(value);
  return typeof text === "string" && text.trim() === "" ? undefined : text;
}, z.string().trim().optional());

const optionalCount = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce
    .number({ error: "must be a whole number" })
    .int("must be a whole number")
    .min(0, "can't be negative")
    .optional()
);

const requiredText = (label: string) =>
  z.preprocess(
    asText,
    z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`)
  );

const productSchema = z.object({
  partNumber: requiredText("partNumber"),
  name: requiredText("name"),
  category: optionalText,
  description: optionalText,
  barcode: optionalText,
  itemsPerBox: optionalCount,
});

const categorySchema = z.object({
  name: requiredText("name"),
  nameEl: optionalText,
  description: optionalText,
  sortOrder: optionalCount,
});

const customerSchema = z.object({
  name: requiredText("name"),
  address: optionalText,
  phone: optionalText,
  email: optionalText,
  comments: optionalText,
});

export type ParsedProduct = z.output<typeof productSchema>;
export type ParsedCategory = z.output<typeof categorySchema>;
export type ParsedCustomer = z.output<typeof customerSchema>;

interface ParsedRows {
  products: ParsedProduct;
  categories: ParsedCategory;
  customers: ParsedCustomer;
}

// ============================================================
// SECTION: Per-type specs (fields, XML tags, templates)
// ------------------------------------------------------------
// Single source for the parser, the field reference shown in the
// admin UI and the downloadable templates.
// ============================================================

export interface ImportFieldSpec {
  name: string;
  required: boolean;
}

interface ImportSpec {
  /** XML element per record, e.g. <product>. */
  recordTag: string;
  schema: z.ZodType;
  fields: ImportFieldSpec[];
  /** Field used to label error rows ("Row 3 (ALU-40): …"). */
  labelField: string;
  sample: Record<string, string | number>[];
}

export const IMPORT_SPECS: Record<ImportType, ImportSpec> = {
  products: {
    recordTag: "product",
    schema: productSchema,
    labelField: "partNumber",
    fields: [
      { name: "partNumber", required: true },
      { name: "name", required: true },
      { name: "category", required: false },
      { name: "description", required: false },
      { name: "barcode", required: false },
      { name: "itemsPerBox", required: false },
    ],
    sample: [
      { partNumber: "ALU-PRF-4040", name: "T-Slot Profile 40×40 (6m bar)", category: "Aluminum Profiles", itemsPerBox: 6 },
      { partNumber: "LOCK-MP-R70", name: "Multipoint Lock R70 35mm", category: "Locking Mechanisms", barcode: "5201234567890", itemsPerBox: 10 },
    ],
  },
  categories: {
    recordTag: "category",
    schema: categorySchema,
    labelField: "name",
    fields: [
      { name: "name", required: true },
      { name: "nameEl", required: false },
      { name: "description", required: false },
      { name: "sortOrder", required: false },
    ],
    sample: [
      { name: "Aluminum Profiles", nameEl: "Προφίλ αλουμινίου", sortOrder: 1 },
      { name: "Locking Mechanisms", nameEl: "Μηχανισμοί κλειδώματος", description: "Locks, cylinders & handles", sortOrder: 2 },
    ],
  },
  customers: {
    recordTag: "customer",
    schema: customerSchema,
    labelField: "name",
    fields: [
      { name: "name", required: true },
      { name: "phone", required: false },
      { name: "email", required: false },
      { name: "address", required: false },
      { name: "comments", required: false },
    ],
    sample: [
      { name: "Νίκος Παπαδόπουλος", phone: "6971234567", email: "nikos.p@example.gr", address: "Λεωφ. Ηρακλείου 124, Ηράκλειο", comments: "Παράδοση απόγευμα" },
      { name: "Ελένη Κωνσταντίνου", phone: "6945556677", address: "Οδός Αθηνών 8, Χανιά" },
    ],
  },
};

// ============================================================
// SECTION: Parsing
// ============================================================

/** Values for owner-defined custom fields, by field key (validated later against the definitions). */
export type WithCustom<Row> = Row & { custom: Record<string, CustomValue> };

export interface ParsedImport<T extends ImportType> {
  rows: WithCustom<ParsedRows[T]>[];
  errors: string[];
}

function pickCustom(record: unknown, customKeys: string[]): Record<string, CustomValue> {
  const source = (record ?? {}) as Record<string, unknown>;
  const custom: Record<string, CustomValue> = {};
  for (const key of customKeys) {
    const value = source[key];
    if (typeof value === "number" || typeof value === "boolean") custom[key] = value;
    else if (typeof value === "string" && value.trim() !== "") custom[key] = value.trim();
  }
  return custom;
}

function validateRecords<T extends ImportType>(
  type: T,
  records: unknown[],
  customKeys: string[]
): ParsedImport<T> {
  const spec = IMPORT_SPECS[type];
  const rows: WithCustom<ParsedRows[T]>[] = [];
  const errors: string[] = [];

  records.forEach((record, index) => {
    const parsed = spec.schema.safeParse(record);
    if (parsed.success) {
      rows.push({ ...(parsed.data as ParsedRows[T]), custom: pickCustom(record, customKeys) });
      return;
    }
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".");
    const label = (record as Record<string, unknown> | null)?.[spec.labelField];
    const where = `Row ${index + 1}${typeof label === "string" && label.trim() ? ` (${label.trim()})` : ""}`;
    const message = issue?.message ?? "invalid";
    errors.push(
      `${where}: ${field && !message.startsWith(field) ? `${field} ${message}` : message}`
    );
  });

  return { rows, errors };
}

function jsonRecords(type: ImportType, content: string): unknown[] | string {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return "File is not valid JSON";
  }

  if (Array.isArray(raw)) return raw;

  const root = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(root[type])) return root[type] as unknown[];

  // Helpful when the wrong type is picked for the file.
  const other = IMPORT_TYPES.find((candidate) => Array.isArray(root[candidate]));
  return other
    ? `This file contains "${other}", not "${type}" — pick "${other}" above`
    : `JSON must be an array, or contain a "${type}" array`;
}

function xmlRecords(type: ImportType, content: string, customKeys: string[]): unknown[] | string {
  const spec = IMPORT_SPECS[type];
  const xml = stripXmlNoise(content);

  // Only blocks WITH child elements are records — a product's
  // <category>Profiles</category> field is not a category record.
  const blocks = xmlBlocks(xml, spec.recordTag).filter((block) => /<[a-z]/i.test(block));

  if (blocks.length === 0) {
    const other = IMPORT_TYPES.find(
      (candidate) =>
        candidate !== type &&
        xmlBlocks(xml, IMPORT_SPECS[candidate].recordTag).some((block) => /<[a-z]/i.test(block))
    );
    return other
      ? `This file contains <${IMPORT_SPECS[other].recordTag}> records, not <${spec.recordTag}> — pick "${other}" above`
      : `No <${spec.recordTag}> records found`;
  }

  return blocks.map((block) =>
    Object.fromEntries(
      [...spec.fields.map((field) => field.name), ...customKeys].map((name) => [name, xmlField(block, name)])
    )
  );
}

export function parseImportFile<T extends ImportType>(
  type: T,
  format: ImportFormat,
  content: string,
  customKeys: string[] = []
): ParsedImport<T> {
  const records = format === "xml" ? xmlRecords(type, content, customKeys) : jsonRecords(type, content);
  if (typeof records === "string") return { rows: [], errors: [records] };
  if (records.length === 0) return { rows: [], errors: ["The file has no records"] };
  return validateRecords(type, records, customKeys);
}

/** Result of POST /api/import (dry run or applied). */
export interface ImportReport {
  dryRun: boolean;
  type: ImportType;
  created: number;
  updated: number;
  unchanged: number;
  /** Products only: categories auto-created for new/moved products. */
  categoriesCreated: number;
  errors: string[];
}

// ============================================================
// SECTION: Downloadable templates
// ============================================================

export function importTemplate(type: ImportType, format: ImportFormat): string {
  const spec = IMPORT_SPECS[type];
  if (format === "json") {
    return `${JSON.stringify({ [type]: spec.sample }, null, 2)}\n`;
  }
  return xmlDocument("ordix", {
    [type]: { [spec.recordTag]: spec.sample as XmlNode[] },
  });
}
