// ============================================================
// SECTION: Imports
// ============================================================

import type { OrderStatus } from "@/db/schema";

// ============================================================
// SECTION: Order lifecycle definition
// ------------------------------------------------------------
// Single source of truth for the build-to-order state machine.
// Every transition is validated server-side; the UI derives its
// buttons from the same map, so the two can never disagree.
//
//   Order Entry ──► placed (New — waiting for production)
//   placed ──► in_production     (auto when the production
//                                 manager starts the first item)
//   in_production ──► production_complete
//                                (the production manager taps
//                                 "Order complete" once EVERY
//                                 active item is done)
//   production_complete ──► completed
//                                (ONLY via POST /close — the front
//                                 desk closes the order)
//
// Item production states: pending → in_production → completed
// (UI words: Not started → Being made → Done).
// ============================================================

/** The build-to-order happy path (also the detail-page stepper). */
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

/**
 * Orders in these stages still accept line edits, appended
 * rounds and voids — production has not locked the items yet.
 */
export const ITEM_EDITABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "placed",
  "in_production",
  "on_hold",
] as const;

/** Stages where production actions (send / complete) are legal. */
export const PRODUCIBLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "placed",
  "in_production",
] as const;

/**
 * Stages from which the department closure endpoint accepts a
 * close. `in_production` closes ONLY when every active item is
 * already produced (edge case — see canClose helper users).
 */
export const CLOSABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "production_complete",
  "in_production",
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
  // No manual "in_production": starting the first item does it,
  // so the order status can never claim work that isn't happening.
  placed: ["on_hold", "cancelled"],
  in_production: ["production_complete", "on_hold", "cancelled"],
  // No "completed": the department closure endpoint is the only
  // path to completed (see CLOSABLE_ORDER_STATUSES).
  production_complete: ["in_production", "cancelled"],
  on_hold: ["placed", "in_production", "cancelled"],
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
// SECTION: Generic helpers
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
// SECTION: Lifecycle predicate helpers
// ------------------------------------------------------------
// Shared by the API routes and the screens so "can I do this?"
// is answered in exactly one place.
// ============================================================

/** Order stages that accept appended rounds. */
export function canAppendItems(status: OrderStatus): boolean {
  return ITEM_EDITABLE_ORDER_STATUSES.includes(status);
}

/** Order stages that accept line edits / voids / quantity changes. */
export function canChangeItem(status: OrderStatus): boolean {
  return ITEM_EDITABLE_ORDER_STATUSES.includes(status);
}

/** Order stages where an item may be sent to production. */
export function canSendItem(status: OrderStatus): boolean {
  return PRODUCIBLE_ORDER_STATUSES.includes(status);
}

/** Order stages where an item may be marked produced. */
export function canCompleteItem(status: OrderStatus): boolean {
  return PRODUCIBLE_ORDER_STATUSES.includes(status);
}

/**
 * Production completion rule: every ACTIVE item is `completed`.
 * Voided lines are ignored; an order whose lines were ALL voided
 * counts as produced (vacuously — nothing left to make).
 */
export function allItemsProduced(
  items: Array<{ status: string; productionStatus: string }>
): boolean {
  const active = items.filter((item) => item.status === "active");
  return active.every((item) => item.productionStatus === "completed");
}

/** Stage check for the department closure endpoint. */
export function isClosableStatus(status: OrderStatus): boolean {
  return CLOSABLE_ORDER_STATUSES.includes(status);
}

// ============================================================
// SECTION: Production progress (one formula for every screen)
// ------------------------------------------------------------
// Orders, Production, Closure and the Wallboard all show the same
// "x of y done · NN%" numbers — computed here, from ACTIVE items
// only, so no two screens can ever disagree.
// ============================================================

export interface ProductionProgress {
  total: number;
  waiting: number;
  making: number;
  done: number;
  /** Whole-number percentage of active items done. */
  pct: number;
  /** Every active item is done (and there is at least one). */
  allDone: boolean;
}

function buildProgress(total: number, making: number, done: number): ProductionProgress {
  return {
    total,
    waiting: Math.max(0, total - making - done),
    making,
    done,
    pct: total === 0 ? 0 : Math.round((done / total) * 100),
    allDone: total > 0 && done === total,
  };
}

/** Progress from raw item rows (detail page, production board). */
export function itemsProgress(
  items: Array<{ status: string; productionStatus: string }>
): ProductionProgress {
  const active = items.filter((item) => item.status === "active");
  return buildProgress(
    active.length,
    active.filter((item) => item.productionStatus === "in_production").length,
    active.filter((item) => item.productionStatus === "completed").length
  );
}

/** Progress from list aggregates (orders list, wallboard). */
export function summaryProgress(order: {
  itemCount: number;
  producedCount: number;
  inProductionCount: number;
}): ProductionProgress {
  return buildProgress(order.itemCount, order.inProductionCount, order.producedCount);
}

// ============================================================
// SECTION: Display metadata — labels (bilingual) & colors
// ------------------------------------------------------------
// DB values stay stable; the UI words below were approved by the
// customer (see the relabel table in the README).
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
    en: "New",
    el: "Νέα",
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
    en: "Ready for pickup",
    el: "Έτοιμη για παραλαβή",
    badgeClass:
      "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    accentClass: "bg-violet-500",
  },
  completed: {
    en: "Closed",
    el: "Κλειστή",
    badgeClass:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    accentClass: "bg-emerald-500",
  },
  on_hold: {
    en: "On hold",
    el: "Σε παύση",
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
