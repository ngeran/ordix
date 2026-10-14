import { describe, expect, it } from "vitest";
import { IMPORT_FORMATS, IMPORT_TYPES, importTemplate, parseImportFile } from "@/lib/importer";
import { ordersExportXml } from "@/lib/order-export";

describe("parseImportFile", () => {
  it("accepts a wrapped list and a bare array", () => {
    const wrapped = parseImportFile("categories", "json", '{"categories":[{"name":"Locks"}]}');
    const bare = parseImportFile("categories", "json", '[{"name":"Locks","sortOrder":"3"}]');
    expect(wrapped).toEqual({ rows: [{ name: "Locks" }], errors: [] });
    expect(bare.rows[0]).toEqual({ name: "Locks", sortOrder: 3 });
  });

  it("reports a missing required field per row instead of 'undefined'", () => {
    const result = parseImportFile("products", "json", '[{"name":"No code"},{"partNumber":"A1","name":"Ok","category":"X"}]');
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual(["Row 1: partNumber is required"]);
  });

  it("labels rows and explains bad numbers", () => {
    const result = parseImportFile("products", "json", '[{"partNumber":"A1","name":"x","itemsPerBox":"two"}]');
    expect(result.errors).toEqual(["Row 1 (A1): itemsPerBox must be a whole number"]);
  });

  it("treats blank values as not provided and keeps numeric codes", () => {
    const result = parseImportFile("products", "json", '[{"partNumber":4040,"name":"x","barcode":"  "}]');
    expect(result.rows[0]).toEqual({ partNumber: "4040", name: "x" });
  });

  it("points at the right type when the wrong one is picked", () => {
    const json = parseImportFile("customers", "json", '{"products":[{"partNumber":"A","name":"B"}]}');
    expect(json.errors[0]).toMatch(/contains "products"/);
    const xml = parseImportFile("categories", "xml", "<ordix><products><product><partNumber>A</partNumber><name>B</name><category>Locks</category></product></products></ordix>");
    expect(xml.errors[0]).toMatch(/<product> records/);
  });

  it("decodes XML entities, CDATA and ignores comments", () => {
    const xml = `<?xml version="1.0"?><!-- <product><partNumber>ghost</partNumber></product> -->
      <products><product><partNumber>A&amp;B</partNumber><name><![CDATA[Lock <R70>]]></name>
      <category>Locks &#38; Keys</category><itemsPerBox>10</itemsPerBox></product></products>`;
    expect(parseImportFile("products", "xml", xml)).toEqual({
      rows: [{ partNumber: "A&B", name: "Lock <R70>", category: "Locks & Keys", itemsPerBox: 10 }],
      errors: [],
    });
  });

  it("round-trips every downloadable template", () => {
    for (const type of IMPORT_TYPES) {
      for (const format of IMPORT_FORMATS) {
        const result = parseImportFile(type, format, importTemplate(type, format));
        expect(result.errors, `${type}/${format}`).toEqual([]);
        expect(result.rows.length).toBe(2);
      }
    }
  });
});

describe("ordersExportXml", () => {
  it("escapes text, formats money and nests line items", () => {
    const xml = ordersExportXml({
      business: "Acme",
      exportedAt: "2026-10-14T10:00:00.000Z",
      from: "2026-10-01",
      to: "2026-10-14",
      count: 1,
      orders: [
        {
          orderNumber: "ORD-20261014-001",
          businessDate: "2026-10-14",
          placedAt: "2026-10-14T08:00:00.000Z",
          completedAt: "2026-10-14T09:00:00.000Z",
          paidAt: null,
          paymentMethod: "cash",
          paymentNote: null,
          total: 12.5,
          currency: "EUR",
          notes: "Fragile & heavy",
          createdBy: "Maria",
          closedBy: null,
          customer: { name: "Nikos", phone: null, email: null, address: null },
          items: [{ partNumber: "A1", name: "Profile <40>", boxes: 1, pieces: 2, lineTotal: 12.5, note: null }],
        },
      ],
    });
    expect(xml).toContain("<total>12.50</total>");
    expect(xml).toContain("<notes>Fragile &amp; heavy</notes>");
    expect(xml).toContain("<name>Profile &lt;40&gt;</name>");
    expect(xml).toMatch(/<items>\s*<item>/);
    expect(xml).not.toContain("<paidAt>");
  });
});
