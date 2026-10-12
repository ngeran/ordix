// ============================================================
// SECTION: Imports
// ============================================================

import { z } from "zod";
import { ORDER_STATUSES } from "@/db/schema";

// ============================================================
// SECTION: Shared field schemas
// ------------------------------------------------------------
// One Zod schema per API payload — the server never trusts the
// client. Field limits mirror the DB columns (SQLite TEXT is
// unbounded, so limits here protect against junk payloads).
// ============================================================

/** Non-empty, trimmed text (single source for min/max limits). */
const shortText = z.string().trim().min(1).max(200);
const longText = z.string().trim().max(2000);

/** Optional text that normalizes "" → undefined (DB NULL). */
const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const uuid = z.string().uuid();

// ============================================================
// SECTION: Catalog — categories
// ============================================================

export const categoryCreateSchema = z.object({
  name: shortText,
  nameEl: optionalText,
  description: optionalText,
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

/** Body of POST /api/categories/reorder — array of ids in new order. */
export const categoryReorderSchema = z.object({
  categoryIds: z.array(uuid).min(1),
});

// ============================================================
// SECTION: Customers (Phase 2)
// ============================================================

export const customerCreateSchema = z.object({
  name: shortText,
  address: optionalText,
  phone: optionalText,
  email: z
    .union([z.email(), z.literal("")])
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  comments: optionalText,
  isActive: z.boolean().default(true),
});

export const customerUpdateSchema = customerCreateSchema.partial();

// ============================================================
// SECTION: Catalog — products
// ============================================================

export const productCreateSchema = z.object({
  partNumber: z.string().trim().min(1).max(100),
  name: shortText,
  description: optionalText,
  imageUrl: optionalText,
  stockQuantity: z.coerce.number().int().min(0).max(1_000_000).default(0),
  minStock: z.coerce.number().int().min(0).max(1_000_000).default(0),
  /** Integer cents — Zod rejects anything non-integer here. */
  priceCents: z.coerce.number().int().min(0).max(100_000_000),
  /** Pieces per box + per-box/per-piece prices (build-to-order). */
  itemsPerBox: z.coerce.number().int().min(0).max(100_000).optional().nullable(),
  pricePerBoxCents: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
  pricePerItemCents: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
  categoryId: uuid,
  isActive: z.boolean().default(true),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  weightGrams: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  barcode: optionalText,
  supplier: optionalText,
  notes: optionalText,
});

export const productUpdateSchema = productCreateSchema.partial();

// ============================================================
// SECTION: Orders (build-to-order v2)
// ============================================================

/**
 * One cart line: boxes (κουτιά), loose items (τεμάχια) or both —
 * at least one must be greater than zero.
 */
export const orderItemInputSchema = z
  .object({
    productId: uuid,
    quantityBoxes: z.coerce.number().int().min(0).max(10_000).default(0),
    quantityItems: z.coerce.number().int().min(0).max(100_000).default(0),
    note: optionalText,
  })
  .refine(
    (line) => line.quantityBoxes > 0 || line.quantityItems > 0,
    "Each line needs boxes or items"
  );

/** Body of POST /api/orders — placing a new order from the cart. */
export const placeOrderSchema = z.object({
  /** Build-to-order: every order belongs to a customer. */
  customerId: uuid,
  notes: optionalText,
  items: z.array(orderItemInputSchema).min(1, "Order needs at least one item"),
});

/** Body of POST /api/orders/[id]/items — appending a round. */
export const appendItemsSchema = z.object({
  items: z.array(orderItemInputSchema).min(1, "Round needs at least one item"),
});

/** Body of POST /api/orders/[id]/items/[itemId] — production & edits. */
export const itemActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("void"),
    reason: z.string().trim().min(3, "Reason is required").max(500),
    note: optionalText,
  }),
  z.object({
    action: z.literal("check"),
    isChecked: z.boolean(),
  }),
  /** Production manager: pending → in_production. */
  z.object({ action: z.literal("send_to_production") }),
  /** Production manager: in_production → completed. */
  z.object({ action: z.literal("complete_production") }),
]);

/**
 * Body of POST /api/orders/[id]/close — the cashier's action.
 * Allowed only when the order is production_complete and every
 * active line is produced (admin may force in exceptional cases).
 */
export const closeOrderSchema = z.object({
  paymentMethod: z.enum(["cash", "card", "transfer"]).optional(),
  paymentNote: optionalText,
  /** Admin-only bypass for the all-items-completed rule. */
  force: z.boolean().default(false),
});

/** Body of POST /api/orders/[id]/status. */
export const statusUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: optionalText,
});

/** Body of POST /api/orders/[id]/tracking — courier hand-off. */
export const trackingSchema = z
  .object({
    courierName: optionalText,
    trackingNumber: optionalText,
  })
  .refine(
    (data) => data.courierName || data.trackingNumber,
    "Courier name or tracking number is required"
  );

/** Query param for GET /api/orders — narrows the board/history split. */
export const orderScopeSchema = z.enum(["active", "history", "all"]).default("all");

// ============================================================
// SECTION: Stock & settings
// ============================================================

/**
 * Body of POST /api/stock/adjust — either a signed delta or an
 * absolute new quantity (converted to a delta server-side), with
 * a mandatory reason so the audit trail always explains itself.
 */
export const stockAdjustSchema = z
  .object({
    productId: uuid,
    delta: z.coerce.number().int().optional(),
    newQuantity: z.coerce.number().int().min(0).optional(),
    reason: z.string().trim().min(3, "Reason is required").max(500),
  })
  .refine(
    (data) =>
      (data.delta !== undefined) !== (data.newQuantity !== undefined),
    "Provide exactly one of: delta or newQuantity"
  );

/** Body of PATCH /api/settings. */
export const settingsUpdateSchema = z
  .object({
    allowOversell: z.boolean().optional(),
    restockOnVoid: z.boolean().optional(),
    buildToOrder: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.allowOversell !== undefined ||
      data.restockOnVoid !== undefined ||
      data.buildToOrder !== undefined,
    "At least one setting is required"
  );

// ============================================================
// SECTION: Client-side forms
// ============================================================

/** Login form validation (mirrors the credentials provider). */
export const loginFormSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

// ============================================================
// SECTION: Parse helper
// ============================================================

/**
 * Parse a Request body against a schema.
 * Throws a tagged error the route's catch block converts into a
 * 400 response with the first human-readable issue.
 */
export class ValidationError extends Error {
  constructor(
    public issues: string[]
  ) {
    super(issues[0] ?? "Invalid input");
    this.name = "ValidationError";
  }
}

export async function parseJsonBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema
): Promise<z.output<Schema>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError(["Body must be valid JSON"]);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => issue.message)
    );
  }
  return result.data;
}
