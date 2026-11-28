import { createServerFn } from "@tanstack/react-start";
import { publicDb } from "@/lib/public-db";
import { localCard, localTrending, type LocalCard } from "@/lib/catalog/local";
import { getTrends } from "@/lib/catalog.functions";
import { isDemoMode } from "@/lib/demo-mode";
import { getDemoBuyerRankings, getDemoSellerRankings } from "@/lib/demo-data";
import {
  computeSellerThermometer,
  type BuyerTier,
  type SellerMedal,
  type StrikeStatus,
  type ThermometerLevel,
} from "./rules";

function dbConfigured() {
  return Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_PUBLISHABLE_KEY"]);
}

export type RankedSeller = {
  id: string;
  store_name: string;
  slug: string;
  city: string | null;
  state: string | null;
  is_official: boolean;
  logo_url: string | null;
  rating: number;
  reviews: number;
  completed_sales: number;
  active_listings: number;
  claim_rate: number;
  cancel_rate: number;
  on_time_rate: number;
  avg_response_hours: number | null;
  thermometer: ThermometerLevel;
  medal: SellerMedal;
  strike_status: StrikeStatus;
  score: number;
};

export type RankedBuyer = {
  display_name: string;
  completed_purchases: number;
  rating: number;
  reviews: number;
  dispute_rate: number;
  tier: BuyerTier;
  score: number;
};

export type RankedCard = {
  id: string;
  name: string;
  number: string;
  setName: string;
  rarity: string | null;
  image_small: string | null;
  priceBrl: number;
  changePct: number;
  points: number[];
  demo: boolean;
};

export type MarketCardRankings = {
  gainers: RankedCard[];
  losers: RankedCard[];
  valuable: RankedCard[];
  updatedAt: string;
};

const RANKING_CARD_IDS = [
  "sv3pt5-199",
  "swsh7-215",
  "sv8pt5-161",
  "base1-4",
  "sv3pt5-151",
  "swsh12pt5-160",
  "sv4pt5-232",
  "sv6-214",
  "sv7-175",
  "sv8-238",
  "base1-2",
  "swsh7-218",
  "base1-15",
  "sv3pt5-198",
  "sv3pt5-200",
  "swsh7-209",
  "sv8pt5-156",
  "sv8pt5-162",
  "sv4-245",
  "sv2-269",
  "swsh11-186",
  "swsh8-271",
  "sv5-218",
  "sv1-254",
];

let cardRankCache: { at: number; data: MarketCardRankings } | null = null;
const CARD_RANK_TTL_MS = 10 * 60 * 1000;

export const getSellerRankings = createServerFn({ method: "GET" })
  .inputValidator((d: { state?: string | undefined; sort?: "score" | "sales" | "rating" | undefined; limit?: number | undefined }) => d)
  .handler(async ({ data }): Promise<RankedSeller[]> => {
    if (!dbConfigured()) return isDemoMode() ? getDemoSellerRankings(data) : [];
    const limit = Math.max(1, Math.min(data.limit ?? 50, 100));
    const sort = data.sort ?? "score";
    const state = data.state?.trim().toUpperCase() || null;

    try {
      const db = publicDb();
      const { data: rows, error } = await (db as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown[] | null; error: unknown }>;
      }).rpc("list_ranked_sellers", { _state: state, _sort: sort, _limit: limit });

      if (!error && Array.isArray(rows)) {
        return rows.map((r) => {
          const row = r as Record<string, unknown>;
          return {
            id: String(row["id"] ?? ""),
            store_name: String(row["store_name"] ?? ""),
            slug: String(row["slug"] ?? ""),
            city: row["city"] ? String(row["city"]) : null,
            state: row["state"] ? String(row["state"]) : null,
            is_official: Boolean(row["is_official"]),
            logo_url: row["logo_url"] ? String(row["logo_url"]) : null,
            rating: Number(row["rating"] ?? 0),
            reviews: Number(row["reviews"] ?? 0),
            completed_sales: Number(row["completed_sales"] ?? 0),
            active_listings: Number(row["active_listings"] ?? 0),
            claim_rate: Number(row["claim_rate"] ?? 0),
            cancel_rate: Number(row["cancel_rate"] ?? 0),
            on_time_rate: Number(row["on_time_rate"] ?? 100),
            avg_response_hours: row["avg_response_hours"] != null ? Number(row["avg_response_hours"]) : null,
            thermometer: String(row["thermometer"] ?? "new") as ThermometerLevel,
            medal: String(row["medal"] ?? "none") as SellerMedal,
            strike_status: String(row["strike_status"] ?? "ok") as StrikeStatus,
            score: Number(row["score"] ?? 0),
          };
        });
      }

      // Graceful fallback when migration 0013 has not yet been applied to remote Supabase
      const fallback = await db.rpc("list_public_sellers", { _limit: limit });
      if (fallback.error || !Array.isArray(fallback.data)) return [];
      const mapped: RankedSeller[] = fallback.data
        .filter((s) => !state || (s.state ?? "").toUpperCase() === state)
        .map((s) => {
          const calc = computeSellerThermometer({
            rating: Number(s.rating ?? 0),
            reviews: Number(s.reviews ?? 0),
            completedSales: Number(s.completed_sales ?? 0),
            cancelled: 0,
            totalItems: Number(s.completed_sales ?? 0),
            claims: 0,
          });
          return {
            id: s.id,
            store_name: s.store_name,
            slug: s.slug,
            city: s.city,
            state: s.state,
            is_official: Boolean(s.is_official),
            logo_url: s.logo_url,
            rating: Number(s.rating ?? 0),
            reviews: Number(s.reviews ?? 0),
            completed_sales: Number(s.completed_sales ?? 0),
            active_listings: Number(s.active_listings ?? 0),
            claim_rate: calc.claimRate,
            cancel_rate: calc.cancelRate,
            on_time_rate: calc.onTimeRate,
            avg_response_hours: null,
            thermometer: calc.thermometer,
            medal: calc.medal,
            strike_status: calc.strikeStatus,
            score: calc.score,
          };
        });

      mapped.sort((a, b) =>
        sort === "sales"
          ? b.completed_sales - a.completed_sales
          : sort === "rating"
            ? b.rating - a.rating
            : b.score - a.score,
      );
      return mapped;
    } catch {
      return [];
    }
  });

export const getBuyerRankings = createServerFn({ method: "GET" })
  .inputValidator((d: { limit?: number }) => d)
  .handler(async ({ data }): Promise<RankedBuyer[]> => {
    if (!dbConfigured()) return isDemoMode() ? getDemoBuyerRankings() : [];
    const limit = Math.max(1, Math.min(data.limit ?? 50, 100));
    try {
      const db = publicDb();
      const { data: rows, error } = await (db as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown[] | null; error: unknown }>;
      }).rpc("list_ranked_buyers", { _limit: limit });
      if (error || !Array.isArray(rows)) return [];
      return rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          display_name: String(row["display_name"] ?? "Colecionador"),
          completed_purchases: Number(row["completed_purchases"] ?? 0),
          rating: Number(row["rating"] ?? 0),
          reviews: Number(row["reviews"] ?? 0),
          dispute_rate: Number(row["dispute_rate"] ?? 0),
          tier: String(row["tier"] ?? "novo") as BuyerTier,
          score: Number(row["score"] ?? 0),
        };
      });
    } catch {
      return [];
    }
  });

export const getMarketCardRankings = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketCardRankings> => {
    if (cardRankCache && Date.now() - cardRankCache.at < CARD_RANK_TTL_MS) {
      return cardRankCache.data;
    }

    const byId = new Map<string, LocalCard>();
    for (const c of localTrending()) byId.set(c.id, c);
    for (const id of RANKING_CARD_IDS) {
      if (!byId.has(id)) {
        const found = localCard(id);
        if (found) byId.set(found.id, found);
      }
    }

    const cards = [...byId.values()].slice(0, 24);
    const trends = await getTrends({ data: { ids: cards.map((c) => c.id) } });

    const ranked: RankedCard[] = [];
    for (const c of cards) {
      const t = trends[c.id];
      if (!t || !Number.isFinite(t.last) || t.last <= 0) continue;
      ranked.push({
        id: c.id,
        name: c.name,
        number: c.number,
        setName: c.card_sets?.name ?? c.set_id,
        rarity: c.rarity,
        image_small: c.image_small,
        priceBrl: t.last,
        changePct: t.change ?? 0,
        points: t.points,
        demo: t.demo,
      });
    }

    const gainers = [...ranked]
      .filter((c) => c.changePct >= 0)
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 8);
    const losers = [...ranked]
      .filter((c) => c.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct)
      .slice(0, 8);
    const valuable = [...ranked].sort((a, b) => b.priceBrl - a.priceBrl).slice(0, 8);

    const result: MarketCardRankings = {
      gainers,
      losers,
      valuable,
      updatedAt: new Date().toISOString(),
    };
    cardRankCache = { at: Date.now(), data: result };
    return result;
  },
);
