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
// Build-to-order:
//  - every ticket belongs to a CUSTOMER (selected first, or the
//    submit is blocked with a friendly nudge)
//  - lines carry κουτιά (boxes) and τεμάχια (loose items) plus a
//    MANUALLY QUOTED price — products are unpriced identifiers,
//    and the order taker is also the cashier
// ============================================================

export interface CartCustomer {
  id: string;
  name: string;
}

export interface CartLine {
  productId: string;
  partNumber: string;
  name: string;
  imageUrl?: string | null;
  quantityBoxes: number;
  quantityItems: number;
  /** Manually quoted price for the whole line, in integer cents. */
  linePriceCents: number;
  note?: string;
}

interface CartState {
  customer: CartCustomer | null;
  items: CartLine[];
  notes: string | null;
  /** When set, submitting appends a round to that live order. */
  appendOrderId: string | null;
  appendOrderLabel: string | null;

  // -- actions --
  setCustomer: (customer: CartCustomer | null) => void;
  addProduct: (line: Omit<CartLine, "quantityBoxes" | "quantityItems" | "note" | "linePriceCents">) => void;
  setBoxes: (productId: string, boxes: number) => void;
  setItems: (productId: string, items: number) => void;
  setLinePrice: (productId: string, cents: number) => void;
  setNote: (productId: string, note: string) => void;
  removeLine: (productId: string) => void;
  setNotes: (notes: string | null) => void;
  clearCart: () => void;
  startAppend: (orderId: string, label: string) => void;
  stopAppend: () => void;

  // -- derived selectors --
  totalUnits: () => number;
  totalCents: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      customer: null,
      items: [],
      notes: null,
      appendOrderId: null,
      appendOrderLabel: null,

      setCustomer: (customer) => set({ customer }),

      addProduct: (line) =>
        set((state) => {
          // Merge into an existing line: a repeat tap adds one box.
          const existing = state.items.find(
            (item) => item.productId === line.productId
          );
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.productId === line.productId
                  ? { ...item, quantityBoxes: item.quantityBoxes + 1 }
                  : item
              ),
            };
          }
          return {
            items: [
              ...state.items,
              { ...line, quantityBoxes: 1, quantityItems: 0, linePriceCents: 0 },
            ],
          };
        }),

      setBoxes: (productId, boxes) =>
        set((state) => ({
          items: state.items
            .map((item) =>
              item.productId === productId
                ? { ...item, quantityBoxes: Math.max(0, boxes) }
                : item
            )
            .filter((item) => item.quantityBoxes > 0 || item.quantityItems > 0),
        })),

      setItems: (productId, items) =>
        set((state) => ({
          items: state.items
            .map((item) =>
              item.productId === productId
                ? { ...item, quantityItems: Math.max(0, items) }
                : item
            )
            .filter((item) => item.quantityBoxes > 0 || item.quantityItems > 0),
        })),

      setLinePrice: (productId, cents) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.productId === productId
              ? { ...item, linePriceCents: Math.max(0, cents) }
              : item
          ),
        })),

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

      setNotes: (notes) => set({ notes }),

      clearCart: () =>
        set({
          customer: null,
          items: [],
          notes: null,
          appendOrderId: null,
          appendOrderLabel: null,
        }),

      startAppend: (appendOrderId, appendOrderLabel) =>
        set({ appendOrderId, appendOrderLabel }),
      stopAppend: () => set({ appendOrderId: null, appendOrderLabel: null }),

      totalUnits: () =>
        get().items.reduce(
          (sum, item) => sum + item.quantityBoxes + item.quantityItems,
          0
        ),

      totalCents: () =>
        get().items.reduce((sum, item) => sum + item.linePriceCents, 0),
    }),
    {
      name: "ordix-cart",
      version: 3,
      // v2 → v3: priced-product lines lose their computed price
      // (products are unpriced now) — the quoted price resets to 0
      // and is typed per line by the order taker.
      migrate: (persisted) => {
        const state = persisted as Partial<CartState>;
        const legacyItems = (state.items ?? []) as unknown as Array<
          Record<string, unknown>
        >;
        return {
          ...state,
          customer: state.customer ?? null,
          notes: state.notes ?? null,
          items: legacyItems.map((item) => ({
            ...item,
            quantityBoxes: Number(item.quantityBoxes ?? 0),
            quantityItems: Number(item.quantityItems ?? 0),
            linePriceCents: 0,
          })),
          appendOrderId: null,
          appendOrderLabel: null,
        } as CartState;
      },
      // Rehydrated manually in the app shell effect so the SSR markup
      // (which always renders an empty ticket) matches the first
      // client render.
      skipHydration: true,
    }
  )
);
