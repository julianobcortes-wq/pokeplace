import { describe, expect, it } from "vitest";
import { buildReferenceSeries, seriesToTrend } from "@/lib/pricing/series";
import type { CardQuote } from "@/lib/pricing/quote";

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
  windows: [
    { label: "Média 1 dia", days: 1, price: 1.9, currency: "USD" },
    { label: "Média 7 dias", days: 7, price: 1.7, currency: "USD" },
    { label: "Média 30 dias", days: 30, price: 1.5, currency: "USD" },
  ],
  note: "test",
};

describe("buildReferenceSeries", () => {
  it("builds a visible chart series from public windows and spot", () => {
    const points = buildReferenceSeries(quote, 90);
    expect(points.length).toBe(90);
    expect(points.every((p) => p.amount > 0)).toBe(true);
    expect(points.some((p) => p.source === "tcgdex-window")).toBe(true);
    const trend = seriesToTrend(points);
    expect(trend?.points.length).toBeGreaterThan(5);
    expect(trend?.last).toBeGreaterThan(0);
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
