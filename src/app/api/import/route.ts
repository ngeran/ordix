// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, customers, products } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/validation";
import { parseImportFile } from "@/lib/importer";
import { z } from "zod";

// ============================================================
// SECTION: POST /api/import — bulk customers & products (admin)
// ------------------------------------------------------------
// Body: { format: "json" | "xml", content: string, dryRun?: boolean }
//
// Upsert semantics (documented in src/lib/importer.ts):
//   customer → matched by phone, else by exact name
//   product  → matched by partNumber (case-insensitive)
//   category → created automatically when missing
//
// dryRun=true (default) validates and reports WITHOUT writing —
// the admin UI always runs a dry run first and shows the report.
// ============================================================

const importRequestSchema = z.object({
  format: z.enum(["json", "xml"]),
  content: z.string().min(2, "Import content is empty"),
  dryRun: z.boolean().default(true),
});

interface ImportReport {
  customersCreated: number;
  customersUpdated: number;
  productsCreated: number;
  productsUpdated: number;
  categoriesCreated: number;
  errors: string[];
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const db = await getDb();
    const body = await parseJsonBody(request, importRequestSchema);
    const parsed = parseImportFile(body.format, body.content);

    const report: ImportReport = {
      customersCreated: 0,
      customersUpdated: 0,
      productsCreated: 0,
      productsUpdated: 0,
      categoriesCreated: 0,
      errors: [...parsed.errors],
    };

    // -- Existing rows loaded into maps for match-or-create --
    const existingCustomers = await db.select().from(customers);
    const customerByPhone = new Map(
      existingCustomers
        .filter((row) => row.phone)
        .map((row) => [row.phone!.trim().toLowerCase(), row])
    );
    const customerByName = new Map(
      existingCustomers.map((row) => [row.name.trim().toLowerCase(), row])
    );

    const existingProducts = await db.select().from(products);
    const productByPart = new Map(
      existingProducts.map((row) => [row.partNumber.toLowerCase(), row])
    );

    const existingCategories = await db.select().from(categories);
    const categoryByName = new Map(
      existingCategories.map((row) => [row.name.toLowerCase(), row])
    );

    // Categories are created (never updated) — resolved lazily so a
    // dry run can count them without writing.
    const ensureCategory = async (name: string): Promise<string> => {
      const key = name.trim().toLowerCase();
      const existing = categoryByName.get(key);
      if (existing) return existing.id;
      const id = crypto.randomUUID();
      if (!body.dryRun) {
        await db.insert(categories).values({ id, name: name.trim() });
      }
      categoryByName.set(key, {
        id,
        name: name.trim(),
        nameEl: null,
        description: null,
        sortOrder: 999,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      report.categoriesCreated += 1;
      return id;
    };

    // ============================================================
    // SECTION: Customers — phone match, else name match, else create
    // ============================================================
    for (const customer of parsed.customers) {
      const match =
        (customer.phone
          ? customerByPhone.get(customer.phone.toLowerCase())
          : undefined) ?? customerByName.get(customer.name.toLowerCase());

      if (match) {
        const changed =
          match.address !== (customer.address ?? match.address) ||
          match.email !== (customer.email ?? match.email) ||
          match.comments !== (customer.comments ?? match.comments) ||
          (!match.phone && customer.phone);
        if (changed && !body.dryRun) {
          await db
            .update(customers)
            .set({
              name: customer.name,
              address: customer.address ?? match.address,
              phone: customer.phone ?? match.phone,
              email: customer.email ?? match.email,
              comments: customer.comments ?? match.comments,
              updatedAt: new Date(),
            })
            .where(eq(customers.id, match.id));
        }
        if (changed) report.customersUpdated += 1;
        continue;
      }

      const id = crypto.randomUUID();
      if (!body.dryRun) {
        await db.insert(customers).values({
          id,
          name: customer.name,
          address: customer.address ?? null,
          phone: customer.phone ?? null,
          email: customer.email ?? null,
          comments: customer.comments ?? null,
        });
      }
      // Register in maps so duplicates within the file don't double-insert.
      const registered = {
        id,
        name: customer.name,
        address: customer.address ?? null,
        phone: customer.phone ?? null,
        email: customer.email ?? null,
        comments: customer.comments ?? null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (customer.phone)
        customerByPhone.set(customer.phone.toLowerCase(), registered);
      customerByName.set(customer.name.toLowerCase(), registered);
      report.customersCreated += 1;
    }

    // ============================================================
    // SECTION: Products — partNumber match, else create
    // ============================================================
    for (const product of parsed.products) {
      const match = productByPart.get(product.partNumber.toLowerCase());

      if (match) {
        // Only the display name can drift — everything else about a
        // product is managed in the admin UI.
        if (match.name !== product.name && !body.dryRun) {
          await db
            .update(products)
            .set({ name: product.name, updatedAt: new Date() })
            .where(eq(products.id, match.id));
        }
        if (match.name !== product.name) report.productsUpdated += 1;
        continue;
      }

      const categoryId = product.category
        ? await ensureCategory(product.category)
        : null;
      if (!categoryId) {
        report.errors.push(
          `Product ${product.partNumber}: no category (field "category" is required for new products)`
        );
        continue;
      }

      const id = crypto.randomUUID();
      if (!body.dryRun) {
        await db.insert(products).values({
          id,
          partNumber: product.partNumber,
          name: product.name,
          categoryId,
          itemsPerBox: product.itemsPerBox ?? null,
        });
      }
      productByPart.set(product.partNumber.toLowerCase(), {
        id,
        partNumber: product.partNumber,
        name: product.name,
        categoryId,
        description: null,
        imageUrl: null,
        isActive: true,
        barcode: null,
        itemsPerBox: product.itemsPerBox ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      report.productsCreated += 1;
    }
    // ============================================================

    return NextResponse.json({ dryRun: body.dryRun, ...report });
  } catch (error) {
    return errorResponse(error);
  }
}
