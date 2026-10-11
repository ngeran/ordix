"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ============================================================
// SECTION: Draft-order store (the "ticket")
// ------------------------------------------------------------
// The cart is pure client state (Zustand + localStorage) until
// the order is placed — nothing touches D1 until confirmation.
//
// Improvements over a plain cart:
//  - `availableStock` snapshot per line drives the oversell guard
//    and the low-stock warning in the ticket.
//  - `appendOrderId` switches the ticket into "append round"
//    mode: submitting adds a new round to a live order instead
//    of creating a new one (Manolis-POS "rounds" pattern).
//  - persisted with skipHydration so SSR markup (empty ticket)
//    always matches the first client render; rehydrated manually
//    in the app shell effect.
// ============================================================

export interface CartLine {
  productId: string;
  partNumber: string;
  name: string;
  unitPriceCents: number;
  /** Packing unit, e.g. "pcs", "m", "set". */
  unit: string;
  imageUrl?: string | null;
  quantity: number;
  note?: string;
  /** Stock level when the line was added — for oversell guarding. */
  availableStock: number;
}

interface CartState {
  items: CartLine[];
  customerName: string | null;
  notes: string | null;
  /** When set, submitting appends a round to that live order. */
  appendOrderId: string | null;
  appendOrderLabel: string | null;

  // -- actions --
  addProduct: (line: Omit<CartLine, "quantity" | "note">) => void;
  setQuantity: (productId: string, quantity: number) => void;
  setNote: (productId: string, note: string) => void;
  removeLine: (productId: string) => void;
  setCustomerName: (name: string | null) => void;
  setNotes: (notes: string | null) => void;
  clearCart: () => void;
  startAppend: (orderId: string, label: string) => void;
  stopAppend: () => void;

  // -- derived selectors --
  lineCount: () => number;
  totalUnits: () => number;
  totalCents: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      customerName: null,
      notes: null,
      appendOrderId: null,
      appendOrderLabel: null,

      addProduct: (line) =>
        set((state) => {
          // Merge into an existing line for the same product.
          const existing = state.items.find(
            (item) => item.productId === line.productId
          );
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.productId === line.productId
                  ? {
                      ...item,
                      quantity: item.quantity + 1,
                      // Refresh the stock snapshot on every add.
                      availableStock: line.availableStock,
                    }
                  : item
              ),
            };
          }
          return { items: [...state.items, { ...line, quantity: 1 }] };
        }),

      setQuantity: (productId, quantity) =>
        set((state) => {
          // Dropping to zero removes the line — fewer stray taps.
          if (quantity <= 0) {
            return {
              items: state.items.filter((item) => item.productId !== productId),
            };
          }
          return {
            items: state.items.map((item) =>
              item.productId === productId ? { ...item, quantity } : item
            ),
          };
        }),

      setNote: (productId, note) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.productId === productId
              ? { ...item, note: note === "" ? undefined : note }
              : item
          ),
        })),

      removeLine: (productId) =>
        set((state) => ({
          items: state.items.filter((item) => item.productId !== productId),
        })),

      setCustomerName: (customerName) => set({ customerName }),
      setNotes: (notes) => set({ notes }),

      clearCart: () =>
        set({
          items: [],
          customerName: null,
          notes: null,
          appendOrderId: null,
          appendOrderLabel: null,
        }),

      startAppend: (appendOrderId, appendOrderLabel) =>
        set({ appendOrderId, appendOrderLabel }),
      stopAppend: () => set({ appendOrderId: null, appendOrderLabel: null }),

      lineCount: () => get().items.length,

      totalUnits: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),

      totalCents: () =>
        get().items.reduce(
          (sum, item) => sum + item.unitPriceCents * item.quantity,
          0
        ),
    }),
    {
      name: "ordix-cart",
      version: 1,
      skipHydration: true,
    }
  )
);
