import { describe, expect, it } from "vitest";
import {
  allItemsProduced,
  allowedTransitions,
  canAppendItems,
  canChangeItem,
  canCompleteItem,
  canSendItem,
  canTransition,
  CLOSABLE_ORDER_STATUSES,
  isClosableStatus,
  isTerminal,
  ITEM_EDITABLE_ORDER_STATUSES,
  ORDER_MAIN_FLOW,
  PRODUCIBLE_ORDER_STATUSES,
  STATUS_META,
} from "@/lib/order-status";
import { ORDER_STATUSES } from "@/db/schema";

// ============================================================
// SECTION: Transition matrix
// ------------------------------------------------------------
// Walks every (from, to) pair and asserts it matches TRANSITIONS
// exactly — new statuses must be added to the map, not left to
// default behavior.
// ============================================================

describe("transition matrix", () => {
  it("allows exactly the documented transitions", () => {
    const allowed = new Set<string>([
      "in_production>production_complete",
      "in_production>on_hold",
      "in_production>cancelled",
      "production_complete>in_production",
      "production_complete>cancelled",
      "placed>on_hold",
      "placed>cancelled",
      "on_hold>placed",
      "on_hold>in_production",
      "on_hold>cancelled",
      // legacy chains
      "preparing>prepared",
      "prepared>boxed",
      "boxed>ready",
      "ready>dispatched",
      "dispatched>completed",
      "preparing>on_hold",
      "prepared>on_hold",
      "boxed>on_hold",
      "preparing>cancelled",
      "prepared>cancelled",
      "boxed>cancelled",
      "ready>cancelled",
    ]);
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        const key = `${from}>${to}`;
        expect(canTransition(from, to), key).toBe(allowed.has(key));
      }
    }
  });

  it("never completes directly from production_complete", () => {
    // Completion happens ONLY through the department closure endpoint.
    expect(canTransition("production_complete", "completed")).toBe(false);
  });

  it("terminals never transition", () => {
    expect(allowedTransitions("completed")).toEqual([]);
    expect(allowedTransitions("cancelled")).toEqual([]);
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("placed")).toBe(false);
  });
});

describe("allItemsProduced", () => {
  const line = (status: string, productionStatus: string) => ({
    status,
    productionStatus,
  });

  it("is true when every active item is completed", () => {
    expect(
      allItemsProduced([
        line("active", "completed"),
        line("active", "completed"),
      ])
    ).toBe(true);
  });

  it("ignores voided items", () => {
    expect(
      allItemsProduced([
        line("active", "completed"),
        line("voided", "pending"),
      ])
    ).toBe(true);
  });

  it("is false while any active item is not produced", () => {
    expect(
      allItemsProduced([
        line("active", "completed"),
        line("active", "in_production"),
      ])
    ).toBe(false);
  });

  it("treats an order with only voided lines as produced (vacuous)", () => {
    expect(allItemsProduced([line("voided", "pending")])).toBe(true);
    expect(allItemsProduced([])).toBe(true);
  });
});

// ============================================================
// SECTION: Predicate matrices
// ============================================================

describe("stage predicates", () => {
  it("item editing is limited to the editable stages", () => {
    for (const status of ORDER_STATUSES) {
      const expected = ITEM_EDITABLE_ORDER_STATUSES.includes(status);
      expect(canAppendItems(status), status).toBe(expected);
      expect(canChangeItem(status), status).toBe(expected);
    }
  });

  it("production actions are limited to the producible stages", () => {
    for (const status of ORDER_STATUSES) {
      const expected = PRODUCIBLE_ORDER_STATUSES.includes(status);
      expect(canSendItem(status), status).toBe(expected);
      expect(canCompleteItem(status), status).toBe(expected);
    }
  });

  it("closure is limited to the closable stages", () => {
    for (const status of ORDER_STATUSES) {
      expect(isClosableStatus(status), status).toBe(
        CLOSABLE_ORDER_STATUSES.includes(status)
      );
    }
    // The department closure endpoint — not the transition map —
    // is the only path to completed.
    expect(CLOSABLE_ORDER_STATUSES).toContain("in_production");
    expect(CLOSABLE_ORDER_STATUSES).toContain("production_complete");
  });
});

// ============================================================
// SECTION: Main flow + metadata integrity
// ============================================================

describe("main flow & metadata", () => {
  it("covers the four lifecycle stages in order", () => {
    expect(ORDER_MAIN_FLOW).toEqual([
      "placed",
      "in_production",
      "production_complete",
      "completed",
    ]);
  });

  it("every status has bilingual metadata", () => {
    for (const status of ORDER_STATUSES) {
      expect(STATUS_META[status].en.length, status).toBeGreaterThan(0);
      expect(STATUS_META[status].el.length, status).toBeGreaterThan(0);
    }
  });
});
