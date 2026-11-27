import { BULK_MAX_PRICE, BULK_MAX_QUANTITY } from "@/lib/marketplace/bulk-listing";

export const BULK_EDIT_MAX_LISTINGS = 200;
export const BULK_PERCENT_MIN = -90;
export const BULK_PERCENT_MAX = 300;

export type BulkPriceRule =
  | { mode: "set"; price: number }
  | { mode: "percent"; percent: number }
  | { mode: "reference_percent"; percent: number };

export type BulkEditAction =
  | { kind: "price"; rule: BulkPriceRule }
  | { kind: "quantity"; quantity: number }
  | { kind: "status"; status: "active" | "paused" | "removed" };

export type BulkEditListing = {
  id: string;
  card_id?: string;
  price: number;
  quantity: number;
  status: string;
};

export type BulkEditPatch = {
  price?: number;
  quantity?: number;
  status?: "active" | "paused" | "sold_out" | "removed";
};

export type BulkEditPlan = {
  updates: { id: string; patch: BulkEditPatch }[];
  skipped: { id: string; reason: string }[];
};

export function applyPriceRule(
  current: number,
  rule: BulkPriceRule,
  referencePrice?: number | null,
): number | null {
  let next: number;
  if (rule.mode === "set") {
    next = rule.price;
  } else if (rule.mode === "reference_percent") {
    if (referencePrice == null || !Number.isFinite(referencePrice) || referencePrice <= 0) {
      return null;
    }
    next = Math.round(referencePrice * (1 + rule.percent / 100) * 100) / 100;
  } else {
    next = Math.round(current * (1 + rule.percent / 100) * 100) / 100;
  }
  if (!Number.isFinite(next) || next < 0.01 || next > BULK_MAX_PRICE) return null;
  return Math.round(next * 100) / 100;
}

export function validatePriceRule(rule: BulkPriceRule): string | null {
  if (rule.mode === "set") {
    return rule.price >= 0.01 && rule.price <= BULK_MAX_PRICE
      ? null
      : "Preço fixo deve estar entre R$ 0,01 e R$ 100.000.";
  }
  return rule.percent >= BULK_PERCENT_MIN && rule.percent <= BULK_PERCENT_MAX
    ? null
    : `Percentual deve estar entre ${BULK_PERCENT_MIN}% e ${BULK_PERCENT_MAX}%.`;
}

export function planBulkEdit(
  listings: BulkEditListing[],
  action: BulkEditAction,
  approvedSeller: boolean,
  referencePrices?: Record<string, number>,
): BulkEditPlan {
  const plan: BulkEditPlan = { updates: [], skipped: [] };
  for (const l of listings) {
    if (action.kind === "price") {
      const refPrice = l.card_id ? referencePrices?.[l.card_id] : undefined;
      if (action.rule.mode === "reference_percent" && (refPrice == null || refPrice <= 0)) {
        plan.skipped.push({ id: l.id, reason: "Sem preço de referência BRL disponível." });
        continue;
      }
      const price = applyPriceRule(l.price, action.rule, refPrice);
      if (price === null) {
        plan.skipped.push({ id: l.id, reason: "Preço resultante fora do limite." });
        continue;
      }
      plan.updates.push({ id: l.id, patch: { price } });
      continue;
    }
    if (action.kind === "quantity") {
      if (
        !Number.isInteger(action.quantity) ||
        action.quantity < 0 ||
        action.quantity > BULK_MAX_QUANTITY
      ) {
        plan.skipped.push({ id: l.id, reason: "Estoque inválido." });
        continue;
      }
      const status =
        action.quantity === 0 ? "sold_out" : l.status === "sold_out" ? "active" : undefined;
      if (status === "active" && !approvedSeller) {
        plan.skipped.push({ id: l.id, reason: "Loja não aprovada para reativar anúncios." });
        continue;
      }
      plan.updates.push({
        id: l.id,
        patch: { quantity: action.quantity, ...(status ? { status } : {}) },
      });
      continue;
    }
    if (action.status === "active" && !approvedSeller) {
      plan.skipped.push({ id: l.id, reason: "Loja não aprovada para ativar anúncios." });
      continue;
    }
    if (l.status === action.status) {
      plan.skipped.push({ id: l.id, reason: "Já está nesse status." });
      continue;
    }
    plan.updates.push({ id: l.id, patch: { status: action.status } });
  }
  return plan;
}
