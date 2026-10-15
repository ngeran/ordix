// ============================================================
// SECTION: Imports
// ============================================================

import { z } from "zod";
import { ORDER_STATUSES } from "@/db/schema";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
import { customValuesSchema } from "@/lib/custom-fields";

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
  extra: customValuesSchema,
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
  extra: customValuesSchema,
});

export const customerUpdateSchema = customerCreateSchema.partial();

// ============================================================
// SECTION: Users (admin → Users)
// ------------------------------------------------------------
// Usernames are what staff type on a tablet: lowercase letters,
// digits and . _ - only (no spaces, no accents to mistype).
// ============================================================

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{2,32}$/, "Username: 2–32 characters, letters a–z, digits, . _ -");
const password = z.string().min(6, "Password must be at least 6 characters").max(200);

export const userCreateSchema = z.object({
  username,
  name: shortText,
  password,
  role: z.enum(ASSIGNABLE_ROLES).default("staff"),
  isActive: z.boolean().default(true),
});

export const systemResetSchema = z.object({
  scope: z.enum(["orders", "all"]),
  password: z.string().min(1).max(200),
});

export const userUpdateSchema = z.object({
  username: username.optional(),
  name: shortText.optional(),
  /** Set only when the admin resets the password. */
  password: password.optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  isActive: z.boolean().optional(),
});

/** App settings document — see src/lib/settings.ts. */
export { settingsSchema } from "@/lib/settings";

// ============================================================
// SECTION: Catalog — products (pure identifiers, no stock/prices)
// ------------------------------------------------------------
// Everything is built to order: the product says WHAT it is, the
// order line says HOW MANY and for HOW MUCH (quoted per line).
// ============================================================

export const productCreateSchema = z.object({
  partNumber: z.string().trim().min(1).max(100),
  name: shortText,
  description: optionalText,
  imageUrl: optionalText,
  barcode: optionalText,
  /** Pieces per sealed box (drives the order calculator). */
  itemsPerBox: z.coerce.number().int().min(0).max(100_000).optional().nullable(),
  categoryId: uuid,
  isActive: z.boolean().default(true),
  extra: customValuesSchema,
});

export const productUpdateSchema = productCreateSchema.partial();

// ============================================================
// SECTION: Orders (build-to-order v2)
// ============================================================

/**
 * One cart line: boxes (κουτιά), loose items (τεμάχια) or both —
 * at least one must be greater than zero. The price is quoted per
 * line (optional — the cashier settles the final amount).
 */
export const orderItemInputSchema = z
  .object({
    productId: uuid,
    quantityBoxes: z.coerce.number().int().min(0).max(10_000).default(0),
    quantityItems: z.coerce.number().int().min(0).max(100_000).default(0),
    /** Quoted price for the whole line, in integer cents. */
    linePriceCents: z.coerce.number().int().min(0).max(100_000_000).default(0),
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
  /** Production manager: pending → in_production. */
  z.object({ action: z.literal("send_to_production") }),
  /** Production manager: in_production → completed. */
  z.object({ action: z.literal("complete_production") }),
  /** Production manager: undo a mis-tap (completed → in_production → pending). */
  z.object({ action: z.literal("undo_production") }),
]);

/** Body of PATCH /api/orders/[id]/items/[itemId] — edit quantities. */
export const itemEditSchema = z
  .object({
    quantityBoxes: z.coerce.number().int().min(0).max(10_000),
    quantityItems: z.coerce.number().int().min(0).max(100_000),
  })
  .refine(
    (line) => line.quantityBoxes > 0 || line.quantityItems > 0,
    "Each line needs boxes or items"
  );

/**
 * Body of POST /api/orders/[id]/close — the cashier's action.
 * Allowed only when the order is production_complete and every
 * active line is produced (admin may force in exceptional cases).
 */
export const closeOrderSchema = z.object({
  /** Admin-only bypass for the all-items-completed rule. */
  force: z.boolean().default(false),
});

/** Body of POST /api/orders/[id]/status. */
export const statusUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: optionalText,
});

/** Query params for GET /api/orders — board/dashboard filters. */
export const orderListQuerySchema = z.object({
  scope: z.enum(["active", "history", "all"]).default("all"),
  status: z.enum(ORDER_STATUSES).optional(),
  /** Business day (YYYY-MM-DD), takes precedence over from/to. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Inclusive placed-from date (YYYY-MM-DD). */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Inclusive placed-to date (YYYY-MM-DD). */
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Free-text search: order number / customer name. */
  q: z.string().trim().max(100).optional(),
  /** Attach active items for screens that render them. */
  include: z.literal("items").optional(),
});

/** Parse a Request's searchParams against a schema (typed output). */
export function parseSearchParams<Schema extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: Schema
): z.output<Schema> {
  const raw: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (value !== "") raw[key] = value;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => issue.message)
    );
  }
  return result.data;
}


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
