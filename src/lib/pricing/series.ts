import type { CardQuote } from "./quote";

export type SeriesPoint = {
  observed_at: string;
  amount: number;
  source: string;
  currency?: string;
  locked?: boolean;
};

export type TrendSummary = {
  points: number[];
  last: number;
  change: number | null;
  demo: boolean;
  currency: string;
};

/** Deterministic 0..1 from a string — keeps demo curves stable per card. */
function seed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Build a daily reference series for charts when the DB has no sales history.
 * Prefer published Cardmarket windows + same-currency spot; otherwise a marked demo path.
 */
export function buildReferenceSeries(
  quote: CardQuote | undefined,
  days: number | null,
  preferredMarket?: "tcgplayer" | "cardmarket",
): SeriesPoint[] {
  const span = Math.max(7, Math.min(days ?? 90, 365));
  const now = Date.now();
  const dayMs = 86_400_000;

  if (!quote?.available) return [];

  let spot = quote.price;
  let currency = quote.currency;

  if (preferredMarket === "cardmarket" && quote.cardmarket) {
    spot = quote.cardmarket.trend ?? quote.cardmarket.avg ?? quote.cardmarket.avg7 ?? quote.cardmarket.avg30;
    currency = quote.cardmarket.currency;
  } else if (preferredMarket === "tcgplayer" && quote.tcgplayer) {
    spot = quote.tcgplayer.market;
    currency = quote.tcgplayer.currency;
  }

  if (spot == null || !Number.isFinite(spot) || spot <= 0) return [];
  const activeCurrency = currency ?? "USD";

  // Never mix Cardmarket EUR windows with a TCGplayer USD spot on the same axis.
  const sameCurrency = quote.windows.filter((w) => w.currency === activeCurrency);
  const byDays = new Map(sameCurrency.map((w) => [w.days, w.price]));
  if (preferredMarket === "cardmarket" && quote.cardmarket && quote.cardmarket.currency === activeCurrency) {
    if (quote.cardmarket.avg1 != null && !byDays.has(1)) byDays.set(1, quote.cardmarket.avg1);
    if (quote.cardmarket.avg7 != null && !byDays.has(7)) byDays.set(7, quote.cardmarket.avg7);
    if (quote.cardmarket.avg30 != null && !byDays.has(30)) byDays.set(30, quote.cardmarket.avg30);
  }
  const anchors: { offset: number; price: number }[] = [{ offset: 0, price: spot }];
  if (byDays.has(1)) anchors.push({ offset: -1, price: byDays.get(1)! });
  if (byDays.has(7)) anchors.push({ offset: -7, price: byDays.get(7)! });
  if (byDays.has(30)) anchors.push({ offset: -30, price: byDays.get(30)! });
  anchors.sort((a, b) => a.offset - b.offset);

  const fromWindows = anchors.length >= 2;
  const s = seed(`${quote.cardId}:${activeCurrency}`);
  const out: SeriesPoint[] = [];

  for (let i = span - 1; i >= 0; i--) {
    const offset = -i;
    let price: number;
    if (fromWindows) {
      let lo = anchors[0]!;
      let hi = anchors[anchors.length - 1]!;
      for (let a = 0; a < anchors.length - 1; a++) {
        const left = anchors[a]!;
        const right = anchors[a + 1]!;
        if (offset >= left.offset && offset <= right.offset) {
          lo = left;
          hi = right;
          break;
        }
      }
      const spanOff = hi.offset - lo.offset || 1;
      const t = (offset - lo.offset) / spanOff;
      price = lerp(lo.price, hi.price, Math.min(1, Math.max(0, t)));
      // Gentle market variation so the area chart reads naturally between rolling windows.
      const wobble = offset === 0 ? 1 : 1 + Math.sin((i + s * 40) * 0.55) * 0.012;
      price *= wobble;
    } else {
      const drift = offset === 0 ? 0 : Math.sin((i + s * 20) * 0.35) * 0.06 + Math.cos((i + s * 11) * 0.17) * 0.03;
      const ramp = offset === 0 ? 0 : ((span - 1 - i) / Math.max(1, span - 1) - 0.5) * 0.08 * (s > 0.5 ? 1 : -1);
      price = spot * (1 + drift + ramp);
    }
    out.push({
      observed_at: new Date(now + offset * dayMs).toISOString(),
      amount: Math.max(0.01, Math.round(price * 100) / 100),
      source: fromWindows ? "tcgdex-window" : "demo",
      currency: activeCurrency,
    });
  }
  return out;
}

export function seriesToTrend(points: SeriesPoint[], fallbackCurrency = "USD"): TrendSummary | null {
  if (!points.length) return null;
  const prices = points.map((p) => p.amount);
  const last = prices[prices.length - 1];
  const first = prices[0];
  if (last === undefined) return null;
  const step = Math.max(1, Math.floor(prices.length / 14));
  const sampled = prices.filter((_, i) => i % step === 0 || i === prices.length - 1).slice(-14);
  const currency = points[points.length - 1]?.currency ?? fallbackCurrency;
  return {
    points: sampled,
    last,
    change: first ? ((last / first) - 1) * 100 : null,
    demo: points.some((p) => p.source === "demo" || p.source === "tcgdex-window"),
    currency,
  };
}
