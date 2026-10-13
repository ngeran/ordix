import { describe, expect, it } from "vitest";
import { formatOrderNumber } from "@/lib/order-status";
import {
  clamp,
  formatMoney,
  getBusinessDate,
  isLowStock,
} from "@/lib/utils";

// Runner smoke test (Phase 0): proves vitest resolves the @ alias
// and the money/format helpers behave. Lifecycle-specific tests
// land with Phase 1 (order-status.test.ts).

describe("formatMoney", () => {
  it("formats integer cents as euros", () => {
    expect(formatMoney(1250, "en")).toContain("12.50");
  });

  it("never shows fractional cents", () => {
    expect(formatMoney(1, "en")).toMatch(/0\.01/);
  });
});

describe("getBusinessDate", () => {
  it("returns an ISO-like YYYY-MM-DD string", () => {
    expect(getBusinessDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatOrderNumber", () => {
  it("pads the daily number to three digits", () => {
    expect(formatOrderNumber("2026-10-13", 7)).toBe("ORD-20261013-007");
  });
});

describe("isLowStock / clamp", () => {
  it("flags stock at or below the threshold", () => {
    expect(isLowStock(15, 15)).toBe(true);
    expect(isLowStock(16, 15)).toBe(false);
  });

  it("clamps values into range", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});
