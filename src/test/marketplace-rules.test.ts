import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeBuyerTier,
  computeSellerThermometer,
  formatResponseTime,
  isWithinRegretWindow,
  legacyLevelToThermometer,
  shippingSlaStatus,
} from "@/lib/marketplace/rules";

describe("Mercado Livre-style Seller Thermometer, Medals & Strikes", () => {
  it("classifies stores with < 3 completed sales and < 3 reviews as new without strikes", () => {
    const res = computeSellerThermometer({
      rating: 0,
      reviews: 0,
      completedSales: 2,
      cancelled: 1,
      totalItems: 3,
      claims: 0,
      onTimeRate: 100,
    });
    expect(res.thermometer).toBe("new");
    expect(res.medal).toBe("none");
    expect(res.strikeStatus).toBe("ok");
  });

  it("awards PokeLíder, Gold, and Platinum medals only on green thermometer", () => {
    const base = {
      rating: 4.9,
      reviews: 20,
      cancelled: 0,
      claims: 0,
      onTimeRate: 98,
    };

    const lider = computeSellerThermometer({ ...base, completedSales: 30, totalItems: 30 });
    expect(lider.thermometer).toBe("green");
    expect(lider.medal).toBe("lider");

    const gold = computeSellerThermometer({ ...base, completedSales: 80, totalItems: 80 });
    expect(gold.thermometer).toBe("green");
    expect(gold.medal).toBe("lider_gold");

    const platinum = computeSellerThermometer({ ...base, completedSales: 260, totalItems: 260 });
    expect(platinum.thermometer).toBe("green");
    expect(platinum.medal).toBe("lider_platinum");
    expect(platinum.score).toBeGreaterThan(gold.score);
  });

  it("revokes medals when claim rate exceeds 2% even with high sales volume", () => {
    const res = computeSellerThermometer({
      rating: 4.9,
      reviews: 100,
      completedSales: 100,
      cancelled: 0,
      totalItems: 100,
      claims: 3, // 3% > 2%
      onTimeRate: 99,
    });
    expect(res.thermometer).toBe("light_green");
    expect(res.medal).toBe("none");
  });

  it("triggers automatic strike restriction when claims or cancels exceed 5% on >= 5 items", () => {
    const restricted = computeSellerThermometer({
      rating: 4.4,
      reviews: 10,
      completedSales: 18,
      cancelled: 0,
      totalItems: 20,
      claims: 2, // 10%
      onTimeRate: 95,
    });
    expect(restricted.thermometer).toBe("red");
    expect(restricted.strikeStatus).toBe("restricted");

    const cleared = computeSellerThermometer({
      rating: 4.4,
      reviews: 10,
      completedSales: 18,
      cancelled: 0,
      totalItems: 20,
      claims: 2,
      onTimeRate: 95,
      strikeCleared: true,
    });
    expect(cleared.strikeStatus).toBe("warning");
  });

  it("downgrades thermometer when on-time shipping SLA drops", () => {
    const res = computeSellerThermometer({
      rating: 4.8,
      reviews: 15,
      completedSales: 20,
      cancelled: 0,
      totalItems: 20,
      claims: 0,
      onTimeRate: 72,
    });
    expect(res.thermometer).toBe("red");
    expect(res.strikeStatus).toBe("warning");
  });
});

describe("Buyer Tiers & Reputation (LGPD opt-in)", () => {
  it("computes progression from novo to vip", () => {
    expect(computeBuyerTier({ completedPurchases: 0, rating: 0, reviews: 0, disputesLost: 0 }).tier).toBe("novo");
    expect(computeBuyerTier({ completedPurchases: 2, rating: 5, reviews: 1, disputesLost: 0 }).tier).toBe("regular");
    expect(computeBuyerTier({ completedPurchases: 6, rating: 4.5, reviews: 4, disputesLost: 0 }).tier).toBe("confiavel");
    expect(computeBuyerTier({ completedPurchases: 18, rating: 4.6, reviews: 10, disputesLost: 0 }).tier).toBe("ouro");
    expect(computeBuyerTier({ completedPurchases: 35, rating: 4.9, reviews: 20, disputesLost: 0 }).tier).toBe("vip");
  });

  it("prevents VIP tier if buyer has high lost-dispute rate", () => {
    const res = computeBuyerTier({ completedPurchases: 35, rating: 4.9, reviews: 20, disputesLost: 2 }); // 5.7%
    expect(res.tier).toBe("confiavel");
  });
});

describe("CDC 7-day regret window, shipping SLA & response formatting", () => {
  it("enforces 7-day regret window accurately", () => {
    const now = new Date("2026-11-27T12:00:00Z");
    expect(isWithinRegretWindow("2026-11-22T12:00:00Z", now)).toBe(true);
    expect(isWithinRegretWindow("2026-11-20T12:00:00Z", now)).toBe(true);
    expect(isWithinRegretWindow("2026-11-19T11:59:59Z", now)).toBe(false);
    expect(isWithinRegretWindow(null, now)).toBe(false);
  });

  it("formats shipping SLA urgency and overdue states", () => {
    const now = new Date("2026-11-27T12:00:00Z");
    const late = shippingSlaStatus("2026-11-26T00:00:00Z", now);
    expect(late?.overdue).toBe(true);
    expect(late?.label).toContain("Atrasado");

    const urgent = shippingSlaStatus("2026-11-27T20:00:00Z", now);
    expect(urgent?.overdue).toBe(false);
    expect(urgent?.urgent).toBe(true);
    expect(urgent?.label).toContain("8h");

    const ok = shippingSlaStatus("2026-12-01T12:00:00Z", now);
    expect(ok?.overdue).toBe(false);
    expect(ok?.urgent).toBe(false);
    expect(shippingSlaStatus(null, now)).toBeNull();
  });

  it("formats seller response time and legacy thermometer mapping", () => {
    expect(formatResponseTime(0.4)).toBe("Responde em < 1h");
    expect(formatResponseTime(3.2)).toBe("Responde em ~3h");
    expect(formatResponseTime(48)).toBe("Responde em ~2d");
    expect(formatResponseTime(null)).toBe("Sem histórico");
    expect(legacyLevelToThermometer("excelente")).toBe("green");
    expect(legacyLevelToThermometer("nova")).toBe("new");
  });
});

describe("SQL Migration 0013 Contract (scripts/sql/all-migrations.sql)", () => {
  const sql = readFileSync(resolve(process.cwd(), "scripts/sql/all-migrations.sql"), "utf8");

  it("contains all Mercado Livre-style DB rules & rankings idempotently", () => {
    expect(sql).toContain("Você não pode comprar da sua própria loja");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS ship_by timestamptz");
    expect(sql).toContain("shipped_at = coalesce(shipped_at, now())");
    expect(sql).toContain("'regret_7d'");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.submit_dispute_return");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.auto_confirm_delivered_orders");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_seller_thermometer");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.list_ranked_sellers");
    expect(sql).toContain("v_thermo.strike_status = 'restricted'");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.buyer_profiles");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.buyer_reviews");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.submit_buyer_review");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_buyer_reputation");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.list_ranked_buyers");
  });
});
