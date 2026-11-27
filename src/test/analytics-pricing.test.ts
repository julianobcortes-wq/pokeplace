import { describe, expect, it } from "vitest";
import {
  computeSellerAnalytics,
  suggestListingPrice,
  type SellerInventoryItem,
  type SellerSaleItem,
} from "@/lib/marketplace/analytics";

describe("seller analytics aggregation", () => {
  const now = new Date("2026-11-27T12:00:00Z").getTime();

  const sales: SellerSaleItem[] = [
    {
      id: "s1",
      order_id: "o1",
      card_id: "sv3pt5-199",
      card_name: "Charizard ex",
      quantity: 1,
      unit_price: 600,
      commission: 48,
      status: "delivered",
      created_at: "2026-11-25T10:00:00Z",
    },
    {
      id: "s2",
      order_id: "o2",
      card_id: "sv3pt5-198",
      card_name: "Venusaur ex",
      quantity: 2,
      unit_price: 150,
      commission: 24,
      status: "shipped",
      created_at: "2026-11-10T10:00:00Z",
    },
    {
      id: "s3",
      order_id: "o3",
      card_id: "sv3pt5-199",
      card_name: "Charizard ex",
      quantity: 1,
      unit_price: 550,
      commission: 44,
      status: "cancelled",
      created_at: "2026-11-26T10:00:00Z",
    },
  ];

  const inventory: SellerInventoryItem[] = [
    { id: "l1", card_id: "sv3pt5-199", price: 620, quantity: 2, status: "active" },
    { id: "l2", card_id: "sv3pt5-198", price: 160, quantity: 5, status: "paused" },
  ];

  it("filters by 7d window and excludes cancelled sales", () => {
    const res = computeSellerAnalytics({ items: sales, inventory, period: "7d", nowMs: now });
    expect(res.ordersCount).toBe(1);
    expect(res.unitsSold).toBe(1);
    expect(res.grossRevenue).toBe(600);
    expect(res.totalCommission).toBe(48);
    expect(res.netRevenue).toBe(552);
    expect(res.averageTicket).toBe(600);
    expect(res.activeListingsCount).toBe(1);
    expect(res.totalInventoryUnits).toBe(2);
    expect(res.inventoryValueBrl).toBe(1240);
    expect(res.sellThroughPct).toBe(33.33);
  });

  it("aggregates 30d window with top cards and daily series", () => {
    const res = computeSellerAnalytics({ items: sales, inventory, period: "30d", nowMs: now });
    expect(res.ordersCount).toBe(2);
    expect(res.unitsSold).toBe(3);
    expect(res.grossRevenue).toBe(900);
    expect(res.netRevenue).toBe(828);
    expect(res.averageTicket).toBe(450);
    expect(res.topCards[0]?.cardId).toBe("sv3pt5-199");
    expect(res.dailySeries).toHaveLength(2);
  });
});

describe("smart listing price suggestion", () => {
  it("undercuts lowest competitor while guarding against dumping below 85% reference", () => {
    const sug = suggestListingPrice({
      referenceBrl: 200,
      competingPrices: [195, 210, 220],
      condition: "NM",
    });
    expect(sug?.suggestedBrl).toBe(191.1);
    expect(sug?.competitiveBrl).toBe(195);
    expect(sug?.referenceBrl).toBe(200);
  });

  it("protects floor when a competitor dumps far below reference", () => {
    const sug = suggestListingPrice({
      referenceBrl: 200,
      competingPrices: [100],
      condition: "NM",
    });
    expect(sug?.suggestedBrl).toBe(170);
  });

  it("uses condition-adjusted reference when no competitors exist", () => {
    const sug = suggestListingPrice({
      referenceBrl: 100,
      competingPrices: [],
      condition: "SP",
    });
    expect(sug?.suggestedBrl).toBe(85);
    expect(sug?.competitiveBrl).toBeNull();
  });

  it("returns null when neither reference nor competing prices exist", () => {
    expect(
      suggestListingPrice({ referenceBrl: null, competingPrices: [], condition: "NM" }),
    ).toBeNull();
  });
});
