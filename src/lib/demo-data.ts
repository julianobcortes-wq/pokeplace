import { localAllCards, localCard, localTrending } from "@/lib/catalog/local";
import type { CardQuote } from "@/lib/pricing/quote";
import { buildReferenceSeries, seriesToTrend, type TrendSummary } from "@/lib/pricing/series";
import type { RankedBuyer, RankedSeller } from "@/lib/marketplace/ranking.functions";
import type { BuyerTier, SellerMedal, StrikeStatus, ThermometerLevel } from "@/lib/marketplace/rules";
import type { VolumeDiscountTier } from "@/lib/marketplace/promotions";
import type { ShippingProfileLike } from "@/lib/marketplace/shipping";
import type { CartItem } from "@/lib/cart";
import { DEMO_COUPON_CODE } from "./demo-mode";

export type DemoStore = {
  id: string;
  store_name: string;
  slug: string;
  city: string;
  state: string;
  is_official: boolean;
  logo_url: null;
  cover_url: null;
  bio: string;
  shipping_policy: string;
  return_policy: string;
  created_at: string;
  rating: number;
  reviews: number;
  completed_sales: number;
  active_listings: number;
  claim_rate: number;
  cancel_rate: number;
  on_time_rate: number;
  avg_response_hours: number;
  thermometer: ThermometerLevel;
  medal: SellerMedal;
  strike_status: StrikeStatus;
  score: number;
  level: string;
  service_rating: number;
  packaging_rating: number;
  shipping_rating: number;
  shippingProfile: ShippingProfileLike;
  volumeTiers: (VolumeDiscountTier & { seller_id: string })[];
  sampleReviews: {
    id: string;
    rating_service: number;
    rating_packaging: number;
    rating_shipping: number;
    comment: string;
    reply: string | null;
    replied_at: string | null;
    created_at: string;
  }[];
};

export const DEMO_STORES: DemoStore[] = [
  {
    id: "demo-store-pokevault-sp",
    store_name: "PokeVault SP (Demo)",
    slug: "pokevault-sp",
    city: "São Paulo",
    state: "SP",
    is_official: true,
    logo_url: null,
    cover_url: null,
    bio: "Loja demonstrativa especializada em cartas raras, vintage Base Set/Neo e staples competitivos. Envio com toploader, sleeve dupla e proteção rígida.",
    shipping_policy: "Postagem em até 24h úteis via Correios/Jadlog com código de rastreio. Frete grátis acima de R$ 250.",
    return_policy: "Garantia de autenticidade e arrependimento em até 7 dias corridos após o recebimento (CDC Art. 49).",
    created_at: "2025-02-10T12:00:00Z",
    rating: 4.9,
    reviews: 148,
    completed_sales: 412,
    active_listings: 128,
    claim_rate: 0.4,
    cancel_rate: 0.5,
    on_time_rate: 99.1,
    avg_response_hours: 1.2,
    thermometer: "green",
    medal: "lider_platinum",
    strike_status: "ok",
    score: 98.4,
    level: "excelente",
    service_rating: 4.9,
    packaging_rating: 5.0,
    shipping_rating: 4.9,
    shippingProfile: {
      flat_fee: 18,
      free_over: 250,
      state_rates: { SP: 12, RJ: 16, MG: 16, PR: 16, SC: 18, RS: 19 },
    },
    volumeTiers: [
      { id: "tier-pv-1", seller_id: "demo-store-pokevault-sp", min_qty: 3, discount_pct: 5, active: true },
      { id: "tier-pv-2", seller_id: "demo-store-pokevault-sp", min_qty: 5, discount_pct: 10, active: true },
    ],
    sampleReviews: [
      {
        id: "rev-pv-1",
        rating_service: 5,
        rating_packaging: 5,
        rating_shipping: 5,
        comment: "Carta impecável em Near Mint real, veio com sleeve dupla, toploader e papelão reforçado.",
        reply: "Obrigado pela confiança! Sempre embalamos pensando em colecionadores exigentes.",
        replied_at: "2026-10-18T14:20:00Z",
        created_at: "2026-10-18T11:05:00Z",
      },
      {
        id: "rev-pv-2",
        rating_service: 5,
        rating_packaging: 5,
        rating_shipping: 5,
        comment: "Envio no mesmo dia para SP, chegou super rápido e bem protegido.",
        reply: null,
        replied_at: null,
        created_at: "2026-10-09T18:30:00Z",
      },
    ],
  },
  {
    id: "demo-store-charizard-rj",
    store_name: "Charizard Club RJ (Demo)",
    slug: "charizard-club-rj",
    city: "Rio de Janeiro",
    state: "RJ",
    is_official: false,
    logo_url: null,
    cover_url: null,
    bio: "Loja demonstrativa focada em ilustrações especiais (SIR), cartas graduadas PSA/CGC e expansões Scarlet & Violet / 151.",
    shipping_policy: "Despacho em até 1 dia útil com seguro opcional. Frete grátis acima de R$ 200.",
    return_policy: "Devolução sem burocracia dentro do prazo de 7 dias com embalagem intacta.",
    created_at: "2025-05-14T15:00:00Z",
    rating: 4.8,
    reviews: 89,
    completed_sales: 218,
    active_listings: 94,
    claim_rate: 0.9,
    cancel_rate: 0.9,
    on_time_rate: 97.6,
    avg_response_hours: 2.1,
    thermometer: "green",
    medal: "lider_gold",
    strike_status: "ok",
    score: 95.2,
    level: "excelente",
    service_rating: 4.8,
    packaging_rating: 4.9,
    shipping_rating: 4.8,
    shippingProfile: {
      flat_fee: 17,
      free_over: 200,
      state_rates: { RJ: 11, SP: 15, MG: 15, ES: 15 },
    },
    volumeTiers: [
      { id: "tier-cc-1", seller_id: "demo-store-charizard-rj", min_qty: 3, discount_pct: 5, active: true },
    ],
    sampleReviews: [
      {
        id: "rev-cc-1",
        rating_service: 5,
        rating_packaging: 5,
        rating_shipping: 5,
        comment: "Atendimento muito ágil no chat e o Charizard chegou exatamente como nas fotos.",
        reply: "Valeu demais! Boas trocas e boas compras.",
        replied_at: "2026-10-12T10:15:00Z",
        created_at: "2026-10-11T19:40:00Z",
      },
    ],
  },
  {
    id: "demo-store-eevee-sul",
    store_name: "Eevee Cards Sul (Demo)",
    slug: "eevee-cards-sul",
    city: "Curitiba",
    state: "PR",
    is_official: false,
    logo_url: null,
    cover_url: null,
    bio: "Loja demonstrativa do Sul do Brasil com foco em Eeveelutions, Evolving Skies, Prismatic Evolutions e cartas japonesas.",
    shipping_policy: "Postagem de segunda a sexta. Frete grátis para pedidos acima de R$ 180.",
    return_policy: "Troca ou reembolso integral em caso de divergência de condição.",
    created_at: "2025-08-22T09:30:00Z",
    rating: 4.9,
    reviews: 64,
    completed_sales: 145,
    active_listings: 76,
    claim_rate: 0.7,
    cancel_rate: 1.1,
    on_time_rate: 96.8,
    avg_response_hours: 2.8,
    thermometer: "green",
    medal: "lider",
    strike_status: "ok",
    score: 93.7,
    level: "excelente",
    service_rating: 4.9,
    packaging_rating: 4.9,
    shipping_rating: 4.8,
    shippingProfile: {
      flat_fee: 16,
      free_over: 180,
      state_rates: { PR: 10, SC: 12, RS: 14, SP: 15 },
    },
    volumeTiers: [],
    sampleReviews: [
      {
        id: "rev-ee-1",
        rating_service: 5,
        rating_packaging: 5,
        rating_shipping: 4,
        comment: "Embalagem excelente com cartinha de agradecimento e brinde!",
        reply: null,
        replied_at: null,
        created_at: "2026-10-03T16:10:00Z",
      },
    ],
  },
  {
    id: "demo-store-kanto-mg",
    store_name: "Kanto Colecionáveis MG (Demo)",
    slug: "kanto-colecionaveis-mg",
    city: "Belo Horizonte",
    state: "MG",
    is_official: false,
    logo_url: null,
    cover_url: null,
    bio: "Loja demonstrativa com acervo variado de cartas avulsas em português e inglês, ideal para completar coleções.",
    shipping_policy: "Envio econômico ou expresso para todo o Brasil em até 48h úteis.",
    return_policy: "Seguimos integralmente a política de Compra Garantida PokePlace.",
    created_at: "2025-11-05T13:00:00Z",
    rating: 4.7,
    reviews: 31,
    completed_sales: 84,
    active_listings: 62,
    claim_rate: 1.2,
    cancel_rate: 1.4,
    on_time_rate: 95.4,
    avg_response_hours: 4.5,
    thermometer: "light_green",
    medal: "none",
    strike_status: "ok",
    score: 88.5,
    level: "excelente",
    service_rating: 4.7,
    packaging_rating: 4.8,
    shipping_rating: 4.6,
    shippingProfile: {
      flat_fee: 19,
      free_over: 220,
      state_rates: { MG: 12, SP: 16, RJ: 16, ES: 16 },
    },
    volumeTiers: [],
    sampleReviews: [
      {
        id: "rev-km-1",
        rating_service: 5,
        rating_packaging: 5,
        rating_shipping: 4,
        comment: "Ótimo preço nas avulsas para completar meu fichário de 151.",
        reply: null,
        replied_at: null,
        created_at: "2026-09-28T12:00:00Z",
      },
    ],
  },
];

/** Curated USD reference spot anchors (used only as fallback in demo mode if TCGdex lacks data). */
const CURATED_USD_PRICE: Record<string, number> = {
  "base1-4": 385,
  "sv08.5-161": 620,
  "sv8pt5-161": 620,
  "swsh7-95": 18.5,
  "swsh7-215": 890,
  "sv03.5-151": 22,
  "sv03.5-183": 42,
  "sv03.5-199": 215,
  "sv3pt5-199": 215,
  "neo1-9": 260,
  "base1-2": 115,
  "base1-10": 48,
  "base1-15": 85,
  "base1-58": 6.5,
  "base3-5": 72,
  "swsh7-111": 14,
  "swsh12.5-019": 9.5,
};

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getDemoUsdPrice(cardId: string): number {
  const known = CURATED_USD_PRICE[cardId];
  if (known != null) return known;
  const h = hashString(cardId);
  // Deterministic realistic distribution from $1.80 to $48.00
  const bucket = h % 100;
  if (bucket < 55) return Math.round((1.8 + ((h >>> 7) % 620) / 100) * 100) / 100;
  if (bucket < 85) return Math.round((8 + ((h >>> 7) % 1800) / 100) * 100) / 100;
  return Math.round((26 + ((h >>> 7) % 5400) / 100) * 100) / 100;
}

export function getDemoQuote(cardId: string): CardQuote {
  const usd = getDemoUsdPrice(cardId);
  const eur = Math.round(usd * 0.92 * 100) / 100;
  const h = hashString(cardId);
  const drift = (((h % 23) - 10) / 100); // -10% to +12%
  const avg30 = Math.max(0.5, Math.round(eur * (1 - drift) * 100) / 100);
  const avg7 = Math.max(0.5, Math.round(eur * (1 - drift * 0.35) * 100) / 100);
  const today = new Date().toISOString().slice(0, 10);
  return {
    cardId,
    available: true,
    source: "tcgdex",
    sourceLabel: "Referência demonstrativa · TCGdex",
    market: "tcgplayer",
    currency: "USD",
    price: usd,
    asOf: today,
    condition: "Holofoil",
    windows: [
      { label: "Média 1 dia", days: 1, price: eur, currency: "EUR" },
      { label: "Média 7 dias", days: 7, price: avg7, currency: "EUR" },
      { label: "Média 30 dias", days: 30, price: avg30, currency: "EUR" },
    ],
    tcgplayer: {
      currency: "USD",
      market: usd,
      low: Math.round(usd * 0.84 * 100) / 100,
      mid: Math.round(usd * 1.03 * 100) / 100,
      high: Math.round(usd * 1.35 * 100) / 100,
      finish: "Holofoil",
      updated: today,
    },
    cardmarket: {
      currency: "EUR",
      trend: eur,
      avg: avg7,
      low: Math.round(eur * 0.8 * 100) / 100,
      avg1: eur,
      avg7,
      avg30,
      updated: today,
    },
    note: "Curva de referência demonstrativa em BRL usada quando a cotação externa não está disponível.",
  };
}

export function getDemoTrend(cardId: string, usdToBrl = 5.75): TrendSummary {
  const quote = getDemoQuote(cardId);
  const series = buildReferenceSeries(quote, 90, undefined, { currency: "BRL", multiplier: usdToBrl });
  const trend = seriesToTrend(series, "BRL");
  if (trend) return trend;
  const brl = Math.round(getDemoUsdPrice(cardId) * usdToBrl * 100) / 100;
  return { points: [brl * 0.96, brl * 0.98, brl], last: brl, change: 4.2, demo: true, currency: "BRL" };
}

export type DemoOfferRow = {
  listing_id: string;
  seller_id: string;
  store_name: string;
  store_slug: string;
  is_official: boolean;
  city: string;
  state: string;
  rating: number;
  reviews: number;
  completed_sales: number;
  logo_url: null;
  price: number;
  currency: string;
  condition: string;
  language: string;
  finish: string;
  quantity: number;
  graded: boolean;
  grade_company: string | null;
  grade: string | null;
  notes: string | null;
};

export function getDemoCardOffers(cardId: string, usdToBrl = 5.75): DemoOfferRow[] {
  const baseBrl = Math.max(5, Math.round(getDemoUsdPrice(cardId) * usdToBrl * 100) / 100);
  const h = hashString(cardId);
  const offers: DemoOfferRow[] = [
    {
      listing_id: `demo-listing-${cardId}-1`,
      seller_id: DEMO_STORES[0]!.id,
      store_name: DEMO_STORES[0]!.store_name,
      store_slug: DEMO_STORES[0]!.slug,
      is_official: DEMO_STORES[0]!.is_official,
      city: DEMO_STORES[0]!.city,
      state: DEMO_STORES[0]!.state,
      rating: DEMO_STORES[0]!.rating,
      reviews: DEMO_STORES[0]!.reviews,
      completed_sales: DEMO_STORES[0]!.completed_sales,
      logo_url: null,
      price: Math.round(baseBrl * 0.95 * 100) / 100,
      currency: "BRL",
      condition: "NM",
      language: "PT",
      finish: "holo",
      quantity: 2 + (h % 4),
      graded: false,
      grade_company: null,
      grade: null,
      notes: "Envio com sleeve dupla e toploader rígido. Oferta demonstrativa.",
    },
    {
      listing_id: `demo-listing-${cardId}-2`,
      seller_id: DEMO_STORES[1]!.id,
      store_name: DEMO_STORES[1]!.store_name,
      store_slug: DEMO_STORES[1]!.slug,
      is_official: DEMO_STORES[1]!.is_official,
      city: DEMO_STORES[1]!.city,
      state: DEMO_STORES[1]!.state,
      rating: DEMO_STORES[1]!.rating,
      reviews: DEMO_STORES[1]!.reviews,
      completed_sales: DEMO_STORES[1]!.completed_sales,
      logo_url: null,
      price: Math.round(baseBrl * 1.04 * 100) / 100,
      currency: "BRL",
      condition: "NM",
      language: "EN",
      finish: "holo",
      quantity: 1 + (h % 3),
      graded: false,
      grade_company: null,
      grade: null,
      notes: "Edição em inglês bem centralizada. Oferta demonstrativa.",
    },
    {
      listing_id: `demo-listing-${cardId}-3`,
      seller_id: DEMO_STORES[2]!.id,
      store_name: DEMO_STORES[2]!.store_name,
      store_slug: DEMO_STORES[2]!.slug,
      is_official: DEMO_STORES[2]!.is_official,
      city: DEMO_STORES[2]!.city,
      state: DEMO_STORES[2]!.state,
      rating: DEMO_STORES[2]!.rating,
      reviews: DEMO_STORES[2]!.reviews,
      completed_sales: DEMO_STORES[2]!.completed_sales,
      logo_url: null,
      price: Math.round(baseBrl * 0.82 * 100) / 100,
      currency: "BRL",
      condition: "SP",
      language: "PT",
      finish: "normal",
      quantity: 3,
      graded: false,
      grade_company: null,
      grade: null,
      notes: "Leve marca de uso na borda traseira (Slightly Played). Oferta demonstrativa.",
    },
  ];
  if (baseBrl >= 150) {
    offers.push({
      listing_id: `demo-listing-${cardId}-4`,
      seller_id: DEMO_STORES[3]!.id,
      store_name: DEMO_STORES[3]!.store_name,
      store_slug: DEMO_STORES[3]!.slug,
      is_official: DEMO_STORES[3]!.is_official,
      city: DEMO_STORES[3]!.city,
      state: DEMO_STORES[3]!.state,
      rating: DEMO_STORES[3]!.rating,
      reviews: DEMO_STORES[3]!.reviews,
      completed_sales: DEMO_STORES[3]!.completed_sales,
      logo_url: null,
      price: Math.round(baseBrl * 1.55 * 100) / 100,
      currency: "BRL",
      condition: "M",
      language: "EN",
      finish: "holo",
      quantity: 1,
      graded: true,
      grade_company: "PSA",
      grade: "9",
      notes: "Case PSA 9 lacrada com selo holográfico. Oferta demonstrativa.",
    });
  }
  return offers.sort((a, b) => a.price - b.price);
}

export function getDemoLatestListings() {
  const trending = localTrending();
  return trending.slice(0, 12).map((card, i) => {
    const offers = getDemoCardOffers(card.id);
    const pick = offers[i % offers.length] ?? offers[0]!;
    return {
      id: pick.listing_id,
      price: pick.price,
      currency: pick.currency,
      condition: pick.condition,
      card_id: card.id,
      cards: {
        name: card.name,
        number: card.number,
        image_small: card.image_small,
        card_sets: { name: card.card_sets.name },
      },
    };
  });
}

export function getDemoPublicStores() {
  return DEMO_STORES.map((s) => ({
    id: s.id,
    store_name: s.store_name,
    slug: s.slug,
    city: s.city,
    state: s.state,
    is_official: s.is_official,
    logo_url: s.logo_url,
    rating: s.rating,
    reviews: s.reviews,
    completed_sales: s.completed_sales,
    active_listings: s.active_listings,
  }));
}

export function getDemoStoreBySlug(slug: string) {
  const s = DEMO_STORES.find((x) => x.slug === slug);
  if (!s) return null;
  const pool = [...localTrending(), ...localAllCards().slice(0, 32)];
  const seen = new Set<string>();
  const uniqueCards = pool.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  const storeIdx = DEMO_STORES.indexOf(s);
  const listings = uniqueCards
    .filter((_, idx) => idx % DEMO_STORES.length === storeIdx || idx < 6)
    .slice(0, 12)
    .map((c) => {
      const offer = getDemoCardOffers(c.id).find((o) => o.seller_id === s.id) ?? getDemoCardOffers(c.id)[0]!;
      return {
        id: offer.listing_id,
        price: offer.price,
        currency: offer.currency,
        condition: offer.condition,
        language: offer.language,
        finish: offer.finish,
        quantity: offer.quantity,
        card_id: c.id,
        cards: {
          name: c.name,
          number: c.number,
          rarity: c.rarity,
          image_small: c.image_small,
          card_sets: { name: c.card_sets.name },
        },
      };
    });

  return {
    store: {
      id: s.id,
      store_name: s.store_name,
      slug: s.slug,
      city: s.city,
      state: s.state,
      is_official: s.is_official,
      logo_url: s.logo_url,
      cover_url: s.cover_url,
      bio: s.bio,
      shipping_policy: s.shipping_policy,
      return_policy: s.return_policy,
      created_at: s.created_at,
    },
    reputation: {
      rating: s.rating,
      reviews: s.reviews,
      completed_sales: s.completed_sales,
      total_items: s.completed_sales + 4,
      cancelled: 2,
      level: s.level,
      service_rating: s.service_rating,
      packaging_rating: s.packaging_rating,
      shipping_rating: s.shipping_rating,
    },
    thermometer: {
      claim_rate: s.claim_rate,
      cancel_rate: s.cancel_rate,
      on_time_rate: s.on_time_rate,
      avg_response_hours: s.avg_response_hours,
      thermometer: s.thermometer,
      medal: s.medal,
      strike_status: s.strike_status,
      score: s.score,
    },
    listings,
    reviews: s.sampleReviews,
  };
}

export function getDemoSellerRankings(input: {
  state?: string | undefined;
  sort?: "score" | "sales" | "rating" | undefined;
  limit?: number | undefined;
}): RankedSeller[] {
  const uf = input.state?.trim().toUpperCase() || "";
  const sort = input.sort ?? "score";
  const list: RankedSeller[] = DEMO_STORES.filter((s) => !uf || s.state === uf).map((s) => ({
    id: s.id,
    store_name: s.store_name,
    slug: s.slug,
    city: s.city,
    state: s.state,
    is_official: s.is_official,
    logo_url: s.logo_url,
    rating: s.rating,
    reviews: s.reviews,
    completed_sales: s.completed_sales,
    active_listings: s.active_listings,
    claim_rate: s.claim_rate,
    cancel_rate: s.cancel_rate,
    on_time_rate: s.on_time_rate,
    avg_response_hours: s.avg_response_hours,
    thermometer: s.thermometer,
    medal: s.medal,
    strike_status: s.strike_status,
    score: s.score,
  }));
  list.sort((a, b) =>
    sort === "sales"
      ? b.completed_sales - a.completed_sales
      : sort === "rating"
        ? b.rating - a.rating
        : b.score - a.score,
  );
  return list.slice(0, input.limit ?? 50);
}

export function getDemoBuyerRankings(): RankedBuyer[] {
  const rows: { name: string; purchases: number; rating: number; reviews: number; tier: BuyerTier; score: number }[] = [
    { name: "RedPalletSP (Demo)", purchases: 46, rating: 5.0, reviews: 38, tier: "vip", score: 985 },
    { name: "CynthiaTCG (Demo)", purchases: 31, rating: 4.9, reviews: 27, tier: "ouro", score: 920 },
    { name: "AshKetchumBR (Demo)", purchases: 24, rating: 5.0, reviews: 19, tier: "ouro", score: 874 },
    { name: "MistyWaterRJ (Demo)", purchases: 14, rating: 4.9, reviews: 12, tier: "confiavel", score: 790 },
    { name: "OakCollectorPR (Demo)", purchases: 8, rating: 4.8, reviews: 7, tier: "confiavel", score: 715 },
    { name: "BrockMG (Demo)", purchases: 4, rating: 5.0, reviews: 3, tier: "regular", score: 630 },
  ];
  return rows.map((r) => ({
    display_name: r.name,
    completed_purchases: r.purchases,
    rating: r.rating,
    reviews: r.reviews,
    dispute_rate: 0,
    tier: r.tier,
    score: r.score,
  }));
}

export function getDemoCartSellerInfo(listingIds: string[]) {
  return listingIds.map((listingId) => {
    const idx = Number(listingId.split("-").pop() ?? "1") - 1;
    const store = DEMO_STORES[Math.max(0, idx) % DEMO_STORES.length] ?? DEMO_STORES[0]!;
    return {
      listing_id: listingId,
      seller_id: store.id,
      store_name: store.store_name,
      store_slug: store.slug,
      is_official: store.is_official,
      city: store.city,
      state: store.state,
      rating: store.rating,
      reviews: store.reviews,
      completed_sales: store.completed_sales,
      logo_url: store.logo_url,
    };
  });
}

export function getDemoCartMetadata(listingIds: string[]) {
  const sellers = getDemoCartSellerInfo(listingIds);
  const sellerIds = [...new Set(sellers.map((s) => s.seller_id))];
  const profiles = DEMO_STORES.filter((s) => sellerIds.includes(s.id)).map((s) => ({
    seller_id: s.id,
    ...s.shippingProfile,
  }));
  const volumeTiers = DEMO_STORES.filter((s) => sellerIds.includes(s.id)).flatMap((s) =>
    s.volumeTiers.map((t) => ({ ...t, seller_id: s.id })),
  );
  return { sellers, profiles, volumeTiers };
}

export function validateDemoCoupon(code: string, subtotal: number) {
  if (code.trim().toUpperCase() === DEMO_COUPON_CODE) {
    return { valid: true, code: DEMO_COUPON_CODE, discount: Math.round(subtotal * 0.1 * 100) / 100, reason: null };
  }
  return { valid: false, code, discount: 0, reason: `No modo demonstração, use o cupom ${DEMO_COUPON_CODE} (10% OFF).` };
}

/* ---------- LocalStorage Demo Collection, Alerts & Orders ---------- */

const COLLECTION_KEY = "pokeplace_demo_collection_v1";
const ALERTS_KEY = "pokeplace_demo_alerts_v1";
const ORDERS_KEY = "pokeplace_demo_orders_v1";

export type DemoCollectionEntry = {
  id: string;
  card_id: string;
  kind: "owned" | "wanted";
  quantity: number;
  target_price: number | null;
  purchase_price: number | null;
  condition: string;
  created_at: string;
};

export type DemoPriceAlert = {
  id: string;
  card_id: string;
  direction: "below" | "above";
  target_brl: number;
  active: boolean;
  last_triggered_at: string | null;
};

export type DemoOrder = {
  id: string;
  status: string;
  subtotal: number;
  shipping_total: number;
  discount_total: number;
  created_at: string;
  ship: { name: string; address: string; city: string; state: string; zip: string };
  items: CartItem[];
};

function defaultCollectionSeed(): DemoCollectionEntry[] {
  const now = new Date().toISOString();
  return [
    { id: "demo-col-1", card_id: "base1-4", kind: "owned", quantity: 1, target_price: null, purchase_price: 1850, condition: "NM", created_at: now },
    { id: "demo-col-2", card_id: "swsh7-95", kind: "owned", quantity: 2, target_price: null, purchase_price: 92, condition: "NM", created_at: now },
    { id: "demo-col-3", card_id: "sv03.5-151", kind: "owned", quantity: 1, target_price: null, purchase_price: 105, condition: "M", created_at: now },
    { id: "demo-col-4", card_id: "sv08.5-161", kind: "wanted", quantity: 1, target_price: 3200, purchase_price: null, condition: "NM", created_at: now },
  ];
}

function defaultAlertsSeed(): DemoPriceAlert[] {
  return [
    { id: "demo-alert-1", card_id: "base1-4", direction: "below", target_brl: 2100, active: true, last_triggered_at: null },
  ];
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadDemoCollection(): DemoCollectionEntry[] {
  if (!hasStorage()) return defaultCollectionSeed();
  try {
    const raw = window.localStorage.getItem(COLLECTION_KEY);
    if (!raw) {
      const seed = defaultCollectionSeed();
      window.localStorage.setItem(COLLECTION_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DemoCollectionEntry[]) : defaultCollectionSeed();
  } catch {
    return defaultCollectionSeed();
  }
}

export function saveDemoCollection(entries: DemoCollectionEntry[]) {
  if (hasStorage()) window.localStorage.setItem(COLLECTION_KEY, JSON.stringify(entries));
}

export function loadDemoCollectionWithCards() {
  return loadDemoCollection().map((entry) => {
    const c = localCard(entry.card_id);
    return {
      ...entry,
      cards: c
        ? { name: c.name, number: c.number, image_small: c.image_small, card_sets: { name: c.card_sets.name } }
        : { name: entry.card_id, number: "?", image_small: null, card_sets: null },
    };
  });
}

export function toggleDemoCollectionCard(cardId: string, kind: "owned" | "wanted"): boolean {
  const list = loadDemoCollection();
  const idx = list.findIndex((r) => r.card_id === cardId && r.kind === kind);
  if (idx >= 0) {
    list.splice(idx, 1);
    saveDemoCollection(list);
    return false;
  }
  list.unshift({
    id: `demo-col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    card_id: cardId,
    kind,
    quantity: 1,
    target_price: null,
    purchase_price: null,
    condition: "NM",
    created_at: new Date().toISOString(),
  });
  saveDemoCollection(list);
  return true;
}

export function updateDemoCollectionEntry(
  id: string,
  patch: Partial<Pick<DemoCollectionEntry, "quantity" | "condition" | "purchase_price" | "target_price">>,
) {
  const list = loadDemoCollection().map((r) => (r.id === id ? { ...r, ...patch } : r));
  saveDemoCollection(list);
}

export function deleteDemoCollectionEntry(id: string) {
  saveDemoCollection(loadDemoCollection().filter((r) => r.id !== id));
}

export function loadDemoAlerts() {
  let list: DemoPriceAlert[];
  if (!hasStorage()) {
    list = defaultAlertsSeed();
  } else {
    try {
      const raw = window.localStorage.getItem(ALERTS_KEY);
      if (!raw) {
        list = defaultAlertsSeed();
        window.localStorage.setItem(ALERTS_KEY, JSON.stringify(list));
      } else {
        const parsed = JSON.parse(raw);
        list = Array.isArray(parsed) ? (parsed as DemoPriceAlert[]) : defaultAlertsSeed();
      }
    } catch {
      list = defaultAlertsSeed();
    }
  }
  return list.map((a) => {
    const c = localCard(a.card_id);
    return {
      ...a,
      cards: c ? { name: c.name, number: c.number, image_small: c.image_small } : null,
    };
  });
}

export function addDemoAlert(cardId: string, direction: "below" | "above", targetBrl: number) {
  const list = loadDemoAlerts().map(({ cards: _c, ...rest }) => rest);
  list.unshift({
    id: `demo-alert-${Date.now()}`,
    card_id: cardId,
    direction,
    target_brl: targetBrl,
    active: true,
    last_triggered_at: null,
  });
  if (hasStorage()) window.localStorage.setItem(ALERTS_KEY, JSON.stringify(list));
}

export function toggleDemoAlert(id: string) {
  const list = loadDemoAlerts().map(({ cards: _c, ...rest }) =>
    rest.id === id ? { ...rest, active: !rest.active } : rest,
  );
  if (hasStorage()) window.localStorage.setItem(ALERTS_KEY, JSON.stringify(list));
}

export function deleteDemoAlert(id: string) {
  const list = loadDemoAlerts()
    .filter((a) => a.id !== id)
    .map(({ cards: _c, ...rest }) => rest);
  if (hasStorage()) window.localStorage.setItem(ALERTS_KEY, JSON.stringify(list));
}

export function loadDemoOrders(): DemoOrder[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DemoOrder[]) : [];
  } catch {
    return [];
  }
}

export function createDemoOrder(input: {
  items: CartItem[];
  ship: DemoOrder["ship"];
  subtotal: number;
  shipping_total: number;
  discount_total: number;
}): DemoOrder {
  const order: DemoOrder = {
    id: `demo-${Date.now().toString(36)}`,
    status: "awaiting_payment",
    subtotal: input.subtotal,
    shipping_total: input.shipping_total,
    discount_total: input.discount_total,
    created_at: new Date().toISOString(),
    ship: input.ship,
    items: input.items,
  };
  const next = [order, ...loadDemoOrders()];
  if (hasStorage()) window.localStorage.setItem(ORDERS_KEY, JSON.stringify(next));
  return order;
}

export function getDemoPublicCollection(slug: string) {
  if (slug !== "colecionador-demo") return [];
  return loadDemoCollectionWithCards()
    .filter((r) => r.kind === "owned")
    .map((r) => ({
      owner_name: "Colecionador Demo",
      share_slug: "colecionador-demo",
      card_id: r.card_id,
      quantity: r.quantity,
      condition: r.condition,
      card_name: r.cards.name,
      card_number: r.cards.number,
      image_small: r.cards.image_small,
      set_name: r.cards.card_sets?.name ?? null,
      ref_price_brl: getDemoTrend(r.card_id).last,
    }));
}
