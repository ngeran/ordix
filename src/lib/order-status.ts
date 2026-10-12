// ============================================================
// SECTION: Imports
// ============================================================

import type { OrderStatus } from "@/db/schema";

// ============================================================
// SECTION: Order lifecycle definition
// ------------------------------------------------------------
// The main flow is strictly linear — one step at a time — so a
// packed box can never be marked "preparing" by a stray tap.
// `on_hold` and `cancelled` branch off any active stage.
// ============================================================

/** The build-to-order happy path (Phase 2). */
export const ORDER_MAIN_FLOW: readonly OrderStatus[] = [
  "placed",
  "in_production",
  "production_complete",
  "completed",
] as const;

/** Stages that appear on the live "active orders" board. */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  "placed",
  "in_production",
  "production_complete",
  "on_hold",
] as const;

/** Pre-Phase-2 stages — kept only so legacy rows render correctly. */
const LEGACY_STATUSES: readonly OrderStatus[] = [
  "preparing",
  "prepared",
  "boxed",
  "ready",
  "dispatched",
] as const;

export function isLegacyStatus(status: OrderStatus): boolean {
  return LEGACY_STATUSES.includes(status);
}

const TERMINAL_STATUSES: readonly OrderStatus[] = ["completed", "cancelled"];

/** Stages an order can legally move to from each current stage. */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // -- Build-to-order chain --
  placed: ["in_production", "on_hold", "cancelled"],
  in_production: ["production_complete", "on_hold", "cancelled"],
  production_complete: ["completed", "in_production", "cancelled"],
  // Held orders resume to any not-yet-reached stage, or cancel.
  on_hold: ["placed", "in_production", "production_complete", "cancelled"],
  // -- Legacy chains (old rows only — new orders never land here) --
  preparing: ["prepared", "on_hold", "cancelled"],
  prepared: ["boxed", "on_hold", "cancelled"],
  boxed: ["ready", "on_hold", "cancelled"],
  ready: ["dispatched", "cancelled"],
  dispatched: ["completed"],
  completed: [],
  cancelled: [],
};

// ============================================================
// SECTION: Pure helpers (used by API validation AND the UI)
// ============================================================

/** True when moving `from` → `to` is a legal transition. */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** All legal target stages for `status`. */
export function allowedTransitions(status: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[status];
}

/** True when no further transitions are possible. */
export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Index of a main-flow stage, or -1 for on_hold/cancelled. */
export function mainFlowIndex(status: OrderStatus): number {
  return ORDER_MAIN_FLOW.indexOf(status);
}

// ============================================================
// SECTION: Display metadata — labels (bilingual) & colors
// ============================================================

interface StatusMeta {
  en: string;
  el: string;
  /** Tailwind classes for the status badge (light + dark safe). */
  badgeClass: string;
  /** Tailwind classes for the dot/progress accent. */
  accentClass: string;
}

export const STATUS_META: Record<OrderStatus, StatusMeta> = {
  placed: {
    en: "Placed",
    el: "Υποβλήθηκε",
    badgeClass: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    accentClass: "bg-sky-500",
  },
  in_production: {
    en: "In production",
    el: "Σε παραγωγή",
    badgeClass:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    accentClass: "bg-amber-500",
  },
  production_complete: {
    en: "Production complete",
    el: "Παραγωγή ολοκληρώθηκε",
    badgeClass:
      "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    accentClass: "bg-violet-500",
  },
  completed: {
    en: "Completed",
    el: "Ολοκληρώθηκε",
    badgeClass:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    accentClass: "bg-emerald-500",
  },
  on_hold: {
    en: "On hold",
    el: "Σε αναμονή",
    badgeClass:
      "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    accentClass: "bg-orange-500",
  },
  cancelled: {
    en: "Cancelled",
    el: "Ακυρώθηκε",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    accentClass: "bg-red-500",
  },
  preparing: {
    en: "Preparing (legacy)",
    el: "Προετοιμασία",
    badgeClass:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
    accentClass: "bg-indigo-500",
  },
  prepared: {
    en: "Prepared (legacy)",
    el: "Έτοιμη",
    badgeClass:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
    accentClass: "bg-indigo-500",
  },
  boxed: {
    en: "Boxed (legacy)",
    el: "Συσκευασμένη",
    badgeClass:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
    accentClass: "bg-indigo-500",
  },
  ready: {
    en: "Ready (legacy)",
    el: "Έτοιμη για κούριερ",
    badgeClass:
      "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
    accentClass: "bg-teal-500",
  },
  dispatched: {
    en: "Dispatched (legacy)",
    el: "Απεστάλη",
    badgeClass:
      "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
    accentClass: "bg-cyan-500",
  },
};

/** Localized label for a status. */
export function statusLabel(status: OrderStatus, locale: "en" | "el"): string {
  return STATUS_META[status][locale];
}

/** Human order number from the business date + daily number. */
export function formatOrderNumber(
  businessDate: string,
  dailyNumber: number
): string {
  const compact = businessDate.replaceAll("-", ""); // 2026-10-11 → 20261011
  return `ORD-${compact}-${String(dailyNumber).padStart(3, "0")}`;
}
