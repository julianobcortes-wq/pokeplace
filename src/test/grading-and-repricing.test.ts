import { describe, expect, it } from "vitest";
import { applyPriceRule, planBulkEdit, validatePriceRule } from "@/lib/marketplace/bulk-edit";
import { CONDITION_GUIDE, photoSlotLabel, validateGrading } from "@/lib/marketplace/grading";

describe("Phase 1 grading validation, condition guide & reference-price bulk repricing", () => {
  it("accepts non-graded cards with null company/grade", () => {
    expect(validateGrading(false, "PSA", "10")).toEqual({ ok: true, company: null, grade: null });
    expect(validateGrading(false, "", "")).toEqual({ ok: true, company: null, grade: null });
  });

  it("validates PSA, BGS, CGC, TAG and Outra scales accurately", () => {
    expect(validateGrading(true, "PSA", "10")).toEqual({ ok: true, company: "PSA", grade: "10" });
    expect(validateGrading(true, "PSA", "8.5")).toEqual({ ok: true, company: "PSA", grade: "8.5" });
    expect(validateGrading(true, "PSA", "Authentic").ok).toBe(true);
    expect(validateGrading(true, "PSA", "9.5").ok).toBe(false);
    expect(validateGrading(true, "PSA", "11").ok).toBe(false);

    expect(validateGrading(true, "BGS", "9.5").ok).toBe(true);
    expect(validateGrading(true, "BGS", "10 Black Label").ok).toBe(true);
    expect(validateGrading(true, "BGS", "12").ok).toBe(false);

    expect(validateGrading(true, "CGC", "10 Pristine").ok).toBe(true);
    expect(validateGrading(true, "TAG", "9.5").ok).toBe(true);
    expect(validateGrading(true, "Outra", "9.0").ok).toBe(true);

    expect(validateGrading(true, "", "10").ok).toBe(false);
    expect(validateGrading(true, "UNKNOWN", "10").ok).toBe(false);
    expect(validateGrading(true, "PSA", "").ok).toBe(false);
  });

  it("provides full condition guide specs for all 6 conditions and ordered photo slot labels", () => {
    expect(CONDITION_GUIDE.map((c) => c.code)).toEqual(["M", "NM", "SP", "MP", "HP", "D"]);
    for (const c of CONDITION_GUIDE) {
      expect(c.priceFactor).toBeGreaterThan(0);
      expect(c.edges.length).toBeGreaterThan(5);
      expect(c.surface.length).toBeGreaterThan(5);
    }
    expect(photoSlotLabel(0)).toBe("Frente");
    expect(photoSlotLabel(1)).toBe("Verso");
    expect(photoSlotLabel(2)).toBe("Detalhe 1");
    expect(photoSlotLabel(3)).toBe("Detalhe 2");
    expect(photoSlotLabel(4)).toBe("Foto 5");
  });

  it("reprices listings relative to BRL market reference price and skips cards without reference", () => {
    expect(validatePriceRule({ mode: "reference_percent", percent: -5 })).toBeNull();
    expect(validatePriceRule({ mode: "reference_percent", percent: -95 })).not.toBeNull();

    expect(applyPriceRule(50, { mode: "reference_percent", percent: -10 }, 100)).toBe(90);
    expect(applyPriceRule(50, { mode: "reference_percent", percent: 15 }, 40)).toBe(46);
    expect(applyPriceRule(50, { mode: "reference_percent", percent: 0 }, null)).toBeNull();

    const plan = planBulkEdit(
      [
        { id: "l1", card_id: "sv3pt5-199", price: 900, quantity: 1, status: "active" },
        { id: "l2", card_id: "missing-card", price: 100, quantity: 2, status: "active" },
      ],
      { kind: "price", rule: { mode: "reference_percent", percent: -5 } },
      true,
      { "sv3pt5-199": 1200 },
    );

    expect(plan.updates).toEqual([{ id: "l1", patch: { price: 1140 } }]);
    expect(plan.skipped).toEqual([{ id: "l2", reason: "Sem preço de referência BRL disponível." }]);
  });
});
