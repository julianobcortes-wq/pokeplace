import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDemoMode } from "@/lib/demo-mode";
import { getDemoQuote } from "@/lib/demo-data";

export type PriceWindow = { label: string; days: number; price: number; currency: string };

export type TcgplayerSnapshot = {
  currency: string;
  market: number;
  low: number | null;
  mid: number | null;
  high: number | null;
  finish: string;
  updated: string | null;
};

export type CardmarketSnapshot = {
  currency: string;
  trend: number | null;
  avg: number | null;
  low: number | null;
  avg1: number | null;
  avg7: number | null;
  avg30: number | null;
  updated: string | null;
};

export type CardQuote = {
  cardId: string;
  available: boolean;
  /** Public source that published the figure. Never a made-up live price. */
  source: "tcgdex" | "indisponivel";
  sourceLabel: string;
  market: "tcgplayer" | "cardmarket" | null;
  currency: string | null;
  price: number | null;
  asOf: string | null;
  condition: string | null;
  windows: PriceWindow[];
  tcgplayer?: TcgplayerSnapshot | null;
  cardmarket?: CardmarketSnapshot | null;
  note: string;
};

type Bucket = { marketPrice?: number; lowPrice?: number; midPrice?: number; highPrice?: number };
type TcgPricing = {
  updated?: string;
  unit?: string;
  holofoil?: Bucket;
  normal?: Bucket;
  reverseHolofoil?: Bucket;
  "1stEditionHolofoil"?: Bucket;
  unlimitedHolofoil?: Bucket;
};
type CmPricing = {
  updated?: string;
  unit?: string;
  avg?: number | null;
  low?: number | null;
  trend?: number | null;
  avg1?: number | null;
  avg7?: number | null;
  avg30?: number | null;
};
type PricingBlock = {
  tcgplayer?: TcgPricing;
  cardmarket?: CmPricing;
};
type Variant = {
  subtype?: string;
  stamp?: string[];
  pricing?: PricingBlock;
};

const cache = new Map<string, { at: number; quote: CardQuote }>();
const TTL = 60 * 60 * 1000;
const CARD_ID_RE = /^[a-zA-Z0-9._-]{2,80}$/;

function unavailable(cardId: string, note: string): CardQuote {
  return {
    cardId,
    available: false,
    source: "indisponivel",
    sourceLabel: "Sem cotação",
    market: null,
    currency: null,
    price: null,
    asOf: null,
    condition: null,
    windows: [],
    tcgplayer: null,
    cardmarket: null,
    note,
  };
}

/**
 * Normalize card IDs between PokemonTCG dataset format (e.g. sv3pt5-199, sv1-1, swsh12pt5-160)
 * and TCGdex API format (e.g. sv03.5-199, sv01-001, swsh12.5-160).
 */
export function tcgdexCandidateIds(cardId: string): string[] {
  const candidates = new Set<string>([cardId]);
  const dash = cardId.indexOf("-");
  if (dash > 0) {
    const rawSet = cardId.slice(0, dash);
    const rawNum = cardId.slice(dash + 1);
    const normSet = rawSet
      .replace(/^sv(\d)pt(\d+)$/i, "sv0$1.$2")
      .replace(/^sv(\d+)$/i, (_, n: string) => `sv${n.padStart(2, "0")}`)
      .replace(/pt(\d+)$/i, ".$1");
    candidates.add(`${normSet}-${rawNum}`);
    if (/^\d{1,2}$/.test(rawNum)) {
      candidates.add(`${normSet}-${rawNum.padStart(3, "0")}`);
      candidates.add(`${rawSet}-${rawNum.padStart(3, "0")}`);
    }
  }
  return [...candidates];
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

function extractTcg(tcg: TcgPricing | undefined): TcgplayerSnapshot | null {
  if (!tcg) return null;
  const entries: [string, Bucket | undefined][] = [
    ["Holofoil", tcg.holofoil],
    ["Normal", tcg.normal],
    ["Reverse Holofoil", tcg.reverseHolofoil],
    ["Unlimited Holofoil", tcg.unlimitedHolofoil],
    ["1ª Edição Holofoil", tcg["1stEditionHolofoil"]],
  ];
  for (const [finish, bucket] of entries) {
    const market = finiteOrNull(bucket?.marketPrice) ?? finiteOrNull(bucket?.midPrice);
    if (market == null) continue;
    return {
      currency: tcg.unit ?? "USD",
      market,
      low: finiteOrNull(bucket?.lowPrice),
      mid: finiteOrNull(bucket?.midPrice),
      high: finiteOrNull(bucket?.highPrice),
      finish,
      updated: tcg.updated ?? null,
    };
  }
  return null;
}

function extractCm(cm: CmPricing | undefined): CardmarketSnapshot | null {
  if (!cm) return null;
  const trend = finiteOrNull(cm.trend);
  const avg = finiteOrNull(cm.avg);
  const avg1 = finiteOrNull(cm.avg1);
  const avg7 = finiteOrNull(cm.avg7);
  const avg30 = finiteOrNull(cm.avg30);
  const low = finiteOrNull(cm.low);
  if (trend == null && avg == null && avg7 == null && avg30 == null) return null;
  return {
    currency: cm.unit ?? "EUR",
    trend,
    avg,
    low,
    avg1,
    avg7,
    avg30,
    updated: cm.updated ?? null,
  };
}

export function parseTcgdexCardPricing(
  cardId: string,
  body: { variants_detailed?: Variant[]; pricing?: PricingBlock },
): CardQuote | null {
  const rankedVariants = [...(body.variants_detailed ?? [])].sort((a, b) => {
    const aFirst = a.stamp?.includes("1st-edition") ? 1 : 0;
    const bFirst = b.stamp?.includes("1st-edition") ? 1 : 0;
    return aFirst - bFirst;
  });

  const blocks: PricingBlock[] = [];
  for (const v of rankedVariants) {
    if (v.pricing) blocks.push(v.pricing);
  }
  if (body.pricing) blocks.push(body.pricing);

  let tcg: TcgplayerSnapshot | null = null;
  let cm: CardmarketSnapshot | null = null;

  for (const block of blocks) {
    if (!tcg) tcg = extractTcg(block.tcgplayer);
    if (!cm) cm = extractCm(block.cardmarket);
    if (tcg && cm) break;
  }

  const windows: PriceWindow[] = [];
  if (cm) {
    if (cm.avg1 != null) windows.push({ label: "Média 1 dia", days: 1, price: cm.avg1, currency: cm.currency });
    if (cm.avg7 != null) windows.push({ label: "Média 7 dias", days: 7, price: cm.avg7, currency: cm.currency });
    if (cm.avg30 != null) windows.push({ label: "Média 30 dias", days: 30, price: cm.avg30, currency: cm.currency });
  }

  if (tcg) {
    return {
      cardId,
      available: true,
      source: "tcgdex",
      sourceLabel: "TCGdex · preço de mercado TCGplayer",
      market: "tcgplayer",
      currency: tcg.currency,
      price: tcg.market,
      asOf: tcg.updated,
      condition: tcg.finish,
      windows,
      tcgplayer: tcg,
      cardmarket: cm,
      note: "Cotação pública via TCGdex (TCGplayer + Cardmarket). Referência internacional — não é venda liquidada no PokePlace.",
    };
  }

  if (cm) {
    const spot = cm.trend ?? cm.avg ?? cm.avg7 ?? cm.avg30;
    if (spot != null) {
      return {
        cardId,
        available: true,
        source: "tcgdex",
        sourceLabel: "TCGdex · tendência Cardmarket",
        market: "cardmarket",
        currency: cm.currency,
        price: spot,
        asOf: cm.updated,
        condition: "Tendência Cardmarket",
        windows,
        tcgplayer: null,
        cardmarket: cm,
        note: "Cotação pública via TCGdex (Cardmarket EUR). Referência internacional — não é venda liquidada no PokePlace.",
      };
    }
  }

  return null;
}

export async function quoteCard(cardId: string): Promise<CardQuote> {
  if (!CARD_ID_RE.test(cardId)) {
    return unavailable(cardId, "Código de carta inválido para consulta externa.");
  }
  const hit = cache.get(cardId);
  if (hit && Date.now() - hit.at < TTL) return hit.quote;

  const candidates = tcgdexCandidateIds(cardId);
  for (const candidate of candidates) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4500);
    try {
      const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(candidate)}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { variants_detailed?: Variant[]; pricing?: PricingBlock };
      const quote = parseTcgdexCardPricing(cardId, body);
      if (quote) {
        cache.set(cardId, { at: Date.now(), quote });
        return quote;
      }
      const empty = isDemoMode()
        ? getDemoQuote(cardId)
        : unavailable(cardId, "A TCGdex não publicou market price para esta carta.");
      cache.set(cardId, { at: Date.now(), quote: empty });
      return empty;
    } catch {
      /* tenta próximo candidato ou devolve indisponível */
    } finally {
      clearTimeout(timer);
    }
  }

  if (isDemoMode()) {
    const fallback = getDemoQuote(cardId);
    cache.set(cardId, { at: Date.now(), quote: fallback });
    return fallback;
  }

  return unavailable(cardId, "Não foi possível consultar a TCGdex agora. Nenhum preço foi estimado no lugar.");
}

const idInput = z.object({ id: z.string().min(1).max(80) });

export const getCardQuote = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => idInput.parse(d))
  .handler(async ({ data }) => quoteCard(data.id));

export const getCollectionValue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => z.object({ ids: z.array(z.string().min(1).max(40)).max(24) }).parse(d))
  .handler(async ({ data }) => {
    const quotes = await Promise.all(data.ids.map((id) => quoteCard(id)));
    const priced = quotes.filter((q) => q.available && q.price != null && q.currency);
    const currencies = [...new Set(priced.map((q) => q.currency))];
    const single = currencies.length === 1 ? currencies[0] : null;
    const total = single ? priced.reduce((sum, q) => sum + (q.price ?? 0), 0) : null;
    return {
      quotes,
      pricedCount: single ? priced.length : priced.filter((q) => q.currency === single).length,
      total,
      currency: single,
      sourceLabel: "TCGdex · TCGplayer / Cardmarket",
      note: single
        ? "Soma das cotações disponíveis da amostra. Cartas sem preço ficam de fora. Não é patrimônio em real."
        : "Há mais de uma moeda ou nenhuma cotação. A soma não é exibida para não misturar moedas.",
    };
  });
