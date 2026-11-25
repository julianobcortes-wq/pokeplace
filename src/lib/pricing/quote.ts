import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PriceWindow = { label: string; days: number; price: number; currency: string };

export type CardQuote = {
  cardId: string;
  available: boolean;
  /** Public source that published the figure. Never a made-up live price. */
  source: "tcgdex" | "indisponivel";
  sourceLabel: string;
  market: "tcgplayer" | null;
  currency: string | null;
  price: number | null;
  asOf: string | null;
  condition: string | null;
  windows: PriceWindow[];
  note: string;
};

type Bucket = { marketPrice?: number; lowPrice?: number; midPrice?: number };
type Variant = {
  subtype?: string;
  stamp?: string[];
  pricing?: {
    tcgplayer?: { updated?: string; unit?: string; holofoil?: Bucket; normal?: Bucket; reverseHolofoil?: Bucket };
    cardmarket?: { unit?: string; avg1?: number | null; avg7?: number | null; avg30?: number | null };
  };
};

const cache = new Map<string, { at: number; quote: CardQuote }>();
const TTL = 60 * 60 * 1000;

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
    note,
  };
}

function fromVariants(cardId: string, variants: Variant[]): CardQuote | null {
  const ranked = [...variants].sort((a, b) => {
    const aFirst = a.stamp?.includes("1st-edition") ? 1 : 0;
    const bFirst = b.stamp?.includes("1st-edition") ? 1 : 0;
    return aFirst - bFirst;
  });
  for (const variant of ranked) {
    const tcg = variant.pricing?.tcgplayer;
    const bucket = tcg?.holofoil ?? tcg?.normal ?? tcg?.reverseHolofoil;
    const price = bucket?.marketPrice;
    if (price == null || !Number.isFinite(price)) continue;
    const cm = variant.pricing?.cardmarket;
    const windows: PriceWindow[] = [];
    if (cm?.unit && typeof cm.avg1 === "number") windows.push({ label: "Média 1 dia", days: 1, price: cm.avg1, currency: cm.unit });
    if (cm?.unit && typeof cm.avg7 === "number") windows.push({ label: "Média 7 dias", days: 7, price: cm.avg7, currency: cm.unit });
    if (cm?.unit && typeof cm.avg30 === "number") windows.push({ label: "Média 30 dias", days: 30, price: cm.avg30, currency: cm.unit });
    const finish = tcg?.holofoil ? "Holofoil" : tcg?.normal ? "Normal" : "Reverse Holofoil";
    return {
      cardId,
      available: true,
      source: "tcgdex",
      sourceLabel: "TCGdex · preço de mercado TCGplayer",
      market: "tcgplayer",
      currency: tcg?.unit ?? "USD",
      price,
      asOf: tcg?.updated ?? null,
      condition: finish,
      windows,
      note: "Cotação publicada pela TCGdex a partir do TCGplayer. Não é venda liquidada no PokePlace nem preço em real.",
    };
  }
  return null;
}

export async function quoteCard(cardId: string): Promise<CardQuote> {
  const hit = cache.get(cardId);
  if (hit && Date.now() - hit.at < TTL) return hit.quote;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(cardId)}`, { signal: ctrl.signal });
    if (!res.ok) return unavailable(cardId, "A TCGdex não devolveu preço para esta carta.");
    const body = (await res.json()) as { variants_detailed?: Variant[] };
    const quote = fromVariants(cardId, body.variants_detailed ?? []) ?? unavailable(cardId, "A TCGdex não publicou market price para esta carta.");
    cache.set(cardId, { at: Date.now(), quote });
    return quote;
  } catch {
    return unavailable(cardId, "Não foi possível consultar a TCGdex agora. Nenhum preço foi estimado no lugar.");
  } finally {
    clearTimeout(timer);
  }
}

const idInput = z.object({ id: z.string().min(1).max(80) });

export const getCardQuote = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => idInput.parse(d))
  .handler(async ({ data }) => quoteCard(data.id));

export const getCollectionValue = createServerFn({ method: "GET" })
  .inputValidator((d: { ids: string[] }) => z.object({ ids: z.array(z.string().min(1).max(80)).max(40) }).parse(d))
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
      sourceLabel: "TCGdex · TCGplayer",
      note: single
        ? "Soma das cotações disponíveis da amostra. Cartas sem preço ficam de fora. Não é patrimônio em real."
        : "Há mais de uma moeda ou nenhuma cotação. A soma não é exibida para não misturar moedas.",
    };
  });
