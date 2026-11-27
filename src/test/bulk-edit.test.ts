import { describe, expect, it } from "vitest";
import {
  applyPriceRule,
  planBulkEdit,
  validatePriceRule,
  type BulkEditListing,
} from "@/lib/marketplace/bulk-edit";

const a: BulkEditListing = { id: "a", price: 10, quantity: 2, status: "active" };
const b: BulkEditListing = { id: "b", price: 20.5, quantity: 0, status: "sold_out" };
const p: BulkEditListing = { id: "p", price: 5, quantity: 1, status: "paused" };

describe("applyPriceRule", () => {
  it("adjusts by percentage and rounds to centavos", () => {
    expect(applyPriceRule(10, { mode: "percent", percent: -10 })).toBe(9);
    expect(applyPriceRule(3.33, { mode: "percent", percent: 15 })).toBe(3.83);
  });

  it("sets a fixed price", () => {
    expect(applyPriceRule(10, { mode: "set", price: 12.5 })).toBe(12.5);
  });

  it("rejects results below one centavo or above the price cap", () => {
    expect(applyPriceRule(0.01, { mode: "percent", percent: -90 })).toBeNull();
    expect(applyPriceRule(90_000, { mode: "percent", percent: 20 })).toBeNull();
    expect(applyPriceRule(10, { mode: "set", price: 0 })).toBeNull();
  });
});

describe("validatePriceRule", () => {
  it("bounds percentage and fixed values", () => {
    expect(validatePriceRule({ mode: "percent", percent: -91 })).not.toBeNull();
    expect(validatePriceRule({ mode: "percent", percent: 300 })).toBeNull();
    expect(validatePriceRule({ mode: "set", price: 100_001 })).not.toBeNull();
  });
});

describe("planBulkEdit", () => {
  it("applies a price rule to every listing", () => {
    const plan = planBulkEdit(
      [a, b],
      { kind: "price", rule: { mode: "percent", percent: 10 } },
      true,
    );
    expect(plan.updates).toEqual([
      { id: "a", patch: { price: 11 } },
      { id: "b", patch: { price: 22.55 } },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("reactivates sold out listings when stock is set above zero for approved sellers", () => {
    const plan = planBulkEdit([b], { kind: "quantity", quantity: 3 }, true);
    expect(plan.updates).toEqual([{ id: "b", patch: { quantity: 3, status: "active" } }]);
  });

  it("marks listings sold out at zero stock and keeps paused listings paused", () => {
    const plan = planBulkEdit([a, p], { kind: "quantity", quantity: 0 }, true);
    expect(plan.updates).toEqual([
      { id: "a", patch: { quantity: 0, status: "sold_out" } },
      { id: "p", patch: { quantity: 0, status: "sold_out" } },
    ]);
  });

  it("blocks activation for sellers that are not approved", () => {
    const plan = planBulkEdit([p, a], { kind: "status", status: "active" }, false);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped.map((s) => s.id)).toEqual(["p", "a"]);
  });

  it("skips listings already in the requested status", () => {
    const plan = planBulkEdit([p, a], { kind: "status", status: "paused" }, true);
    expect(plan.updates).toEqual([{ id: "a", patch: { status: "paused" } }]);
    expect(plan.skipped).toEqual([{ id: "p", reason: "Já está nesse status." }]);
  });

  it("reports listings whose new price falls outside the limits", () => {
    const plan = planBulkEdit(
      [{ id: "c", price: 0.01, quantity: 1, status: "active" }],
      { kind: "price", rule: { mode: "percent", percent: -60 } },
      true,
    );
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
  });
});
