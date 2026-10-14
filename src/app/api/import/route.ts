// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import { asBatch, getDb } from "@/db";
import { categories, customers, products } from "@/db/schema";
import type { Category, Customer, Product } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/validation";
import {
  IMPORT_FORMATS,
  IMPORT_TYPES,
  parseImportFile,
  type ImportReport,
  type ParsedCategory,
  type ParsedCustomer,
  type ParsedProduct,
} from "@/lib/importer";

// ============================================================
// SECTION: POST /api/import — bulk upsert of ONE record type (admin)
// ------------------------------------------------------------
// Body: { type: "products" | "categories" | "customers",
//         format: "json" | "xml", content: string, dryRun?: boolean }
//
// Match-or-create rules are documented in src/lib/importer.ts.
// Rows with problems are skipped and listed in `errors`; valid
// rows still import.
//
// dryRun=true (default) validates and reports WITHOUT writing —
// the admin UI always runs a dry run first and shows the report.
// Writes go out as D1 batches (one round trip per chunk) so large
// catalogs stay well inside Worker subrequest limits.
// ============================================================

const importRequestSchema = z.object({
  type: z.enum(IMPORT_TYPES),
  format: z.enum(IMPORT_FORMATS),
  content: z.string().min(2, "Import content is empty"),
  dryRun: z.boolean().default(true),
});

type Db = Awaited<ReturnType<typeof getDb>>;
type Statements = BatchItem<"sqlite">[];

const BATCH_SIZE = 50;

const key = (value: string) => value.trim().toLowerCase();

/** Only fields the file actually provided, and only if they differ. */
function changedFields<Row extends object>(
  existing: Row,
  incoming: Partial<Row>
): Partial<Row> {
  const changes: Partial<Row> = {};
  for (const [field, value] of Object.entries(incoming) as [keyof Row, Row[keyof Row]][]) {
    if (value !== undefined && existing[field] !== value) changes[field] = value;
  }
  return changes;
}

// ============================================================
// SECTION: Route
// ============================================================

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const body = await parseJsonBody(request, importRequestSchema);

    const report: ImportReport = {
      dryRun: body.dryRun,
      type: body.type,
      created: 0,
      updated: 0,
      unchanged: 0,
      categoriesCreated: 0,
      errors: [],
    };
    const statements: Statements = [];

    if (body.type === "products") {
      const parsed = parseImportFile("products", body.format, body.content);
      report.errors.push(...parsed.errors);
      await planProducts(db, parsed.rows, report, statements);
    } else if (body.type === "categories") {
      const parsed = parseImportFile("categories", body.format, body.content);
      report.errors.push(...parsed.errors);
      await planCategories(db, parsed.rows, report, statements);
    } else {
      const parsed = parseImportFile("customers", body.format, body.content);
      report.errors.push(...parsed.errors);
      await planCustomers(db, parsed.rows, report, statements);
    }

    if (!body.dryRun) {
      for (let start = 0; start < statements.length; start += BATCH_SIZE) {
        await db.batch(asBatch(statements.slice(start, start + BATCH_SIZE)));
      }
    }

    return NextResponse.json(report);
  } catch (error) {
    return errorResponse(error);
  }
}

// ============================================================
// SECTION: Categories — shared lookup (also used by products)
// ------------------------------------------------------------
// New categories go to the end of the list (max sortOrder + 1)
// unless the file says otherwise.
// ============================================================

async function loadCategories(db: Db) {
  const rows = await db.select().from(categories);
  const byName = new Map(rows.map((row) => [key(row.name), row]));
  let nextSort = rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1;
  return { byName, takeSortOrder: () => nextSort++ };
}

function newCategory(name: string, sortOrder: number, extra: Partial<Category> = {}): Category {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    nameEl: null,
    description: null,
    sortOrder,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

async function planCategories(
  db: Db,
  rows: ParsedCategory[],
  report: ImportReport,
  statements: Statements
) {
  const lookup = await loadCategories(db);

  for (const row of rows) {
    const match = lookup.byName.get(key(row.name));

    if (!match) {
      const created = newCategory(row.name, row.sortOrder ?? lookup.takeSortOrder(), {
        nameEl: row.nameEl ?? null,
        description: row.description ?? null,
      });
      statements.push(db.insert(categories).values(created));
      lookup.byName.set(key(row.name), created);
      report.created += 1;
      continue;
    }

    const changes = changedFields(match, {
      nameEl: row.nameEl,
      description: row.description,
      sortOrder: row.sortOrder,
    });
    if (Object.keys(changes).length === 0) {
      report.unchanged += 1;
      continue;
    }
    statements.push(
      db.update(categories).set({ ...changes, updatedAt: new Date() }).where(eq(categories.id, match.id))
    );
    Object.assign(match, changes);
    report.updated += 1;
  }
}

// ============================================================
// SECTION: Products — partNumber match, else create
// ------------------------------------------------------------
// Updates apply only the fields present in the file. A new
// product needs a category (auto-created by name if missing).
// ============================================================

async function planProducts(
  db: Db,
  rows: ParsedProduct[],
  report: ImportReport,
  statements: Statements
) {
  const lookup = await loadCategories(db);
  const existing = await db.select().from(products);
  const byPart = new Map(existing.map((row) => [key(row.partNumber), row]));

  const resolveCategory = (name: string): string => {
    const found = lookup.byName.get(key(name));
    if (found) return found.id;
    const created = newCategory(name, lookup.takeSortOrder());
    statements.push(db.insert(categories).values(created));
    lookup.byName.set(key(name), created);
    report.categoriesCreated += 1;
    return created.id;
  };

  rows.forEach((row, index) => {
    const match = byPart.get(key(row.partNumber));

    if (!match) {
      if (!row.category) {
        report.errors.push(
          `Row ${index + 1} (${row.partNumber}): category is required for new products`
        );
        return;
      }
      const now = new Date();
      const created: Product = {
        id: crypto.randomUUID(),
        partNumber: row.partNumber,
        name: row.name,
        description: row.description ?? null,
        imageUrl: null,
        categoryId: resolveCategory(row.category),
        isActive: true,
        barcode: row.barcode ?? null,
        itemsPerBox: row.itemsPerBox ?? null,
        createdAt: now,
        updatedAt: now,
      };
      statements.push(db.insert(products).values(created));
      byPart.set(key(row.partNumber), created);
      report.created += 1;
      return;
    }

    const changes = changedFields(match, {
      name: row.name,
      description: row.description,
      barcode: row.barcode,
      itemsPerBox: row.itemsPerBox,
      categoryId: row.category ? resolveCategory(row.category) : undefined,
    });
    if (Object.keys(changes).length === 0) {
      report.unchanged += 1;
      return;
    }
    statements.push(
      db.update(products).set({ ...changes, updatedAt: new Date() }).where(eq(products.id, match.id))
    );
    Object.assign(match, changes);
    report.updated += 1;
  });
}

// ============================================================
// SECTION: Customers — phone match, else name match, else create
// ============================================================

async function planCustomers(
  db: Db,
  rows: ParsedCustomer[],
  report: ImportReport,
  statements: Statements
) {
  const existing = await db.select().from(customers);
  const byPhone = new Map(
    existing.filter((row) => row.phone).map((row) => [key(row.phone!), row])
  );
  const byName = new Map(existing.map((row) => [key(row.name), row]));

  // Registered in both maps so duplicates within the file update
  // the earlier row instead of inserting twice.
  const remember = (row: Customer) => {
    if (row.phone) byPhone.set(key(row.phone), row);
    byName.set(key(row.name), row);
  };

  for (const row of rows) {
    const match =
      (row.phone ? byPhone.get(key(row.phone)) : undefined) ?? byName.get(key(row.name));

    if (!match) {
      const now = new Date();
      const created: Customer = {
        id: crypto.randomUUID(),
        name: row.name,
        address: row.address ?? null,
        phone: row.phone ?? null,
        email: row.email ?? null,
        comments: row.comments ?? null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      statements.push(db.insert(customers).values(created));
      remember(created);
      report.created += 1;
      continue;
    }

    const changes = changedFields(match, {
      name: row.name,
      address: row.address,
      phone: row.phone,
      email: row.email,
      comments: row.comments,
    });
    if (Object.keys(changes).length === 0) {
      report.unchanged += 1;
      continue;
    }
    statements.push(
      db.update(customers).set({ ...changes, updatedAt: new Date() }).where(eq(customers.id, match.id))
    );
    Object.assign(match, changes);
    remember(match);
    report.updated += 1;
  }
}
