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
// Phase 2 (build-to-order):
//  - every ticket belongs to a CUSTOMER (selected first, or the
//    submit is blocked with a friendly nudge)
//  - lines carry κουτιά (boxes) and τεμάχια (loose items) — one
//    or both; `piecesPerBox` snapshots the product relation so
//    unit counts render without refetching the catalog
// ============================================================

export interface CartCustomer {
  id: string;
  name: string;
}

export interface CartLine {
  productId: string;
  partNumber: string;
  name: string;
  /** Pricing relation snapshot from the product. */
  piecesPerBox: number;
  hasBoxPrice: boolean;
  /** Price snapshot hints for the ticket rows (cents). */
  unitPriceBoxCents: number;
  unitPriceItemCents: number;
  imageUrl?: string | null;
  quantityBoxes: number;
  quantityItems: number;
  note?: string;
  /** Stock level when the line was added — oversell guard. */
  availableStock: number;
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
  addProduct: (
    line: Omit<
      CartLine,
      "quantityBoxes" | "quantityItems" | "note"
    >
  ) => void;
  setBoxes: (productId: string, boxes: number) => void;
  setItems: (productId: string, items: number) => void;
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
          // Merge into an existing line for the same product: a tap
          // adds one BOX when the product is boxed, else one piece.
          const existing = state.items.find(
            (item) => item.productId === line.productId
          );
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.productId === line.productId
                  ? {
                      ...item,
                      quantityBoxes:
                        item.quantityBoxes + (line.piecesPerBox > 1 ? 1 : 0),
                      quantityItems:
                        item.quantityItems + (line.piecesPerBox > 1 ? 0 : 1),
                      availableStock: line.availableStock,
                    }
                  : item
              ),
            };
          }
          return {
            items: [
              ...state.items,
              {
                ...line,
                quantityBoxes: line.piecesPerBox > 1 ? 1 : 0,
                quantityItems: line.piecesPerBox > 1 ? 0 : 1,
              },
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
            .filter(
              (item) => item.quantityBoxes > 0 || item.quantityItems > 0
            ),
        })),

      setItems: (productId, items) =>
        set((state) => ({
          items: state.items
            .map((item) =>
              item.productId === productId
                ? { ...item, quantityItems: Math.max(0, items) }
                : item
            )
            .filter(
              (item) => item.quantityBoxes > 0 || item.quantityItems > 0
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
          (sum, item) =>
            sum +
            item.quantityBoxes * Math.max(1, item.piecesPerBox) +
            item.quantityItems,
          0
        ),

      totalCents: () =>
        get().items.reduce(
          (sum, item) =>
            sum +
            item.quantityBoxes * item.unitPriceBoxCents +
            item.quantityItems * item.unitPriceItemCents,
          0
        ),
    }),
    {
      name: "ordix-cart",
      version: 2,
      // v1 → v2: old single-quantity lines migrate to loose items.
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
            quantityBoxes: 0,
            quantityItems: Number(item.quantity ?? 0),
            piecesPerBox: Number(item.piecesPerBox ?? 1),
            hasBoxPrice: Boolean(item.hasBoxPrice),
            unitPriceBoxCents: Number(item.unitPriceBoxCents ?? 0),
            unitPriceItemCents: Number(
              item.unitPriceItemCents ?? item.unitPriceCents ?? 0
            ),
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
