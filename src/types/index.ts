// ============================================================
// SECTION: Imports (type-only — safe inside client components)
// ============================================================

import type {
  Order,
  OrderEvent,
  OrderItem,
  Product,
} from "@/db/schema";

// ============================================================
// SECTION: Shared DTOs crossing the API → UI boundary
// ------------------------------------------------------------
// These extend the raw Drizzle row types with joined/computed
// fields the screens need. API routes produce them; client
// components consume them.
// ============================================================

/** Product joined with its category name + computed low-stock flag. */
export type ProductWithCategory = Product & {
  categoryName: string | null;
  isLowStock: boolean;
};

/** Order list row: order plus aggregates shown on the board. */
export type OrderSummary = Order & {
  itemCount: number;
  /** Total quantity of units across active items. */
  totalUnits: number;
  createdByName: string | null;
};

/** Full order detail: items + status timeline with actor names. */
export type OrderDetail = Order & {
  items: OrderItem[];
  events: (Omit<OrderEvent, "userId"> & { userName: string | null })[];
  createdByName: string | null;
};

/** Client-side mirror of the server settings snapshot. */
export interface OrdixSettingsDTO {
  allowOversell: boolean;
  restockOnVoid: boolean;
}

/** Shape of the NextAuth session user used across the app. */
export interface OrdixSessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role: "admin" | "staff";
}

/** Standard error envelope returned by every API route. */
export interface ApiError {
  error: string;
}
