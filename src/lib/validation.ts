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
// SECTION: Orders
// ============================================================

/** One cart line sent to the server. Quantity is positive int. */
export const orderItemInputSchema = z.object({
  productId: uuid,
  quantity: z.coerce.number().int().min(1).max(10_000),
  note: optionalText,
});

/** Body of POST /api/orders — placing a new order from the cart. */
export const placeOrderSchema = z.object({
  customerName: optionalText,
  notes: optionalText,
  items: z.array(orderItemInputSchema).min(1, "Order needs at least one item"),
});

/** Body of POST /api/orders/[id]/items — appending a round. */
export const appendItemsSchema = z.object({
  items: z.array(orderItemInputSchema).min(1, "Round needs at least one item"),
});

/** Body of POST /api/orders/[id]/items/[itemId] — void or toggle check. */
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
]);

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
  })
  .refine(
    (data) => data.allowOversell !== undefined || data.restockOnVoid !== undefined,
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
