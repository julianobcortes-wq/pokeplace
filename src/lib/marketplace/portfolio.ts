import { CONDITION_PRICE_FACTORS } from "./grading";

export type PortfolioEntry = {
  id: string;
  card_id: string;
  kind: string;
  quantity: number;
  condition?: string | null;
  purchase_price?: number | null;
  target_price?: number | null;
  card_name?: string | null;
  card_number?: string | null;
  set_name?: string | null;
};

export type SetBreakdown = {
  setName: string;
  cards: number;
  copies: number;
  valueBrl: number;
  costBrl: number;
  pnlBrl: number;
};

export type PortfolioSummary = {
  ownedCards: number;
  totalCopies: number;
  totalValueBrl: number;
  totalCostBrl: number;
  pnlBrl: number;
  pnlPct: number | null;
  pricedCards: number;
  costedCards: number;
  bySet: SetBreakdown[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function conditionAdjustedPrice(
  baseBrl: number | null | undefined,
  condition?: string | null,
): number | null {
  if (baseBrl == null || !Number.isFinite(baseBrl) || baseBrl <= 0) return null;
  const key = (condition ?? "NM").toUpperCase();
  const factor = (CONDITION_PRICE_FACTORS as Record<string, number>)[key] ?? 1;
  return round2(baseBrl * factor);
}

export function summarizePortfolio(
  entries: PortfolioEntry[],
  marketPriceBrlByCard: Record<string, number>,
): PortfolioSummary {
  const owned = entries.filter((e) => e.kind === "owned");
  let totalCopies = 0;
  let totalValueBrl = 0;
  let totalCostBrl = 0;
  let pricedCards = 0;
  let costedCards = 0;
  const setMap = new Map<string, SetBreakdown>();

  for (const e of owned) {
    const qty = Math.max(1, Math.trunc(Number(e.quantity) || 1));
    totalCopies += qty;
    const base = marketPriceBrlByCard[e.card_id];
    const adj = conditionAdjustedPrice(base, e.condition);
    const entryValue = adj != null ? round2(adj * qty) : 0;
    const hasCost =
      e.purchase_price != null &&
      Number.isFinite(Number(e.purchase_price)) &&
      Number(e.purchase_price) >= 0;
    const entryCost = hasCost ? round2(Number(e.purchase_price) * qty) : 0;

    if (adj != null) {
      pricedCards += 1;
      totalValueBrl += entryValue;
    }
    if (hasCost) {
      costedCards += 1;
      totalCostBrl += entryCost;
    }

    const setName = e.set_name?.trim() || "Outras coleções";
    const bucket = setMap.get(setName) ?? {
      setName,
      cards: 0,
      copies: 0,
      valueBrl: 0,
      costBrl: 0,
      pnlBrl: 0,
    };
    bucket.cards += 1;
    bucket.copies += qty;
    bucket.valueBrl = round2(bucket.valueBrl + entryValue);
    bucket.costBrl = round2(bucket.costBrl + entryCost);
    bucket.pnlBrl = round2(bucket.valueBrl - bucket.costBrl);
    setMap.set(setName, bucket);
  }

  totalValueBrl = round2(totalValueBrl);
  totalCostBrl = round2(totalCostBrl);
  const pnlBrl = round2(totalValueBrl - totalCostBrl);
  const pnlPct =
    totalCostBrl > 0 ? round2(((totalValueBrl - totalCostBrl) / totalCostBrl) * 100) : null;

  const bySet = [...setMap.values()].sort((a, b) => b.valueBrl - a.valueBrl || b.copies - a.copies);

  return {
    ownedCards: owned.length,
    totalCopies,
    totalValueBrl,
    totalCostBrl,
    pnlBrl,
    pnlPct,
    pricedCards,
    costedCards,
    bySet,
  };
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportCollectionCsv(
  entries: PortfolioEntry[],
  marketPriceBrlByCard: Record<string, number>,
): string {
  const header = [
    "Carta",
    "Numero",
    "Colecao",
    "Tipo",
    "Quantidade",
    "Condicao",
    "Custo_Unit_BRL",
    "Cotacao_Unit_BRL",
    "Valor_Total_BRL",
    "Lucro_Prejuizo_BRL",
    "Meta_Desejo_BRL",
  ];
  const rows = entries.map((e) => {
    const qty = Math.max(1, Math.trunc(Number(e.quantity) || 1));
    const unitMarket = conditionAdjustedPrice(marketPriceBrlByCard[e.card_id], e.condition);
    const totalMarket = unitMarket != null ? round2(unitMarket * qty) : null;
    const costUnit =
      e.purchase_price != null && Number.isFinite(Number(e.purchase_price))
        ? round2(Number(e.purchase_price))
        : null;
    const pnl =
      totalMarket != null && costUnit != null ? round2(totalMarket - costUnit * qty) : null;
    return [
      e.card_name ?? e.card_id,
      e.card_number ?? "",
      e.set_name ?? "",
      e.kind === "owned" ? "Colecao" : "Desejo",
      qty,
      (e.condition ?? "NM").toUpperCase(),
      costUnit != null ? costUnit.toFixed(2) : "",
      unitMarket != null ? unitMarket.toFixed(2) : "",
      totalMarket != null ? totalMarket.toFixed(2) : "",
      pnl != null ? pnl.toFixed(2) : "",
      e.target_price != null ? Number(e.target_price).toFixed(2) : "",
    ]
      .map(csvCell)
      .join(",");
  });
  return `\uFEFF${header.join(",")}\n${rows.join("\n")}`;
}

export function validateShareSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (!slug) return "Informe um endereço curto para compartilhar seu acervo.";
  if (slug.length < 3 || slug.length > 36) return "O endereço deve ter entre 3 e 36 caracteres.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "Use apenas letras minúsculas, números e hífen (ex.: ash-ketchum).";
  }
  return null;
}

export function shouldTriggerPriceAlert(params: {
  direction: "below" | "above";
  targetBrl: number;
  currentPriceBrl: number;
  lastTriggeredAt?: string | null;
  nowMs?: number;
}): boolean {
  if (!Number.isFinite(params.targetBrl) || params.targetBrl <= 0) return false;
  if (!Number.isFinite(params.currentPriceBrl) || params.currentPriceBrl <= 0) return false;
  if (params.lastTriggeredAt) {
    const prev = new Date(params.lastTriggeredAt).getTime();
    const now = params.nowMs ?? Date.now();
    if (Number.isFinite(prev) && now - prev < 24 * 3600 * 1000) return false;
  }
  return params.direction === "below"
    ? params.currentPriceBrl <= params.targetBrl
    : params.currentPriceBrl >= params.targetBrl;
}
