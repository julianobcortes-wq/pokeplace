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

/** Deterministic FNV-1a 32-bit hash for stable seeded series per card & currency. */
function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Fast deterministic PRNG returning uniform [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approximate standard normal sample using sum of 3 uniforms (bounded, realistic tails). */
function normalSample(rand: () => number): number {
  return (rand() + rand() + rand() - 1.5) * 1.15;
}

/**
 * Generates an organic financial Brownian bridge between two anchor prices over `steps` days
 * so charts exhibit natural daily market ticks instead of sine waves or flat lines.
 */
function buildBrownianBridge(start: number, end: number, steps: number, vol: number, rand: () => number): number[] {
  if (steps <= 0) return [end];
  const walk: number[] = [0];
  let acc = 0;
  for (let i = 1; i <= steps; i++) {
    acc += normalSample(rand) * vol;
    walk.push(acc);
  }
  const endWalk = walk[steps] ?? 0;
  const out: number[] = [];
  const logStart = Math.log(Math.max(0.01, start));
  const logEnd = Math.log(Math.max(0.01, end));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bridge = (walk[i] ?? 0) - t * endWalk;
    const logVal = logStart + (logEnd - logStart) * t + bridge;
    out.push(Math.max(0.01, Math.exp(logVal)));
  }
  out[0] = start;
  out[steps] = end;
  return out;
}

/**
 * Build a daily reference series for charts when the DB has no sales history.
 * Prefer published Cardmarket windows + same-currency spot; otherwise a deterministic
 * financial random walk anchored strictly at the real TCGdex spot price.
 */
export function buildReferenceSeries(
  quote: CardQuote | undefined,
  days: number | null,
  preferredMarket?: "tcgplayer" | "cardmarket",
  fxConversion?: { currency: string; multiplier: number },
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

  // Clamp single-day outlier spikes gently (e.g., damaged/1st-ed outlier in avg1) while preserving real trend direction.
  const clampAnchor = (raw: number, ref: number, maxRatio = 1.45) =>
    Math.min(ref * maxRatio, Math.max(ref / maxRatio, raw));

  const anchors: { offset: number; price: number }[] = [{ offset: 0, price: spot }];
  if (byDays.has(1)) anchors.push({ offset: -1, price: clampAnchor(byDays.get(1)!, spot, 1.3) });
  if (byDays.has(7)) anchors.push({ offset: -7, price: clampAnchor(byDays.get(7)!, spot, 1.45) });
  if (byDays.has(30)) anchors.push({ offset: -30, price: clampAnchor(byDays.get(30)!, spot, 1.55) });
  anchors.sort((a, b) => a.offset - b.offset);

  const fromWindows = anchors.length >= 2;
  const rand = mulberry32(hashSeed(`${quote.cardId}:${activeCurrency}`));

  // Generate full 365-day deterministic path first so slicing 7D / 1M / 3M stays consistent across range switches!
  const maxDays = Math.max(span, 90);
  const dailyByOffset = new Map<number, number>();
  dailyByOffset.set(0, spot);

  if (fromWindows) {
    // 1. Bridge smoothly between real rolling anchors (e.g. -30 -> -7 -> -1 -> 0)
    for (let a = 0; a < anchors.length - 1; a++) {
      const left = anchors[a]!;
      const right = anchors[a + 1]!;
      const segSteps = right.offset - left.offset;
      const seg = buildBrownianBridge(left.price, right.price, segSteps, 0.011, rand);
      for (let k = 0; k <= segSteps; k++) {
        dailyByOffset.set(left.offset + k, seg[k]!);
      }
    }
    // 2. Extend organically before the earliest anchor (e.g. -30 back to -maxDays) so 3M+ charts never draw a flat line
    const earliest = anchors[0]!;
    const preSteps = maxDays - 1 + earliest.offset;
    if (preSteps > 0) {
      const slopeBias = Math.max(-0.08, Math.min(0.08, (spot / earliest.price - 1) * 0.35));
      const startGuess = Math.max(0.01, earliest.price * (1 - slopeBias + (rand() - 0.5) * 0.12));
      const pre = buildBrownianBridge(startGuess, earliest.price, preSteps, 0.014, rand);
      for (let k = 0; k < preSteps; k++) {
        dailyByOffset.set(-(maxDays - 1) + k, pre[k]!);
      }
    }
  } else {
    // Realistic mean-reverting market path ending exactly at spot on day 0
    const driftPct = (rand() - 0.44) * 0.24; // slight realistic variety (-10.5% to +13.5% over 90d)
    const startPrice = Math.max(0.01, spot / (1 + driftPct));
    const path = buildBrownianBridge(startPrice, spot, maxDays - 1, 0.016, rand);
    for (let k = 0; k < maxDays; k++) {
      dailyByOffset.set(-(maxDays - 1) + k, path[k]!);
    }
  }

  const outCurrency = fxConversion?.currency ?? activeCurrency;
  const mult = fxConversion?.multiplier && fxConversion.multiplier > 0 ? fxConversion.multiplier : 1;

  const out: SeriesPoint[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const offset = -i;
    const raw = (dailyByOffset.get(offset) ?? spot) * mult;
    out.push({
      observed_at: new Date(now + offset * dayMs).toISOString(),
      amount: Math.max(0.01, Math.round(raw * 100) / 100),
      source: fromWindows ? "tcgdex-window" : "demo",
      currency: outCurrency,
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
  const step = Math.max(1, Math.floor(prices.length / 24));
  const sampled = prices.filter((_, i) => i % step === 0 || i === prices.length - 1).slice(-24);
  const currency = points[points.length - 1]?.currency ?? fallbackCurrency;
  return {
    points: sampled,
    last,
    change: first ? ((last / first) - 1) * 100 : null,
    demo: points.some((p) => p.source === "demo" || p.source === "tcgdex-window"),
    currency,
  };
}
