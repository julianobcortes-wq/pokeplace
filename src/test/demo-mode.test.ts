import { describe, expect, it } from "vitest";
import { DEMO_COUPON_CODE, isDemoMode } from "@/lib/demo-mode";
import {
  DEMO_STORES,
  getDemoBuyerRankings,
  getDemoCardOffers,
  getDemoCartMetadata,
  getDemoLatestListings,
  getDemoPublicCollection,
  getDemoPublicStores,
  getDemoQuote,
  getDemoSellerRankings,
  getDemoStoreBySlug,
  getDemoTrend,
  validateDemoCoupon,
} from "@/lib/demo-data";

describe("demo mode & static showcase data", () => {
  it("stays disabled by default outside the Pages build", () => {
    expect(isDemoMode()).toBe(false);
  });

  it("provides deterministic quotes, trends, and card offers for seeded cards", () => {
    const q1 = getDemoQuote("base1-4");
    const q2 = getDemoQuote("base1-4");
    expect(q1.available).toBe(true);
    expect(q1.price).toBeGreaterThan(0);
    expect(q1.price).toBe(q2.price);

    const trend = getDemoTrend("base1-4");
    expect(trend.points.length).toBeGreaterThanOrEqual(7);
    expect(trend.last).toBeGreaterThan(0);
    expect(trend.currency).toBe("BRL");

    const offers = getDemoCardOffers("base1-4", 5.5);
    expect(offers.length).toBeGreaterThanOrEqual(2);
    expect(offers[0]!.price).toBeLessThanOrEqual(offers[offers.length - 1]!.price);
  });

  it("exposes sample stores, listings, rankings, cart metadata, and DEMO10 coupon", () => {
    expect(DEMO_STORES.length).toBeGreaterThanOrEqual(4);
    expect(getDemoPublicStores().length).toBe(DEMO_STORES.length);
    expect(getDemoLatestListings().length).toBeGreaterThanOrEqual(8);

    const store = getDemoStoreBySlug("pokevault-sp");
    expect(store).not.toBeNull();
    expect(store!.listings.length).toBeGreaterThan(0);
    expect(store!.reviews.length).toBeGreaterThan(0);

    const sellers = getDemoSellerRankings({ sort: "score" });
    expect(sellers.length).toBe(DEMO_STORES.length);
    expect(sellers[0]!.score).toBeGreaterThanOrEqual(sellers[sellers.length - 1]!.score);

    const buyers = getDemoBuyerRankings();
    expect(buyers.length).toBeGreaterThanOrEqual(4);

    const offers = getDemoCardOffers("base1-4", 5.5);
    const meta = getDemoCartMetadata(offers.map((o) => o.listing_id));
    expect(meta.sellers.length).toBe(offers.length);
    expect(meta.profiles.length).toBeGreaterThan(0);

    const ok = validateDemoCoupon(DEMO_COUPON_CODE, 200);
    expect(ok.valid).toBe(true);
    expect(ok.discount).toBe(20);
    expect(validateDemoCoupon("INVALID", 200).valid).toBe(false);

    const pubCol = getDemoPublicCollection("colecionador-demo");
    expect(pubCol.length).toBeGreaterThan(0);
    expect(getDemoPublicCollection("nao-existe")).toEqual([]);
  });
});
