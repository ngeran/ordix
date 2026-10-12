// ============================================================
// SECTION: Imports
// ============================================================

import { z } from "zod";

// ============================================================
// SECTION: Import file format (designed for this business)
// ------------------------------------------------------------
// JSON:
// {
//   "customers": [
//     { "name": "…", "address": "…", "phone": "…", "email": "…", "comments": "…" }
//   ],
//   "products": [
//     { "partNumber": "ALU-PRF-4040", "name": "…", "category": "Aluminum Profiles",
//       "itemsPerBox": 6, "pricePerBox": 171.00, "pricePerItem": 28.50,
//       "stock": 10, "minStock": 2 }
//   ]
// }
//
// XML (same fields, same nesting):
// <ordix>
//   <customers><customer><name>…</name>…</customer></customers>
//   <products><product><partNumber>…</partNumber>…</product></products>
// </ordix>
//
// Rules:
//   - prices are written in EUROS (45.50) and stored as cents
//   - customer identity for updates: phone (if present), else name
//   - product identity for updates: partNumber (case-insensitive)
//   - "category" is created automatically when it doesn't exist
// ============================================================

// ============================================================
// SECTION: Raw schemas (the file's shape, before normalization)
// ============================================================

const rawCustomerSchema = z.object({
  name: z.string().trim().min(1, "customer.name is required"),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  comments: z.string().trim().optional(),
});

const rawProductSchema = z.object({
  partNumber: z.string().trim().min(1, "product.partNumber is required"),
  name: z.string().trim().min(1, "product.name is required"),
  category: z.string().trim().optional(),
  itemsPerBox: z.coerce.number().int().min(0).optional(),
  pricePerBox: z.coerce.number().min(0).optional(),
  pricePerItem: z.coerce.number().min(0).optional(),
  stock: z.coerce.number().int().min(0).optional(),
  minStock: z.coerce.number().int().min(0).optional(),
});

export interface ParsedCustomer {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  comments?: string;
}

export interface ParsedProduct {
  partNumber: string;
  name: string;
  category?: string;
  itemsPerBox?: number;
  /** Integer cents after euro conversion. */
  pricePerBoxCents?: number;
  pricePerItemCents?: number;
  stockQuantity: number;
  minStock: number;
}

export interface ParsedImportFile {
  customers: ParsedCustomer[];
  products: ParsedProduct[];
  errors: string[];
}

/** EUROS → integer cents, forgiving commas as decimal separators. */
function eurosToCents(value: number | string): number {
  const normalized =
    typeof value === "string" ? Number(value.replace(",", ".")) : value;
  return Math.round(normalized * 100);
}

// ============================================================
// SECTION: JSON parsing
// ============================================================

function parseJsonImport(content: string): ParsedImportFile {
  const errors: string[] = [];
  const customers: ParsedCustomer[] = [];
  const products: ParsedProduct[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return { customers: [], products: [], errors: ["File is not valid JSON"] };
  }

  const root = (raw ?? {}) as Record<string, unknown>;

  // -- Customers --
  const rawCustomers = Array.isArray(root.customers) ? root.customers : [];
  rawCustomers.forEach((entry, index) => {
    const parsed = rawCustomerSchema.safeParse(entry);
    if (parsed.success) {
      customers.push(parsed.data);
    } else {
      errors.push(`customers[${index}]: ${parsed.error.issues[0]?.message}`);
    }
  });

  // -- Products --
  const rawProducts = Array.isArray(root.products) ? root.products : [];
  rawProducts.forEach((entry, index) => {
    const parsed = rawProductSchema.safeParse(entry);
    if (parsed.success) {
      const data = parsed.data;
      products.push({
        partNumber: data.partNumber,
        name: data.name,
        category: data.category,
        itemsPerBox: data.itemsPerBox,
        pricePerBoxCents:
          data.pricePerBox !== undefined ? eurosToCents(data.pricePerBox) : undefined,
        pricePerItemCents:
          data.pricePerItem !== undefined ? eurosToCents(data.pricePerItem) : undefined,
        stockQuantity: data.stock ?? 0,
        minStock: data.minStock ?? 0,
      });
    } else {
      errors.push(`products[${index}]: ${parsed.error.issues[0]?.message}`);
    }
  });

  if (!Array.isArray(root.customers) && !Array.isArray(root.products)) {
    errors.push('JSON must contain a "customers" and/or "products" array');
  }

  return { customers, products, errors };
}

// ============================================================
// SECTION: XML parsing
// ------------------------------------------------------------
// Deliberately minimal: the XML shape is defined by this app (see
// header), so a block extractor for <customer>/<product> and their
// known child tags is enough — no XML dependency on the Worker.
// ============================================================

function xmlBlocks(xml: string, tag: string): string[] {
  const matches = xml.matchAll(
    new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi")
  );
  return [...matches].map((match) => match[1]);
}

function xmlField(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

function parseXmlImport(content: string): ParsedImportFile {
  const errors: string[] = [];
  const customers: ParsedCustomer[] = [];
  const products: ParsedProduct[] = [];

  if (!/<ordix[\s>]/i.test(content)) {
    errors.push('XML must have an <ordix> root element');
  }

  for (const [index, block] of xmlBlocks(content, "customer").entries()) {
    const name = xmlField(block, "name");
    if (!name) {
      errors.push(`customer[${index}]: <name> is required`);
      continue;
    }
    customers.push({
      name,
      address: xmlField(block, "address"),
      phone: xmlField(block, "phone"),
      email: xmlField(block, "email"),
      comments: xmlField(block, "comments"),
    });
  }

  for (const [index, block] of xmlBlocks(content, "product").entries()) {
    const partNumber = xmlField(block, "partNumber");
    const name = xmlField(block, "name");
    if (!partNumber || !name) {
      errors.push(`product[${index}]: <partNumber> and <name> are required`);
      continue;
    }
    const toNumber = (tag: string): number | undefined => {
      const raw = xmlField(block, tag);
      if (raw === undefined) return undefined;
      const value = Number(raw.replace(",", "."));
      return Number.isFinite(value) ? value : undefined;
    };
    const pricePerBox = toNumber("pricePerBox");
    const pricePerItem = toNumber("pricePerItem");
    products.push({
      partNumber,
      name,
      category: xmlField(block, "category"),
      itemsPerBox: toNumber("itemsPerBox"),
      pricePerBoxCents: pricePerBox !== undefined ? eurosToCents(pricePerBox) : undefined,
      pricePerItemCents:
        pricePerItem !== undefined ? eurosToCents(pricePerItem) : undefined,
      stockQuantity: toNumber("stock") ?? 0,
      minStock: toNumber("minStock") ?? 0,
    });
  }

  return { customers, products, errors };
}

// ============================================================
// SECTION: Public entry
// ============================================================

export function parseImportFile(
  format: "json" | "xml",
  content: string
): ParsedImportFile {
  return format === "xml" ? parseXmlImport(content) : parseJsonImport(content);
}
