import type { CardQuote } from "./quote";

export type SeriesPoint = {
  observed_at: string;
  amount: number;
  source: string;
  locked?: boolean;
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
 * Prefer published Cardmarket windows + TCGplayer spot; otherwise a marked demo path.
 */
export function buildReferenceSeries(quote: CardQuote | undefined, days: number | null): SeriesPoint[] {
  const span = Math.max(7, Math.min(days ?? 90, 365));
  const now = Date.now();
  const dayMs = 86_400_000;

  if (!quote?.available || quote.price == null || !Number.isFinite(quote.price)) return [];

  const spot = quote.price;
  const currency = quote.currency;
  // Never mix Cardmarket EUR windows with a TCGplayer USD spot on the same axis.
  const sameCurrency = quote.windows.filter((w) => !currency || w.currency === currency);
  const byDays = new Map(sameCurrency.map((w) => [w.days, w.price]));
  const anchors: { offset: number; price: number }[] = [{ offset: 0, price: spot }];
  if (byDays.has(1)) anchors.push({ offset: -1, price: byDays.get(1)! });
  if (byDays.has(7)) anchors.push({ offset: -7, price: byDays.get(7)! });
  if (byDays.has(30)) anchors.push({ offset: -30, price: byDays.get(30)! });
  anchors.sort((a, b) => a.offset - b.offset);

  const fromWindows = anchors.length >= 2;
  const s = seed(quote.cardId);
  const out: SeriesPoint[] = [];

  for (let i = span - 1; i >= 0; i--) {
    const offset = -i;
    let price: number;
    if (fromWindows) {
      let lo = anchors[0];
      let hi = anchors[anchors.length - 1];
      for (let a = 0; a < anchors.length - 1; a++) {
        if (offset >= anchors[a].offset && offset <= anchors[a + 1].offset) {
          lo = anchors[a];
          hi = anchors[a + 1];
          break;
        }
      }
      const spanOff = hi.offset - lo.offset || 1;
      const t = (offset - lo.offset) / spanOff;
      price = lerp(lo.price, hi.price, Math.min(1, Math.max(0, t)));
      // tiny wobble so the area chart reads as a live market, not a straight line
      const wobble = 1 + Math.sin((i + s * 40) * 0.55) * 0.012;
      price *= wobble;
    } else {
      const drift = Math.sin((i + s * 20) * 0.35) * 0.06 + Math.cos((i + s * 11) * 0.17) * 0.03;
      const ramp = ((span - 1 - i) / Math.max(1, span - 1) - 0.5) * 0.08 * (s > 0.5 ? 1 : -1);
      price = spot * (1 + drift + ramp);
    }
    out.push({
      observed_at: new Date(now + offset * dayMs).toISOString(),
      amount: Math.round(price * 100) / 100,
      source: fromWindows ? "tcgdex-window" : "demo",
    });
  }
  return out;
}

export function seriesToTrend(points: SeriesPoint[]) {
  if (!points.length) return null;
  const prices = points.map((p) => p.amount);
  const last = prices[prices.length - 1];
  const first = prices[0];
  const step = Math.max(1, Math.floor(prices.length / 14));
  const sampled = prices.filter((_, i) => i % step === 0 || i === prices.length - 1).slice(-14);
  return {
    points: sampled,
    last,
    change: first ? ((last / first) - 1) * 100 : null,
    demo: points.some((p) => p.source === "demo" || p.source === "tcgdex-window"),
  };
}
