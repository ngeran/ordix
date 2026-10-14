// ============================================================
// SECTION: Imports
// ============================================================

import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { categories, customers, products, users } from "../src/db/schema";

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
    username: "admin",
    email: "admin@ordix.local",
    name: "Nikos (Admin)",
    role: "admin" as const,
    passwordHash: bcrypt.hashSync("admin123", 10),
  },
  {
    id: crypto.randomUUID(),
    username: "staff",
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
}

const seedProducts: SeedProduct[] = [
  // -- Aluminum Profiles ------------------------------------------------
  { categoryKey: "profiles", partNumber: "ALU-PRF-4040", name: "T-Slot Profile 40×40 (6m bar)", description: "Anodized aluminum profile, slot 8, natural finish. Structural grade 6060 T66." },
  { categoryKey: "profiles", partNumber: "ALU-PRF-2020", name: "T-Slot Profile 20×20 (6m bar)", description: "Light-duty slot 6 profile for jigs, guards and machine frames." },
  { categoryKey: "profiles", partNumber: "ALU-SHT-1020", name: "Aluminum Sheet 1.0mm 1000×2000", description: "Mill-finish aluminum sheet, alloy 5754 H22, for cladding and laser cutting." },
  { categoryKey: "profiles", partNumber: "ALU-ANG-3030", name: "Corner Angle Bracket 30×30", description: "Cast aluminum corner bracket for 30 series profiles, incl. hardware." },
  { categoryKey: "profiles", partNumber: "ALU-TUB-D25", name: "Round Tube Ø25×1.5mm (6m)", description: "Drawn aluminum tube 6063, polished. Railings and light structures." },

  // -- Locking Mechanisms ----------------------------------------------
  { categoryKey: "locks", partNumber: "LOCK-MP-R70", name: "Multipoint Lock R70 35mm", description: "Multipoint door lock, 35mm backset, 3 hooks + latch, DIN left. For aluminum doors." },
  { categoryKey: "locks", partNumber: "LOCK-CYL-3030", name: "Euro Profile Cylinder 30/30", description: "Brass double cylinder, 5 pins, 3 keys included, nickel finish." },
  { categoryKey: "locks", partNumber: "LOCK-DEAD-2585", name: "Deadbolt 2585 Stainless", description: "Stainless deadbolt lock 2585, 55mm backset, for exterior doors." },
  { categoryKey: "locks", partNumber: "LOCK-LAT-65", name: "Mortice Latch 65mm", description: "Tubular mortice latch 65mm backset, zinc alloy forend." },
  { categoryKey: "locks", partNumber: "LOCK-PANIC-EN", name: "Panic Bar EN1125 900mm", description: "Reversible panic exit device, EN 1125, for emergency exits." },
  { categoryKey: "locks", partNumber: "LOCK-CAM-19", name: "Cam Lock 19mm Keyed Alike", description: "Mini cam lock for panels/drawers, 19mm body, keyed alike." },

  // -- Handles & Hardware ----------------------------------------------
  { categoryKey: "hardware", partNumber: "HND-BAR-300", name: "Bar Handle 300mm F1 Anodized", description: "Aluminum bar handle 300mm c/c, F1 anodized, incl. M4 bolts." },
  { categoryKey: "hardware", partNumber: "HND-KNOB-R35", name: "Round Knob Ø35 Black", description: "Zamak furniture knob Ø35mm, matte black, M4 insert." },
  { categoryKey: "hardware", partNumber: "HND-PULL-400S", name: "Security Pull Handle 400mm", description: "Stainless pull handle 400mm for entrance doors, Ø32 tube, rosette mount." },
  { categoryKey: "hardware", partNumber: "HNG-3D-100", name: "3D Adjustable Hinge 100mm", description: "Heavy-duty 3D hinge for aluminum doors, ±3mm adjustment, 120kg pair rating." },
  { categoryKey: "hardware", partNumber: "HNG-SPR-80", name: "Spring Hinge 80mm", description: "Self-closing spring hinge 80mm, fire-door rated, satin finish." },

  // -- Seals & Fasteners -------------------------------------------------
  { categoryKey: "seals", partNumber: "GSK-EPDM-6", name: "EPDM Gasket Roll 6mm (25m)", description: "Black EPDM bubble gasket for glazing and panels, 6mm slot fit, 25m roll." },
  { categoryKey: "seals", partNumber: "BRK-TSLOT-M8", name: "T-Slot Connector M8", description: "Die-cast T-nut connector M8 for 40 series, incl. set screw." },
  { categoryKey: "seals", partNumber: "SCR-DIN912-8x25", name: "Hex Socket Screw M8×25 DIN912", description: "A2 stainless hex socket cap screw M8×25. Sold in bags of 50." },
  { categoryKey: "seals", partNumber: "SEAL-SIL-CLEAR", name: "Silicone Sealant Clear 280ml", description: "Neutral-cure structural silicone for glazing, 280ml cartridge." },

  // -- Packaging ----------------------------------------------------------
  { categoryKey: "packaging", partNumber: "PKG-BOX-M", name: "Shipping Box M 400×300×200", description: "Double-wall corrugated box, 20 pieces per bundle." },
  { categoryKey: "packaging", partNumber: "PKG-BOX-L", name: "Shipping Box L 600×400×300", description: "Double-wall corrugated box for profiles up to 580mm, 10 per bundle." },
  { categoryKey: "packaging", partNumber: "PKG-TAPE-48", name: "Packing Tape 48mm×66m", description: "Hot-melt brown packing tape 48mm, 66m roll." },

  // -- Café & Pantry (general/food-style) ---------------------------------
  { categoryKey: "pantry", partNumber: "CAF-COF-1K", name: "Espresso Beans 1kg", description: "House blend espresso beans 1kg, 70/30 arabica robusta." },
  { categoryKey: "pantry", partNumber: "CAF-WTR-6PK", name: "Water 1.5L (6-pack)", description: "Still mineral water 1.5L, shrink-wrapped 6-pack." },
  { categoryKey: "pantry", partNumber: "PAN-MIL-1L", name: "UHT Milk 1L", description: "Full-fat UHT milk 1L, shelf-stable." },
];

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
  console.log(`  ✔ ${seedUsers.length} users (admin / staff)`);

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

  // -- Products: chunked for D1 (7 columns × 10 rows = 70 params,
  // under the 100-variable statement limit) --
  const productRows = seedProducts.map((product) => ({
    id: crypto.randomUUID(),
    categoryId: categoryIdByKey.get(product.categoryKey)!,
    partNumber: product.partNumber,
    name: product.name,
    description: product.description,
    imageUrl: null,
    barcode: null,
    isActive: true,
  }));
  for (const batch of chunk(productRows, 10)) {
    await db.insert(products).values(batch);
  }
  console.log(`  ✔ ${productRows.length} products`);

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
