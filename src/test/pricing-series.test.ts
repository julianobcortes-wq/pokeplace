import { describe, expect, it } from "vitest";
import { buildReferenceSeries, seriesToTrend } from "@/lib/pricing/series";
import { parseTcgdexCardPricing, tcgdexCandidateIds, type CardQuote } from "@/lib/pricing/quote";
import { convertToBrl, FALLBACK_FX } from "@/lib/pricing/fx";
import { localSets, localStats, localTrending, normalizeSetLogoUrl } from "@/lib/catalog/local";

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
    expect(points.at(-1)?.amount).toBe(1.81);
  });

  it("produces organic non-flat history before day -30 on 90D window charts", () => {
    const points = buildReferenceSeries(quote, 90, "cardmarket");
    expect(points.length).toBe(90);
    expect(points.at(-1)?.amount).toBe(1.65);
    const earlySegment = points.slice(0, 50).map((p) => p.amount);
    expect(new Set(earlySegment).size).toBeGreaterThan(4);

    const highValueQuote: CardQuote = {
      ...quote,
      cardId: "base1-4",
      cardmarket: { trend: 331.18, avg: 325, low: 190, avg1: 338, avg7: 320, avg30: 298, currency: "EUR", updated: null },
    };
    const highPoints = buildReferenceSeries(highValueQuote, 90, "cardmarket");
    expect(highPoints.at(-1)?.amount).toBe(331.18);
    expect(new Set(highPoints.slice(0, 50).map((p) => p.amount)).size).toBeGreaterThan(20);
  });
});

describe("catalog asset normalization & hero ordering", () => {
  it("appends .webp to extensionless TCGdex logo URLs and keeps existing extensions intact", () => {
    expect(normalizeSetLogoUrl("https://assets.tcgdex.net/en/base/base1/logo")).toBe(
      "https://assets.tcgdex.net/en/base/base1/logo.webp",
    );
    expect(normalizeSetLogoUrl("https://assets.tcgdex.net/en/base/base1/logo.png")).toBe(
      "https://assets.tcgdex.net/en/base/base1/logo.png",
    );
    expect(normalizeSetLogoUrl(null)).toBeNull();
    expect(localSets().every((s) => !s.logo_url || /\.(webp|png|jpg|svg)$/i.test(s.logo_url))).toBe(true);
  });

  it("places base1-4 Charizard at center index 2 of trending hero fan and ships full catalog", () => {
    expect(localTrending()[2]?.id).toBe("base1-4");
    expect(localStats().cards).toBeGreaterThan(3000);
    expect(localSets().length).toBeGreaterThanOrEqual(20);
  });

  it("converts reference series cleanly to BRL headline currency", () => {
    const brlPoints = buildReferenceSeries(quote, 30, "tcgplayer", { currency: "BRL", multiplier: FALLBACK_FX.USD });
    expect(brlPoints.every((p) => p.currency === "BRL")).toBe(true);
    expect(brlPoints.at(-1)?.amount).toBe(convertToBrl(1.81, "USD", FALLBACK_FX));
  });
});
