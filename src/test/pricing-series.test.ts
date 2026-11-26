import { describe, expect, it } from "vitest";
import { buildReferenceSeries, seriesToTrend } from "@/lib/pricing/series";
import { parseTcgdexCardPricing, tcgdexCandidateIds, type CardQuote } from "@/lib/pricing/quote";

const quote: CardQuote = {
  cardId: "sv08.5-028",
  available: true,
  source: "tcgdex",
  sourceLabel: "TCGdex",
  market: "tcgplayer",
  currency: "USD",
  price: 1.81,
  asOf: new Date().toISOString(),
  condition: "Holofoil",
  tcgplayer: { market: 1.81, low: 1.1, mid: 1.95, high: 2.5, finish: "Holofoil", currency: "USD", updated: null },
  cardmarket: { trend: 1.65, avg: 1.7, low: 0.9, avg1: 1.72, avg7: 1.68, avg30: 1.55, currency: "EUR", updated: null },
  windows: [
    { label: "Média 1 dia", days: 1, price: 1.9, currency: "USD" },
    { label: "Média 7 dias", days: 7, price: 1.7, currency: "USD" },
    { label: "Média 30 dias", days: 30, price: 1.5, currency: "USD" },
  ],
  note: "test",
};

describe("tcgdexCandidateIds", () => {
  it("maps PokemonTCG pt5 and unpadded SV IDs to TCGdex candidates", () => {
    expect(tcgdexCandidateIds("sv3pt5-199")).toContain("sv03.5-199");
    expect(tcgdexCandidateIds("swsh12pt5-19")).toContain("swsh12.5-019");
    expect(tcgdexCandidateIds("sv1-5")).toContain("sv01-005");
    expect(tcgdexCandidateIds("base1-4")[0]).toBe("base1-4");
  });
});

describe("parseTcgdexCardPricing", () => {
  it("extracts both TCGplayer USD and Cardmarket EUR windows from top-level pricing", () => {
    const parsed = parseTcgdexCardPricing("base1-4", {
      pricing: {
        tcgplayer: {
          unit: "USD",
          holofoil: { marketPrice: 350.5, lowPrice: 280, midPrice: 365 },
        },
        cardmarket: {
          unit: "EUR",
          trend: 310,
          avg: 305,
          low: 210,
          avg1: 318,
          avg7: 302,
          avg30: 290,
        },
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.currency).toBe("USD");
    expect(parsed?.price).toBe(350.5);
    expect(parsed?.tcgplayer?.low).toBe(280);
    expect(parsed?.cardmarket?.trend).toBe(310);
    expect(parsed?.windows.length).toBe(3);
  });

  it("falls back to Cardmarket EUR when TCGplayer is absent", () => {
    const parsed = parseTcgdexCardPricing("sv03.5-006", {
      pricing: {
        cardmarket: { unit: "EUR", trend: 42.5, avg7: 41, avg30: 38.5 },
      },
    });
    expect(parsed?.market).toBe("cardmarket");
    expect(parsed?.currency).toBe("EUR");
    expect(parsed?.price).toBe(42.5);
  });
});

describe("buildReferenceSeries", () => {
  it("builds a visible chart series from public windows and spot and propagates currency", () => {
    const points = buildReferenceSeries(quote, 90);
    expect(points.length).toBe(90);
    expect(points.every((p) => p.amount > 0)).toBe(true);
    expect(points.some((p) => p.source === "tcgdex-window")).toBe(true);
    const trend = seriesToTrend(points);
    expect(trend?.points.length).toBeGreaterThan(5);
    expect(trend?.last).toBeGreaterThan(0);
    expect(trend?.currency).toBe("USD");
  });

  it("switches cleanly to Cardmarket EUR windows when preferredMarket is cardmarket", () => {
    const points = buildReferenceSeries(quote, 30, "cardmarket");
    expect(points.length).toBe(30);
    expect(points.every((p) => p.currency === "EUR")).toBe(true);
    expect(points.some((p) => p.source === "tcgdex-window")).toBe(true);
    expect(seriesToTrend(points)?.currency).toBe("EUR");
  });

  it("marks demo when windows are another currency or only spot exists", () => {
    const euroWindows = {
      ...quote,
      windows: [{ label: "Média 7 dias", days: 7, price: 3.14, currency: "EUR" }],
    };
    const points = buildReferenceSeries(euroWindows, 30);
    expect(points.length).toBe(30);
    expect(points.every((p) => p.source === "demo")).toBe(true);
  });
});
