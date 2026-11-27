import { describe, expect, it } from "vitest";
import {
  conditionAdjustedPrice,
  exportCollectionCsv,
  shouldTriggerPriceAlert,
  summarizePortfolio,
  validateShareSlug,
  type PortfolioEntry,
} from "@/lib/marketplace/portfolio";

describe("portfolio valuation, cost basis, and P&L", () => {
  const entries: PortfolioEntry[] = [
    {
      id: "1",
      card_id: "sv3pt5-199",
      kind: "owned",
      quantity: 2,
      condition: "NM",
      purchase_price: 500,
      card_name: "Charizard ex",
      card_number: "199",
      set_name: "151",
    },
    {
      id: "2",
      card_id: "sv3pt5-198",
      kind: "owned",
      quantity: 1,
      condition: "SP",
      purchase_price: 200,
      card_name: "Venusaur ex",
      card_number: "198",
      set_name: "151",
    },
    {
      id: "3",
      card_id: "swsh7-215",
      kind: "wanted",
      quantity: 1,
      target_price: 3000,
      card_name: "Umbreon VMAX",
      card_number: "215",
      set_name: "Evolving Skies",
    },
  ];

  const prices = {
    "sv3pt5-199": 700,
    "sv3pt5-198": 250,
    "swsh7-215": 3500,
  };

  it("adjusts market prices by condition", () => {
    expect(conditionAdjustedPrice(100, "M")).toBe(115);
    expect(conditionAdjustedPrice(100, "NM")).toBe(100);
    expect(conditionAdjustedPrice(100, "SP")).toBe(85);
    expect(conditionAdjustedPrice(100, "D")).toBe(30);
    expect(conditionAdjustedPrice(null, "NM")).toBeNull();
  });

  it("summarizes owned portfolio value, cost basis, P&L, and set breakdown while excluding wanted cards", () => {
    const s = summarizePortfolio(entries, prices);
    // Charizard: 2 * 700 = 1400 (cost 1000)
    // Venusaur SP: 1 * 250 * 0.85 = 212.50 (cost 200)
    expect(s.ownedCards).toBe(2);
    expect(s.totalCopies).toBe(3);
    expect(s.totalValueBrl).toBe(1612.5);
    expect(s.totalCostBrl).toBe(1200);
    expect(s.pnlBrl).toBe(412.5);
    expect(s.pnlPct).toBe(34.38);
    expect(s.bySet).toHaveLength(1);
    expect(s.bySet[0]?.setName).toBe("151");
    expect(s.bySet[0]?.copies).toBe(3);
  });

  it("exports collection to UTF-8 BOM CSV with proper escaping", () => {
    const csv = exportCollectionCsv(entries, prices);
    expect(csv.startsWith("\uFEFFCarta,Numero,Colecao")).toBe(true);
    expect(csv).toContain("Charizard ex,199,151,Colecao,2,NM,500.00,700.00,1400.00,400.00,");
    expect(csv).toContain("Umbreon VMAX,215,Evolving Skies,Desejo,1,NM,,3500.00,3500.00,,3000.00");
  });
});

describe("public collection share slug validation", () => {
  it("accepts clean slugs and rejects invalid formats", () => {
    expect(validateShareSlug("ash-ketchum-151")).toBeNull();
    expect(validateShareSlug("ab")).toContain("3 e 36");
    expect(validateShareSlug("meu acervo!")).toContain("letras minúsculas");
    expect(validateShareSlug("-invalido-")).toContain("letras minúsculas");
  });
});

describe("price alert trigger logic", () => {
  const now = new Date("2026-11-27T12:00:00Z").getTime();

  it("triggers below and above alerts respecting 24h cooldown", () => {
    expect(
      shouldTriggerPriceAlert({
        direction: "below",
        targetBrl: 100,
        currentPriceBrl: 95,
        nowMs: now,
      }),
    ).toBe(true);
    expect(
      shouldTriggerPriceAlert({
        direction: "below",
        targetBrl: 100,
        currentPriceBrl: 105,
        nowMs: now,
      }),
    ).toBe(false);
    expect(
      shouldTriggerPriceAlert({
        direction: "above",
        targetBrl: 200,
        currentPriceBrl: 210,
        nowMs: now,
      }),
    ).toBe(true);
    expect(
      shouldTriggerPriceAlert({
        direction: "below",
        targetBrl: 100,
        currentPriceBrl: 90,
        lastTriggeredAt: "2026-11-27T01:00:00Z",
        nowMs: now,
      }),
    ).toBe(false);
    expect(
      shouldTriggerPriceAlert({
        direction: "below",
        targetBrl: 100,
        currentPriceBrl: 90,
        lastTriggeredAt: "2026-11-25T01:00:00Z",
        nowMs: now,
      }),
    ).toBe(true);
  });
});
