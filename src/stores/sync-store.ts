"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { create } from "zustand";

// ============================================================
// SECTION: Sync state store
// ------------------------------------------------------------
// Mirrors the offline-outbox status for UI (header indicator):
// how many mutations are queued on this device and whether the
// browser currently has connectivity. The source of truth is the
// IndexedDB queue; this store is updated by offline-outbox.
// ============================================================

interface SyncState {
  /** Mutations waiting in the local outbox. */
  pending: number;
  /** Browser connectivity (navigator.onLine). */
  isOnline: boolean;
  setPending: (pending: number) => void;
  setOnline: (isOnline: boolean) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  pending: 0,
  isOnline: true,
  setPending: (pending) => set({ pending }),
  setOnline: (isOnline) => set({ isOnline }),
}));
