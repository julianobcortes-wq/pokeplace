import { describe, expect, it } from "vitest";
import {
  BULK_MAX_ROWS,
  bulkListingTemplate,
  parseBulkListingCsv,
  parsePrice,
  splitCsvLine,
  toListingInserts,
} from "@/lib/marketplace/bulk-listing";

const HEADER = "card_id,condition,language,finish,price,quantity,graded,grade_company,grade,notes";

describe("parsePrice", () => {
  it("accepts Brazilian and international decimal formats", () => {
    expect(parsePrice("12,50")).toBe(12.5);
    expect(parsePrice("12.50")).toBe(12.5);
    expect(parsePrice("R$ 1.234,56")).toBe(1234.56);
    expect(parsePrice("1,234.56")).toBe(1234.56);
  });

  it("rejects empty, negative and malformed values", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("-3")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice("1,2,3")).toBeNull();
  });
});

describe("splitCsvLine", () => {
  it("handles quoted fields with embedded separators and escaped quotes", () => {
    expect(splitCsvLine('a,"b,c","say ""hi""",d', ",")).toEqual(["a", "b,c", 'say "hi"', "d"]);
  });
});

describe("parseBulkListingCsv", () => {
  it("parses a valid comma-separated file", () => {
    const csv = `${HEADER}\nsv3pt5-199,NM,en,normal,12.50,2,nao,,,\n`;
    const result = parseBulkListingCsv(csv);
    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual([
      {
        line: 2,
        cardId: "sv3pt5-199",
        condition: "NM",
        language: "en",
        finish: "normal",
        price: 12.5,
        quantity: 2,
        graded: false,
        gradeCompany: null,
        grade: null,
        notes: null,
      },
    ]);
  });

  it("auto-detects semicolon separators and BOM from spreadsheet exports", () => {
    const csv = `\uFEFF${HEADER.replaceAll(",", ";")}\nsv3pt5-199;hp;pt;holo;"8,90";3;sim;PSA;9;"capa, leve"\n`;
    const result = parseBulkListingCsv(csv);
    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      condition: "HP",
      language: "pt",
      finish: "holo",
      price: 8.9,
      quantity: 3,
      graded: true,
      gradeCompany: "PSA",
      grade: "9",
      notes: "capa, leve",
    });
  });

  it("reports per-line issues and keeps valid lines", () => {
    const csv = [
      HEADER,
      "sv3pt5-199,NM,en,normal,12.50,1,nao,,,",
      "x,NM,en,normal,12.50,1,nao,,,",
      "sv3pt5-199,XX,en,normal,12.50,1,nao,,,",
      "sv3pt5-199,NM,en,normal,0,1,nao,,,",
      "sv3pt5-199,NM,en,normal,5,0,nao,,,",
      "sv3pt5-199,NM,en,normal,5,1,sim,,,",
      "sv3pt5-199,NM,en,normal,5,1,nao,PSA,9,",
    ].join("\n");
    const result = parseBulkListingCsv(csv);
    expect(result.rows.map((r) => r.line)).toEqual([2]);
    const byLine = (n: number) => result.issues.filter((i) => i.line === n).map((i) => i.field);
    expect(byLine(3)).toEqual(["card_id"]);
    expect(byLine(4)).toEqual(["condition"]);
    expect(byLine(5)).toEqual(["price"]);
    expect(byLine(6)).toEqual(["quantity"]);
    expect(byLine(7)).toEqual(["grade"]);
    expect(byLine(8)).toEqual(["grade"]);
  });

  it("rejects a file without the required columns", () => {
    const result = parseBulkListingCsv("card_id,price\nsv3pt5-199,5");
    expect(result.rows).toEqual([]);
    expect(result.issues[0]?.field).toBe("header");
    expect(result.issues[0]?.message).toContain("condition");
  });

  it("rejects files above the row limit", () => {
    const body = Array.from(
      { length: BULK_MAX_ROWS + 1 },
      () => "sv3pt5-199,NM,en,normal,5,1,nao,,,",
    ).join("\n");
    const result = parseBulkListingCsv(`${HEADER}\n${body}`);
    expect(result.rows).toEqual([]);
    expect(result.issues[0]?.message).toContain(String(BULK_MAX_ROWS));
  });

  it("returns an error for an empty file", () => {
    expect(parseBulkListingCsv("  \n\n").issues[0]?.field).toBe("file");
  });

  it("produces a template that parses cleanly", () => {
    const result = parseBulkListingCsv(bulkListingTemplate());
    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });
});

describe("toListingInserts", () => {
  it("maps parsed rows to listing insert payloads for a seller", () => {
    const { rows } = parseBulkListingCsv(
      `${HEADER}\nsv3pt5-199,nm,en,normal,"1.234,50",2,sim,PSA,10,canto\n`,
    );
    expect(toListingInserts(rows, "seller-1")).toEqual([
      {
        seller_id: "seller-1",
        card_id: "sv3pt5-199",
        condition: "NM",
        language: "en",
        finish: "normal",
        price: 1234.5,
        quantity: 2,
        graded: true,
        grade_company: "PSA",
        grade: "10",
        notes: "canto",
        photo_paths: [],
      },
    ]);
  });
});
