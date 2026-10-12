// ============================================================
// SECTION: Imports
// ============================================================

import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { appSettings, categories, customers, products, users } from "../src/db/schema";

// ============================================================
// SECTION: Seed script
// ------------------------------------------------------------
// Populates the LOCAL D1 database (the same miniflare state that
// `next dev` uses, via wrangler's platform proxy) with:
//   - 2 users (admin + staff, bcrypt-hashed passwords)
//   - 6 categories (industrial aluminum/locks + general)
//   - 26 realistic products with part numbers, stock thresholds
//   - default behavior settings
//
// Usage:  npm run db:seed        (after db:migrate:local)
// Idempotent: exits early if users already exist.
//
// NOTE on chunking: D1 caps each statement at 100 bound
// variables. The product insert has ~15 columns, so rows go in
// in chunks of 6 (6×15 = 90 < 100). IDs are proper UUIDs
// generated here — matching what the app's validation expects.
// ============================================================

// ============================================================
// SECTION: Seed data — users
// ============================================================

const seedUsers = [
  {
    id: crypto.randomUUID(),
    email: "admin@ordix.local",
    name: "Nikos (Admin)",
    role: "admin" as const,
    passwordHash: bcrypt.hashSync("admin123", 10),
  },
  {
    id: crypto.randomUUID(),
    email: "staff@ordix.local",
    name: "Maria (Staff)",
    role: "staff" as const,
    passwordHash: bcrypt.hashSync("staff123", 10),
  },
];

// ============================================================
// SECTION: Seed data — customers (build-to-order demo)
// ============================================================

const seedCustomers = [
  {
    id: crypto.randomUUID(),
    name: "Νίκος Παπαδόπουλος",
    address: "Λεωφ. Ηρακλείου 124, Ηράκλειο",
    phone: "6971234567",
    email: "nikos.p@example.gr",
    comments: "Παράδοση απόγευμα",
  },
  {
    id: crypto.randomUUID(),
    name: "Ελένη Κωνσταντίνου",
    address: "Οδός Αθηνών 8, Χανιά",
    phone: "6945556677",
    email: null,
    comments: null,
  },
  {
    id: crypto.randomUUID(),
    name: "Εργοστάσιο Αλουμινίων Κρήτης",
    address: "Βιομηχανική Περιοχή, Ρέθυμνο",
    phone: "2831099999",
    email: "orders@alu-crete.example",
    comments: "Χονδρική — πάντα σε κουτιά",
  },
];

// ============================================================
// SECTION: Seed data — categories
// ------------------------------------------------------------
// Linked to products by `key` (not id) — UUIDs are minted at
// insert time so the data always matches the app's contracts.
// ============================================================

interface SeedCategory {
  key: string;
  name: string;
  nameEl: string;
}

const seedCategories: SeedCategory[] = [
  { key: "profiles", name: "Aluminum Profiles", nameEl: "Προφίλ Αλουμινίου" },
  { key: "locks", name: "Locking Mechanisms", nameEl: "Μηχανισμοί Κλειδώματος" },
  { key: "hardware", name: "Handles & Hardware", nameEl: "Χειρολαβές & Εξαρτήματα" },
  { key: "seals", name: "Seals & Fasteners", nameEl: "Λάστιχα & Συνδετικά" },
  { key: "packaging", name: "Packaging", nameEl: "Συσκευασίες" },
  { key: "pantry", name: "Café & Pantry", nameEl: "Καφές & Κουζίνα" },
];

/**
 * Box pricing helper: a box holds `perBox` pieces and costs the
 * piece price × perBox with a small volume discount, so the demo
 * shows both pricing paths working.
 */
function boxPrice(perPieceCents: number, perBox: number): number {
  return Math.round(perPieceCents * perBox * 0.95); // ~5% box discount
}

// ============================================================
// SECTION: Seed data — products
// ------------------------------------------------------------
// Part numbers follow a realistic scheme: FAMILY-TYPE-SIZE.
// Several products are seeded AT or BELOW min_stock so the
// low-stock alerts are visible immediately.
// ============================================================

interface SeedProduct {
  categoryKey: string;
  partNumber: string;
  name: string;
  description: string;
  stockQuantity: number;
  minStock: number;
  priceCents: number;
  unit: string;
  weightGrams?: number;
  supplier?: string;
}

const seedProducts: SeedProduct[] = [
  // -- Aluminum Profiles ------------------------------------------------
  { categoryKey: "profiles", partNumber: "ALU-PRF-4040", name: "T-Slot Profile 40×40 (6m bar)", description: "Anodized aluminum profile, slot 8, natural finish. Structural grade 6060 T66.", stockQuantity: 64, minStock: 20, priceCents: 2850, unit: "pc", weightGrams: 6200, supplier: "Alumil S.A." },
  { categoryKey: "profiles", partNumber: "ALU-PRF-2020", name: "T-Slot Profile 20×20 (6m bar)", description: "Light-duty slot 6 profile for jigs, guards and machine frames.", stockQuantity: 90, minStock: 25, priceCents: 1120, unit: "pc", weightGrams: 1800, supplier: "Alumil S.A." },
  { categoryKey: "profiles", partNumber: "ALU-SHT-1020", name: "Aluminum Sheet 1.0mm 1000×2000", description: "Mill-finish aluminum sheet, alloy 5754 H22, for cladding and laser cutting.", stockQuantity: 15, minStock: 15, priceCents: 4900, unit: "pc", weightGrams: 5400, supplier: "Elval" },
  { categoryKey: "profiles", partNumber: "ALU-ANG-3030", name: "Corner Angle Bracket 30×30", description: "Cast aluminum corner bracket for 30 series profiles, incl. hardware.", stockQuantity: 210, minStock: 50, priceCents: 240, unit: "pc", weightGrams: 60, supplier: "Item Italia" },
  { categoryKey: "profiles", partNumber: "ALU-TUB-D25", name: "Round Tube Ø25×1.5mm (6m)", description: "Drawn aluminum tube 6063, polished. Railings and light structures.", stockQuantity: 8, minStock: 12, priceCents: 1670, unit: "pc", weightGrams: 1700, supplier: "Alumil S.A." },

  // -- Locking Mechanisms ----------------------------------------------
  { categoryKey: "locks", partNumber: "LOCK-MP-R70", name: "Multipoint Lock R70 35mm", description: "Multipoint door lock, 35mm backset, 3 hooks + latch, DIN left. For aluminum doors.", stockQuantity: 7, minStock: 10, priceCents: 6420, unit: "pc", weightGrams: 2100, supplier: "Giesse" },
  { categoryKey: "locks", partNumber: "LOCK-CYL-3030", name: "Euro Profile Cylinder 30/30", description: "Brass double cylinder, 5 pins, 3 keys included, nickel finish.", stockQuantity: 48, minStock: 15, priceCents: 1180, unit: "pc", weightGrams: 220, supplier: "Mottura" },
  { categoryKey: "locks", partNumber: "LOCK-DEAD-2585", name: "Deadbolt 2585 Stainless", description: "Stainless deadbolt lock 2585, 55mm backset, for exterior doors.", stockQuantity: 22, minStock: 8, priceCents: 3260, unit: "pc", weightGrams: 950, supplier: "Mottura" },
  { categoryKey: "locks", partNumber: "LOCK-LAT-65", name: "Mortice Latch 65mm", description: "Tubular mortice latch 65mm backset, zinc alloy forend.", stockQuantity: 75, minStock: 20, priceCents: 540, unit: "pc", weightGrams: 310, supplier: "Omicron" },
  { categoryKey: "locks", partNumber: "LOCK-PANIC-EN", name: "Panic Bar EN1125 900mm", description: "Reversible panic exit device, EN 1125, for emergency exits.", stockQuantity: 3, minStock: 4, priceCents: 14800, unit: "pc", weightGrams: 3400, supplier: "Geze" },
  { categoryKey: "locks", partNumber: "LOCK-CAM-19", name: "Cam Lock 19mm Keyed Alike", description: "Mini cam lock for panels/drawers, 19mm body, keyed alike.", stockQuantity: 34, minStock: 10, priceCents: 320, unit: "pc", weightGrams: 40, supplier: "Omicron" },

  // -- Handles & Hardware ----------------------------------------------
  { categoryKey: "hardware", partNumber: "HND-BAR-300", name: "Bar Handle 300mm F1 Anodized", description: "Aluminum bar handle 300mm c/c, F1 anodized, incl. M4 bolts.", stockQuantity: 130, minStock: 40, priceCents: 690, unit: "pc", weightGrams: 180, supplier: "Giesse" },
  { categoryKey: "hardware", partNumber: "HND-KNOB-R35", name: "Round Knob Ø35 Black", description: "Zamak furniture knob Ø35mm, matte black, M4 insert.", stockQuantity: 260, minStock: 60, priceCents: 210, unit: "pc", weightGrams: 55 },
  { categoryKey: "hardware", partNumber: "HND-PULL-400S", name: "Security Pull Handle 400mm", description: "Stainless pull handle 400mm for entrance doors, Ø32 tube, rosette mount.", stockQuantity: 18, minStock: 6, priceCents: 3480, unit: "pc", weightGrams: 780, supplier: "Omicron" },
  { categoryKey: "hardware", partNumber: "HNG-3D-100", name: "3D Adjustable Hinge 100mm", description: "Heavy-duty 3D hinge for aluminum doors, ±3mm adjustment, 120kg pair rating.", stockQuantity: 9, minStock: 12, priceCents: 2140, unit: "pc", weightGrams: 520, supplier: "Giesse" },
  { categoryKey: "hardware", partNumber: "HNG-SPR-80", name: "Spring Hinge 80mm", description: "Self-closing spring hinge 80mm, fire-door rated, satin finish.", stockQuantity: 55, minStock: 20, priceCents: 780, unit: "pc", weightGrams: 260 },

  // -- Seals & Fasteners -------------------------------------------------
  { categoryKey: "seals", partNumber: "GSK-EPDM-6", name: "EPDM Gasket Roll 6mm (25m)", description: "Black EPDM bubble gasket for glazing and panels, 6mm slot fit, 25m roll.", stockQuantity: 28, minStock: 10, priceCents: 1550, unit: "roll", weightGrams: 900, supplier: "Deventer" },
  { categoryKey: "seals", partNumber: "BRK-TSLOT-M8", name: "T-Slot Connector M8", description: "Die-cast T-nut connector M8 for 40 series, incl. set screw.", stockQuantity: 400, minStock: 100, priceCents: 85, unit: "pc", weightGrams: 35 },
  { categoryKey: "seals", partNumber: "SCR-DIN912-8x25", name: "Hex Socket Screw M8×25 DIN912", description: "A2 stainless hex socket cap screw M8×25. Sold in bags of 50.", stockQuantity: 62, minStock: 30, priceCents: 460, unit: "bag", weightGrams: 640 },
  { categoryKey: "seals", partNumber: "SEAL-SIL-CLEAR", name: "Silicone Sealant Clear 280ml", description: "Neutral-cure structural silicone for glazing, 280ml cartridge.", stockQuantity: 5, minStock: 24, priceCents: 620, unit: "pc", weightGrams: 380, supplier: "Sika" },

  // -- Packaging ----------------------------------------------------------
  { categoryKey: "packaging", partNumber: "PKG-BOX-M", name: "Shipping Box M 400×300×200", description: "Double-wall corrugated box, 20 pieces per bundle.", stockQuantity: 180, minStock: 50, priceCents: 95, unit: "pc", weightGrams: 420 },
  { categoryKey: "packaging", partNumber: "PKG-BOX-L", name: "Shipping Box L 600×400×300", description: "Double-wall corrugated box for profiles up to 580mm, 10 per bundle.", stockQuantity: 42, minStock: 40, priceCents: 180, unit: "pc", weightGrams: 880 },
  { categoryKey: "packaging", partNumber: "PKG-TAPE-48", name: "Packing Tape 48mm×66m", description: "Hot-melt brown packing tape 48mm, 66m roll.", stockQuantity: 96, minStock: 24, priceCents: 130, unit: "pc", weightGrams: 120 },

  // -- Café & Pantry (general/food-style) ---------------------------------
  { categoryKey: "pantry", partNumber: "CAF-COF-1K", name: "Espresso Beans 1kg", description: "House blend espresso beans 1kg, 70/30 arabica robusta.", stockQuantity: 14, minStock: 6, priceCents: 1450, unit: "pc", weightGrams: 1000, supplier: "Local Roastery" },
  { categoryKey: "pantry", partNumber: "CAF-WTR-6PK", name: "Water 1.5L (6-pack)", description: "Still mineral water 1.5L, shrink-wrapped 6-pack.", stockQuantity: 40, minStock: 12, priceCents: 330, unit: "pack", weightGrams: 9200 },
  { categoryKey: "pantry", partNumber: "PAN-MIL-1L", name: "UHT Milk 1L", description: "Full-fat UHT milk 1L, shelf-stable.", stockQuantity: 26, minStock: 10, priceCents: 145, unit: "pc", weightGrams: 1030 },
];

/** Which demo products are sold in boxes (and how many pieces fit). */
const BOX_CONFIG: Record<string, { perBox: number }> = {
  "ALU-PRF-4040": { perBox: 6 },
  "LOCK-MP-R70": { perBox: 10 },
  "LOCK-CYL-3030": { perBox: 24 },
  "HND-BAR-300": { perBox: 50 },
  "HNG-3D-100": { perBox: 20 },
  "PKG-TAPE-48": { perBox: 36 },
  "CAF-COF-1K": { perBox: 6 },
};

// ============================================================
// SECTION: Chunk helper (D1's 100-bound-variables per statement)
// ============================================================

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============================================================
// SECTION: Main — connect via platform proxy & insert
// ============================================================

async function seed() {
  // Platform proxy = local miniflare with the same D1 state the
  // dev server uses (.wrangler/state/v3).
  const proxy = await getPlatformProxy<{ DB: D1Database }>();
  const db = drizzle(proxy.env.DB);

  // -- Idempotency: skip when already seeded --
  const existingUsers = await db.select({ id: users.id }).from(users);
  if (existingUsers.length > 0) {
    console.log(`✔ Database already seeded (${existingUsers.length} users) — nothing to do.`);
    await proxy.dispose();
    return;
  }

  console.log("Seeding Ordix database…");

  // -- Users --
  await db.insert(users).values(seedUsers);
  console.log(`  ✔ ${seedUsers.length} users (admin@ordix.local / staff@ordix.local)`);

  // -- Customers (build-to-order demo) --
  await db.insert(customers).values(seedCustomers);
  console.log(`  ✔ ${seedCustomers.length} customers`);

  // -- Categories: UUID per key, sorted by definition order --
  const categoryIdByKey = new Map<string, string>();
  const categoryRows = seedCategories.map((category, index) => {
    const id = crypto.randomUUID();
    categoryIdByKey.set(category.key, id);
    return { id, ...category, description: null, sortOrder: index, isActive: true };
  });
  await db.insert(categories).values(categoryRows);
  console.log(`  ✔ ${categoryRows.length} categories`);

  // -- Products: chunked for D1, snapshot = shelf reality --
  // Boxed products get itemsPerBox + per-box/per-piece prices
  // (per-box carries a small demo discount via boxPrice()).
  // 20 bound columns per row × 4 rows = 80 params, safely under
  // D1's 100-variable statement limit.
  const productRows = seedProducts.map((product) => {
    const box = BOX_CONFIG[product.partNumber];
    return {
      id: crypto.randomUUID(),
      categoryId: categoryIdByKey.get(product.categoryKey)!,
      partNumber: product.partNumber,
      name: product.name,
      description: product.description,
      imageUrl: null,
      stockQuantity: product.stockQuantity,
      minStock: product.minStock,
      priceCents: product.priceCents,
      itemsPerBox: box?.perBox ?? null,
      pricePerBoxCents: box ? boxPrice(product.priceCents, box.perBox) : null,
      pricePerItemCents: box ? product.priceCents : null,
      isActive: true,
      unit: product.unit,
      weightGrams: product.weightGrams ?? null,
      barcode: null,
      supplier: product.supplier ?? null,
      notes: null,
    };
  });
  for (const batch of chunk(productRows, 4)) {
    await db.insert(products).values(batch);
  }
  console.log(`  ✔ ${productRows.length} products`);

  // -- Default behavior settings --
  await db.insert(appSettings).values([
    { key: "allow_oversell", value: "0" },
    { key: "restock_on_void", value: "1" },
  ]);
  console.log("  ✔ default settings (oversell off, restock-on-void on)");

  const lowStock = seedProducts.filter(
    (product) => product.stockQuantity <= product.minStock
  ).length;
  console.log(`  ℹ ${lowStock} products seeded at/below min stock (alerts demo ready).`);

  // Sanity count straight from D1.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(products);
  console.log(`Done — ${Number(count)} products in database.`);

  await proxy.dispose();
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
