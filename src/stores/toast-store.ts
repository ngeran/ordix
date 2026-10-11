"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { create } from "zustand";

// ============================================================
// SECTION: Toast notifications store
// ------------------------------------------------------------
// Minimal global toast queue: components call `toast.success(…)`
// helpers and the single <ToastViewport /> in the app shell
// renders + auto-dismisses them. No dependency needed.
// ============================================================

export type ToastKind = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: string;
  kind: ToastKind;
  text: string;
  /** Auto-dismiss delay (ms). Errors stay a little longer. */
  ttl: number;
}

interface ToastState {
  toasts: ToastMessage[];
  push: (kind: ToastKind, text: string) => void;
  dismiss: (id: string) => void;
}

const DEFAULT_TTL_MS = 4000;
const ERROR_TTL_MS = 7000;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  push: (kind, text) => {
    const id = crypto.randomUUID();
    const ttl = kind === "error" ? ERROR_TTL_MS : DEFAULT_TTL_MS;
    set((state) => ({ toasts: [...state.toasts, { id, kind, text, ttl }] }));
    // Auto-dismiss; tap-to-dismiss handled by the viewport.
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((toast) => toast.id !== id),
      }));
    }, ttl);
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

// ============================================================
// SECTION: Imperative helpers (call from anywhere, even outside
// React event handlers)
// ============================================================

export const toast = {
  success: (text: string) => useToastStore.getState().push("success", text),
  error: (text: string) => useToastStore.getState().push("error", text),
  info: (text: string) => useToastStore.getState().push("info", text),
  warning: (text: string) => useToastStore.getState().push("warning", text),
};
