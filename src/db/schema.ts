// ============================================================
// SECTION: Imports
// ============================================================

import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ============================================================
// SECTION: Domain constants (statuses, roles)
// ------------------------------------------------------------
// SQLite has no native ENUMs, so every enum-like column is a
// `text` column typed via `$type<...>()`. The TS unions below
// are the single source of truth for both schema and UI.
// ============================================================

/**
 * Order lifecycle.
 * Build-to-order main flow: placed → in_production →
 * production_complete → completed (cashier closes after payment).
 * The pre-Phase-2 stages (preparing…dispatched) remain in the
 * enum so legacy rows keep rendering; new orders never use them.
 * `on_hold` / `cancelled` branch off.
 */
export const ORDER_STATUSES = [
  "placed",
  "in_production",
  "production_complete",
  "preparing",
  "prepared",
  "boxed",
  "ready",
  "dispatched",
  "completed",
  "on_hold",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Per-line production tracking (the production manager clicks these). */
export const PRODUCTION_STATUSES = ["pending", "in_production", "completed"] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

/** Line-item states — items are voided individually with an audit trail. */
export const ORDER_ITEM_STATUSES = ["active", "voided"] as const;
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];

/** Payment methods offered to the cashier at close. */
export const PAYMENT_METHODS = ["cash", "card", "transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** User roles — `admin` manages catalog/import, `staff` orders. */
export const USER_ROLES = ["admin", "staff"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ============================================================
// SECTION: Users (credentials auth, role-based access)
// ============================================================

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: USER_ROLES }).notNull().default("staff"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// SECTION: Customers (every build-to-order order belongs to one)
// ============================================================

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    comments: text("comments"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index("customers_name_idx").on(t.name)]
);

// ============================================================
// SECTION: Catalog — categories & products
// ------------------------------------------------------------
// Products are pure identifiers (build-to-order): κωδικός, name,
// category, optional barcode/description. NO stock, NO prices —
// the price is quoted per order line (see order_items).
// ============================================================

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    /** Primary display name (English / Latin script). */
    name: text("name").notNull(),
    /** Optional Greek name — UI shows it when the Greek locale is active. */
    nameEl: text("name_el"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (t) => [uniqueIndex("categories_name_unique").on(t.name)]
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    /** Unique, searchable manufacturer/reference part number. */
    partNumber: text("part_number").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Product photo (URL or data URL) shown in the POS grid. */
    imageUrl: text("image_url"),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    /** Optional barcode — scanned or typed to find the product. */
    barcode: text("barcode"),
    /** Pieces per sealed box (κουτιά ↔ τεμάχια for the calculator). */
    itemsPerBox: integer("items_per_box"),
    /** Physical storage spot shown on cards ("Rack C-04", "Bin B-12"). */
    binLocation: text("bin_location"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("products_part_number_unique").on(t.partNumber),
    index("products_category_id_idx").on(t.categoryId),
  ]
);

// ============================================================
// SECTION: Orders & line items
// ------------------------------------------------------------
// Patterns inherited from Manolis-POS + Phase 2:
//  - Daily sequential numbers via the `order_counters` table,
//    unique per business date (atomic upsert allocation).
//  - Lines carry κουτιά (boxes) and τεμάχια (loose items), and a
//    MANUAL line price in cents — products are unpriced, the
//    order-taker (who is also the cashier) quotes each line.
//  - Per-line production states with who/when audit.
//  - Full who/when/reason audit for voids and cancellation.
// ============================================================

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    /** Business day (YYYY-MM-DD in APP_TIMEZONE) the number resets on. */
    businessDate: text("business_date").notNull(),
    /** Sequential within businessDate — combined into `orderNumber`. */
    dailyNumber: integer("daily_number").notNull(),
    /** Denormalized display/search number, e.g. "ORD-20261011-003". */
    orderNumber: text("order_number").notNull(),
    status: text("status", { enum: ORDER_STATUSES }).notNull().default("placed"),
    /** The customer this build-to-order belongs to. */
    customerId: text("customer_id").references(() => customers.id),
    /** Legacy free-text customer (pre-Phase-2 orders keep rendering). */
    customerName: text("customer_name"),
    notes: text("notes"),
    /** Server-recomputed total of active lines, cents. */
    totalCents: integer("total_cents").notNull().default(0),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),

    // -- Lifecycle timestamps (stamped by the status endpoint) --
    placedAt: integer("placed_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    preparingAt: integer("preparing_at", { mode: "timestamp" }),
    preparedAt: integer("prepared_at", { mode: "timestamp" }),
    boxedAt: integer("boxed_at", { mode: "timestamp" }),
    readyAt: integer("ready_at", { mode: "timestamp" }),
    dispatchedAt: integer("dispatched_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    cancelledAt: integer("cancelled_at", { mode: "timestamp" }),

    // -- Cancellation audit --
    cancelledById: text("cancelled_by_id").references(() => users.id),
    cancelReason: text("cancel_reason"),

    // -- Courier hand-off (legacy flow) --
    courierName: text("courier_name"),
    trackingNumber: text("tracking_number"),

    // -- Cashier close --
    /** Stamped when the cashier closes the order after payment. */
    paidAt: integer("paid_at", { mode: "timestamp" }),
    paymentMethod: text("payment_method", { enum: PAYMENT_METHODS }),
    paymentNote: text("payment_note"),
    closedById: text("closed_by_id").references(() => users.id),

    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("orders_business_date_daily_number_unique").on(
      t.businessDate,
      t.dailyNumber
    ),
    uniqueIndex("orders_order_number_unique").on(t.orderNumber),
    index("orders_status_placed_at_idx").on(t.status, t.placedAt),
    index("orders_business_date_idx").on(t.businessDate),
  ]
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    /** Legacy piece count (pre-Phase-2 rows). */
    quantity: integer("quantity").notNull().default(0),
    /** Boxes (κουτιά) and loose pieces (τεμάχια) — entered manually. */
    quantityBoxes: integer("quantity_boxes").notNull().default(0),
    quantityItems: integer("quantity_items").notNull().default(0),
    /** Snapshot prices at order time (legacy rows). */
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    unitPriceBoxCents: integer("unit_price_box_cents"),
    unitPriceItemCents: integer("unit_price_item_cents"),
    /** The quoted price for the whole line, in cents — the single
     *  source of truth for totals (products are unpriced). */
    lineTotalCents: integer("line_total_cents").notNull().default(0),
    name: text("name").notNull(),
    partNumber: text("part_number").notNull(),
    note: text("note"),
    /** 1 for the initial submission, 2+ for appended rounds. */
    round: integer("round").notNull().default(1),
    status: text("status", { enum: ORDER_ITEM_STATUSES })
      .notNull()
      .default("active"),

    // -- Production tracking: the production manager's two taps --
    productionStatus: text("production_status", { enum: PRODUCTION_STATUSES })
      .notNull()
      .default("pending"),
    sentToProductionAt: integer("sent_to_production_at", { mode: "timestamp" }),
    sentToProductionById: text("sent_to_production_by_id").references(() => users.id),
    productionCompletedAt: integer("production_completed_at", { mode: "timestamp" }),
    productionCompletedById: text("production_completed_by_id").references(() => users.id),

    // -- Void audit (reason + who + when) --
    voidReason: text("void_reason"),
    voidNote: text("void_note"),
    voidedById: text("voided_by_id").references(() => users.id),
    voidedAt: integer("voided_at", { mode: "timestamp" }),

    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("order_items_order_id_idx").on(t.orderId),
    index("order_items_product_id_idx").on(t.productId),
  ]
);

// ============================================================
// SECTION: Timeline events (order audit trail)
// ============================================================

export const orderEvents = sqliteTable(
  "order_events",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: text("from_status", { enum: ORDER_STATUSES }),
    toStatus: text("to_status", { enum: ORDER_STATUSES }).notNull(),
    userId: text("user_id").references(() => users.id),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("order_events_order_id_idx").on(t.orderId)]
);

// ============================================================
// SECTION: Daily order-number counter
// ============================================================

export const orderCounters = sqliteTable("order_counters", {
  businessDate: text("business_date").primaryKey(),
  lastNumber: integer("last_number").notNull(),
});

// ============================================================
// SECTION: Inferred types (used across API + UI)
// ============================================================

export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;
