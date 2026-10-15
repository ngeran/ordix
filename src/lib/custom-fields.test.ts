import { describe, expect, it } from "vitest";
import { cleanCustomValues, slugifyKey, type CustomFieldDef } from "./custom-fields";

const def = (overrides: Partial<CustomFieldDef>): CustomFieldDef => ({
  id: overrides.key ?? "x",
  entity: "products",
  key: "x",
  labelEn: "X",
  labelEl: null,
  type: "text",
  options: null,
  required: false,
  sortOrder: 0,
  isActive: true,
  ...overrides,
});

describe("cleanCustomValues", () => {
  const defs = [
    def({ key: "color", type: "select", options: ["Red", "Blue"] }),
    def({ key: "weight", labelEn: "Weight", type: "number", required: true }),
    def({ key: "fragile", type: "boolean" }),
    def({ key: "old", isActive: false }),
  ];

  it("coerces types and drops unknown keys", () => {
    const result = cleanCustomValues(defs, { color: "Red", weight: "2,5", fragile: "true", junk: "x" }, null);
    expect(result).toEqual({ values: { color: "Red", weight: 2.5, fragile: true } });
  });

  it("enforces required fields", () => {
    expect(cleanCustomValues(defs, { color: "Red" }, null).error).toBe('"Weight" is required');
  });

  it("rejects values outside a list and non-numbers", () => {
    expect(cleanCustomValues(defs, { weight: 1, color: "Green" }, null).error).toContain("must be one of");
    expect(cleanCustomValues(defs, { weight: "abc" }, null).error).toContain("must be a number");
  });

  it("keeps stored values of hidden fields", () => {
    const result = cleanCustomValues(defs, { weight: 3 }, { old: "kept", color: "Blue" });
    expect(result.values).toEqual({ old: "kept", weight: 3 });
  });
});

describe("slugifyKey", () => {
  it("builds import-friendly keys", () => {
    expect(slugifyKey("Warranty (months)")).toBe("warranty_months");
    expect(slugifyKey("Café Color")).toBe("cafe_color");
  });
});
