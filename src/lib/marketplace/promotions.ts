export type CouponType = "percent" | "fixed";

export type StoreCoupon = {
  id?: string;
  code: string;
  discount_type: CouponType;
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
  active: boolean;
};

export type VolumeDiscountTier = {
  id?: string;
  min_qty: number;
  discount_pct: number;
  active: boolean;
};

export const COUPON_CODE_RE = /^[A-Z0-9_-]{3,24}$/;
export const MAX_COUPON_PERCENT = 80;
export const MAX_VOLUME_DISCOUNT_PCT = 50;

export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function validateCouponDefinition(input: {
  code: string;
  discountType: CouponType;
  discountValue: number;
  minOrderAmount?: number;
  maxUses?: number | null;
}): string | null {
  const code = normalizeCouponCode(input.code);
  if (!COUPON_CODE_RE.test(code)) {
    return "Código do cupom deve ter de 3 a 24 caracteres (A-Z, 0-9, _ ou -).";
  }
  if (!Number.isFinite(input.discountValue) || input.discountValue <= 0) {
    return "Valor de desconto deve ser maior que zero.";
  }
  if (input.discountType === "percent" && input.discountValue > MAX_COUPON_PERCENT) {
    return `Desconto percentual máximo permitido é ${MAX_COUPON_PERCENT}%.`;
  }
  if (input.minOrderAmount != null && input.minOrderAmount < 0) {
    return "Pedido mínimo não pode ser negativo.";
  }
  if (input.maxUses != null && (!Number.isInteger(input.maxUses) || input.maxUses < 1)) {
    return "Limite de usos deve ser um inteiro positivo.";
  }
  return null;
}

export function validateVolumeTier(minQty: number, discountPct: number): string | null {
  if (!Number.isInteger(minQty) || minQty < 2 || minQty > 100) {
    return "Quantidade mínima deve ser entre 2 e 100 cartas.";
  }
  if (!Number.isFinite(discountPct) || discountPct <= 0 || discountPct > MAX_VOLUME_DISCOUNT_PCT) {
    return `Desconto por volume deve ser entre 1% e ${MAX_VOLUME_DISCOUNT_PCT}%.`;
  }
  return null;
}

export function bestVolumeTier(
  totalQty: number,
  tiers: readonly VolumeDiscountTier[],
): VolumeDiscountTier | null {
  let best: VolumeDiscountTier | null = null;
  for (const t of tiers) {
    if (!t.active) continue;
    if (totalQty >= t.min_qty && (!best || t.discount_pct > best.discount_pct)) {
      best = t;
    }
  }
  return best;
}

export function evaluateCoupon(
  coupon: StoreCoupon | null | undefined,
  subtotalAfterVolume: number,
  now: number = Date.now(),
): { valid: true; discount: number; code: string } | { valid: false; reason: string } {
  if (!coupon || !coupon.active) {
    return { valid: false, reason: "Cupom inválido ou inativo." };
  }
  if (coupon.expires_at && Date.parse(coupon.expires_at) <= now) {
    return { valid: false, reason: "Este cupom expirou." };
  }
  if (coupon.max_uses != null && coupon.uses_count >= coupon.max_uses) {
    return { valid: false, reason: "Este cupom atingiu o limite de usos." };
  }
  if (subtotalAfterVolume < Number(coupon.min_order_amount ?? 0)) {
    return {
      valid: false,
      reason: `Pedido mínimo de R$ ${Number(coupon.min_order_amount).toFixed(2).replace(".", ",")} para este cupom.`,
    };
  }
  const raw =
    coupon.discount_type === "percent"
      ? (subtotalAfterVolume * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);
  const capped = Math.min(Math.max(0, subtotalAfterVolume - 0.01), Math.max(0, raw));
  return {
    valid: true,
    discount: Math.round(capped * 100) / 100,
    code: coupon.code,
  };
}

export type StorePricingBreakdown = {
  subtotal: number;
  volumeTier: VolumeDiscountTier | null;
  volumeDiscount: number;
  couponDiscount: number;
  couponError: string | null;
  totalDiscount: number;
  netSubtotal: number;
};

export function calculateStorePromotions(input: {
  subtotal: number;
  totalQty: number;
  volumeTiers?: readonly VolumeDiscountTier[];
  coupon?: StoreCoupon | null;
  now?: number;
}): StorePricingBreakdown {
  const subtotal = Math.max(0, Math.round(input.subtotal * 100) / 100);
  const tier = bestVolumeTier(input.totalQty, input.volumeTiers ?? []);
  const volumeDiscount = tier ? Math.round(subtotal * (tier.discount_pct / 100) * 100) / 100 : 0;
  const afterVolume = Math.max(0, Math.round((subtotal - volumeDiscount) * 100) / 100);

  let couponDiscount = 0;
  let couponError: string | null = null;
  if (input.coupon) {
    const res = evaluateCoupon(input.coupon, afterVolume, input.now);
    if (res.valid) {
      couponDiscount = res.discount;
    } else {
      couponError = res.reason;
    }
  }

  const totalDiscount = Math.round((volumeDiscount + couponDiscount) * 100) / 100;
  const netSubtotal = Math.max(0, Math.round((subtotal - totalDiscount) * 100) / 100);

  return {
    subtotal,
    volumeTier: tier,
    volumeDiscount,
    couponDiscount,
    couponError,
    totalDiscount,
    netSubtotal,
  };
}
