import { describe, expect, it } from "vitest";
import {
  formatOfferRemaining,
  isOfferExpired,
  minAllowedOffer,
  validateCounterOffer,
  validateOfferSubmission,
} from "@/lib/marketplace/offers";
import {
  bestVolumeTier,
  calculateStorePromotions,
  evaluateCoupon,
  normalizeCouponCode,
  validateCouponDefinition,
  validateVolumeTier,
  type StoreCoupon,
} from "@/lib/marketplace/promotions";
import {
  calculateStoreShipping,
  getCarrierTrackingUrl,
  normalizeUf,
  sanitizeStateRates,
} from "@/lib/marketplace/shipping";

describe("Phase 2 offers (Make an Offer)", () => {
  it("enforces 50% floor, stock limits, self-offer block, and under-listing-price rule", () => {
    expect(minAllowedOffer(100)).toBe(50);

    expect(
      validateOfferSubmission({
        listingPrice: 100,
        offeredPrice: 80,
        quantity: 1,
        availableStock: 2,
        buyerUserId: "buyer-1",
        sellerUserId: "seller-1",
        message: "Fecho hoje!",
      }),
    ).toBeNull();

    expect(
      validateOfferSubmission({
        listingPrice: 100,
        offeredPrice: 40,
        quantity: 1,
        availableStock: 2,
        buyerUserId: "buyer-1",
        sellerUserId: "seller-1",
      }),
    ).toContain("50%");

    expect(
      validateOfferSubmission({
        listingPrice: 100,
        offeredPrice: 100,
        quantity: 1,
        availableStock: 2,
        buyerUserId: "buyer-1",
        sellerUserId: "seller-1",
      }),
    ).toContain("menor que o preço");

    expect(
      validateOfferSubmission({
        listingPrice: 100,
        offeredPrice: 80,
        quantity: 1,
        availableStock: 2,
        buyerUserId: "same-user",
        sellerUserId: "same-user",
      }),
    ).toContain("própria loja");

    expect(
      validateOfferSubmission({
        listingPrice: 100,
        offeredPrice: 80,
        quantity: 5,
        availableStock: 2,
        buyerUserId: "buyer-1",
        sellerUserId: "seller-1",
      }),
    ).toContain("Estoque");
  });

  it("validates counter-offers strictly between buyer offer and listing price and tracks 48h expiry", () => {
    expect(
      validateCounterOffer({ listingPrice: 100, offeredPrice: 70, counterPrice: 85 }),
    ).toBeNull();
    expect(
      validateCounterOffer({ listingPrice: 100, offeredPrice: 70, counterPrice: 70 }),
    ).not.toBeNull();
    expect(
      validateCounterOffer({ listingPrice: 100, offeredPrice: 70, counterPrice: 105 }),
    ).not.toBeNull();

    const now = Date.UTC(2026, 10, 27, 12, 0, 0);
    const future = new Date(now + 10 * 3_600_000).toISOString();
    const past = new Date(now - 1000).toISOString();
    expect(isOfferExpired(future, now)).toBe(false);
    expect(isOfferExpired(past, now)).toBe(true);
    expect(formatOfferRemaining(future, now)).toBe("10h 0m restantes");
    expect(formatOfferRemaining(past, now)).toBe("Expirada");
  });
});

describe("Phase 2 store coupons & volume discounts", () => {
  it("validates coupon definitions and volume tiers", () => {
    expect(normalizeCouponCode("  poke 10  ")).toBe("POKE10");
    expect(
      validateCouponDefinition({ code: "POKE10", discountType: "percent", discountValue: 10 }),
    ).toBeNull();
    expect(
      validateCouponDefinition({ code: "AB", discountType: "percent", discountValue: 10 }),
    ).not.toBeNull();
    expect(
      validateCouponDefinition({ code: "HUGE", discountType: "percent", discountValue: 95 }),
    ).not.toBeNull();

    expect(validateVolumeTier(3, 5)).toBeNull();
    expect(validateVolumeTier(1, 5)).not.toBeNull();
    expect(validateVolumeTier(3, 60)).not.toBeNull();
  });

  it("applies best active volume tier and validates coupon expiry, usage limit & min order", () => {
    const tiers = [
      { min_qty: 3, discount_pct: 5, active: true },
      { min_qty: 6, discount_pct: 12, active: true },
      { min_qty: 10, discount_pct: 20, active: false },
    ];
    expect(bestVolumeTier(2, tiers)).toBeNull();
    expect(bestVolumeTier(4, tiers)?.discount_pct).toBe(5);
    expect(bestVolumeTier(12, tiers)?.discount_pct).toBe(12);

    const coupon: StoreCoupon = {
      code: "BEMVINDO10",
      discount_type: "percent",
      discount_value: 10,
      min_order_amount: 50,
      max_uses: 10,
      uses_count: 2,
      expires_at: "2027-01-01T00:00:00Z",
      active: true,
    };

    const now = Date.UTC(2026, 10, 27);
    const breakdown = calculateStorePromotions({
      subtotal: 200,
      totalQty: 6,
      volumeTiers: tiers,
      coupon,
      now,
    });
    // 200 * 12% = 24 volume -> 176 after volume -> 10% coupon = 17.60 -> net 158.40
    expect(breakdown.volumeDiscount).toBe(24);
    expect(breakdown.couponDiscount).toBe(17.6);
    expect(breakdown.totalDiscount).toBe(41.6);
    expect(breakdown.netSubtotal).toBe(158.4);

    // Exhausted coupon rejected
    expect(evaluateCoupon({ ...coupon, uses_count: 10 }, 100, now).valid).toBe(false);
    // Expired coupon rejected
    expect(evaluateCoupon({ ...coupon, expires_at: "2025-01-01T00:00:00Z" }, 100, now).valid).toBe(
      false,
    );
    // Below minimum rejected
    expect(evaluateCoupon(coupon, 30, now).valid).toBe(false);
  });
});

describe("Phase 3 UF shipping & carrier tracking links", () => {
  it("calculates UF-specific shipping rates, flat-fee fallback, and free-shipping threshold", () => {
    const profile = {
      flat_fee: 25,
      free_over: 200,
      state_rates: { SP: 12, RJ: 16, AM: 38 },
    };

    const sp = calculateStoreShipping(profile, 100, "sp");
    expect(sp.fee).toBe(12);
    expect(sp.source).toBe("uf_rate");
    expect(sp.freeRemaining).toBe(100);

    const mg = calculateStoreShipping(profile, 100, "MG");
    expect(mg.fee).toBe(25);
    expect(mg.source).toBe("flat_fee");

    const free = calculateStoreShipping(profile, 220, "AM");
    expect(free.fee).toBe(0);
    expect(free.isFree).toBe(true);
    expect(free.source).toBe("free_threshold");
  });

  it("sanitizes UF maps and builds valid carrier tracking URLs", () => {
    expect(normalizeUf("sp")).toBe("SP");
    expect(normalizeUf("XX")).toBeNull();
    expect(sanitizeStateRates({ sp: 14.5, XX: 10, rj: -5, mg: 22 })).toEqual({ SP: 14.5, MG: 22 });

    expect(getCarrierTrackingUrl("correios", "BR123456789BR")).toContain(
      "rastreamento.correios.com.br",
    );
    expect(getCarrierTrackingUrl("jadlog", "100800123")).toContain("jadlog.com.br");
    expect(getCarrierTrackingUrl(null, "AA123456789BR")).toContain("correios.com.br");
    expect(getCarrierTrackingUrl("outro", "TRK-99")).toContain("melhorrastreio.com.br");
  });
});
