import { CONDITION_PRICE_FACTORS } from "./grading";

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

export type SellerSaleItem = {
  id: string;
  order_id: string;
  card_id: string;
  card_name?: string | null;
  quantity: number;
  unit_price: number;
  commission?: number | null;
  status: string;
  created_at: string;
};

export type SellerInventoryItem = {
  id: string;
  card_id: string;
  price: number;
  quantity: number;
  status: string;
};

export type TopCardMetric = {
  cardId: string;
  cardName: string;
  unitsSold: number;
  grossRevenue: number;
};

export type DailyRevenuePoint = {
  date: string;
  gross: number;
  net: number;
  orders: number;
};

export type SellerAnalyticsSummary = {
  period: AnalyticsPeriod;
  ordersCount: number;
  unitsSold: number;
  grossRevenue: number;
  totalCommission: number;
  netRevenue: number;
  averageTicket: number;
  activeListingsCount: number;
  totalInventoryUnits: number;
  inventoryValueBrl: number;
  sellThroughPct: number;
  topCards: TopCardMetric[];
  dailySeries: DailyRevenuePoint[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const PERIOD_DAYS: Record<AnalyticsPeriod, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

const COUNTED_STATUSES = new Set(["paid", "shipped", "delivered", "completed", "pending"]);

export function computeSellerAnalytics(params: {
  items: SellerSaleItem[];
  inventory: SellerInventoryItem[];
  period: AnalyticsPeriod;
  nowMs?: number;
}): SellerAnalyticsSummary {
  const nowMs = params.nowMs ?? Date.now();
  const days = PERIOD_DAYS[params.period];
  const cutoff = days != null ? nowMs - days * 86_400_000 : -Infinity;

  const filtered = params.items.filter((it) => {
    if (it.status === "cancelled" || it.status === "refunded") return false;
    if (!COUNTED_STATUSES.has(it.status)) return false;
    const t = new Date(it.created_at).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });

  const orderIds = new Set<string>();
  let unitsSold = 0;
  let grossRevenue = 0;
  let totalCommission = 0;

  const cardMap = new Map<string, TopCardMetric>();
  const dayMap = new Map<string, { gross: number; net: number; orders: Set<string> }>();

  for (const it of filtered) {
    const qty = Math.max(1, Math.trunc(Number(it.quantity) || 1));
    const unit = Math.max(0, Number(it.unit_price) || 0);
    const gross = round2(unit * qty);
    const comm = Math.max(0, Number(it.commission ?? 0) || 0);
    const net = round2(Math.max(0, gross - comm));

    orderIds.add(it.order_id);
    unitsSold += qty;
    grossRevenue = round2(grossRevenue + gross);
    totalCommission = round2(totalCommission + comm);

    const cardBucket = cardMap.get(it.card_id) ?? {
      cardId: it.card_id,
      cardName: it.card_name?.trim() || it.card_id,
      unitsSold: 0,
      grossRevenue: 0,
    };
    cardBucket.unitsSold += qty;
    cardBucket.grossRevenue = round2(cardBucket.grossRevenue + gross);
    cardMap.set(it.card_id, cardBucket);

    const dayKey = new Date(it.created_at).toISOString().slice(0, 10);
    const dayBucket = dayMap.get(dayKey) ?? { gross: 0, net: 0, orders: new Set<string>() };
    dayBucket.gross = round2(dayBucket.gross + gross);
    dayBucket.net = round2(dayBucket.net + net);
    dayBucket.orders.add(it.order_id);
    dayMap.set(dayKey, dayBucket);
  }

  const ordersCount = orderIds.size;
  const netRevenue = round2(Math.max(0, grossRevenue - totalCommission));
  const averageTicket = ordersCount > 0 ? round2(grossRevenue / ordersCount) : 0;

  const activeInventory = params.inventory.filter((l) => l.status === "active" && l.quantity > 0);
  const activeListingsCount = activeInventory.length;
  const totalInventoryUnits = activeInventory.reduce((acc, l) => acc + Math.max(0, l.quantity), 0);
  const inventoryValueBrl = round2(
    activeInventory.reduce(
      (acc, l) => acc + Math.max(0, Number(l.price) || 0) * Math.max(0, l.quantity),
      0,
    ),
  );
  const sellThroughDenom = unitsSold + totalInventoryUnits;
  const sellThroughPct = sellThroughDenom > 0 ? round2((unitsSold / sellThroughDenom) * 100) : 0;

  const topCards = [...cardMap.values()]
    .sort((a, b) => b.grossRevenue - a.grossRevenue || b.unitsSold - a.unitsSold)
    .slice(0, 5);

  const dailySeries: DailyRevenuePoint[] = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date,
      gross: v.gross,
      net: v.net,
      orders: v.orders.size,
    }));

  return {
    period: params.period,
    ordersCount,
    unitsSold,
    grossRevenue,
    totalCommission,
    netRevenue,
    averageTicket,
    activeListingsCount,
    totalInventoryUnits,
    inventoryValueBrl,
    sellThroughPct,
    topCards,
    dailySeries,
  };
}

export type PriceSuggestion = {
  suggestedBrl: number;
  competitiveBrl: number | null;
  referenceBrl: number | null;
  rationale: string;
};

/**
 * Recommends a listing price combining BRL market reference (condition-adjusted)
 * and active competing offers in the same condition.
 */
export function suggestListingPrice(params: {
  referenceBrl: number | null | undefined;
  competingPrices: number[];
  condition: string;
}): PriceSuggestion | null {
  const factor =
    (CONDITION_PRICE_FACTORS as Record<string, number>)[params.condition.toUpperCase()] ?? 1;
  const refAdj =
    params.referenceBrl != null && Number.isFinite(params.referenceBrl) && params.referenceBrl > 0
      ? round2(params.referenceBrl * factor)
      : null;

  const validComp = params.competingPrices
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  const lowestComp = validComp[0] ?? null;
  const medianComp =
    validComp.length > 0
      ? validComp.length % 2 === 1
        ? validComp[Math.floor(validComp.length / 2)]!
        : round2((validComp[validComp.length / 2 - 1]! + validComp[validComp.length / 2]!) / 2)
      : null;

  if (refAdj == null && lowestComp == null) return null;

  if (refAdj != null && lowestComp != null) {
    // Undercut lowest competitor slightly (2%) unless it would fall more than 15% below reference
    const undercut = round2(Math.max(1, lowestComp * 0.98));
    const floor = round2(refAdj * 0.85);
    const suggested = Math.max(floor, Math.min(undercut, round2(refAdj * 1.05)));
    return {
      suggestedBrl: round2(suggested),
      competitiveBrl: lowestComp,
      referenceBrl: refAdj,
      rationale: `Baseado na menor oferta atual (R$ ${lowestComp.toFixed(2)}) e cotação de referência ${params.condition} (R$ ${refAdj.toFixed(2)}).`,
    };
  }

  if (lowestComp != null) {
    const suggested = round2(Math.max(1, (medianComp ?? lowestComp) * 0.98));
    return {
      suggestedBrl: suggested,
      competitiveBrl: lowestComp,
      referenceBrl: null,
      rationale: `2% abaixo da concorrência ativa na mesma condição (menor oferta R$ ${lowestComp.toFixed(2)}).`,
    };
  }

  return {
    suggestedBrl: refAdj!,
    competitiveBrl: null,
    referenceBrl: refAdj!,
    rationale: `Baseado na cotação pública ajustada para condição ${params.condition} (${Math.round(factor * 100)}%).`,
  };
}
