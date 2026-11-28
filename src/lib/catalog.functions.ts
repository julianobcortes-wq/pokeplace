import { createServerFn } from "@tanstack/react-start";
import { publicDb } from "./public-db";
import { catalogSearchInput } from "./catalog-validation";
import {
  localCard,
  localCardsBySet,
  localSearch,
  localSets,
  localStats,
  localTrending,
  normalizeSetLogoUrl,
  type LocalCard,
  type LocalSet,
} from "./catalog/local";
import type { TrendSummary } from "./pricing/series";
import { tcgdexOutboundBudget } from "./rolling-budget";
import { isDemoMode } from "./demo-mode";
import {
  DEMO_STORES,
  getDemoLatestListings,
  getDemoPublicStores,
  getDemoStoreBySlug,
  getDemoTrend,
} from "./demo-data";

function dbConfigured() {
  return Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_PUBLISHABLE_KEY"]);
}

const cardMetaCache = new Map<
  string,
  { at: number; rarity: string | null; artist: string | null; types: string[] | null; subtypes: string[] | null }
>();
const META_TTL = 60 * 60 * 1000;

async function enrichLocalCard(card: LocalCard): Promise<LocalCard> {
  if (card.rarity && card.artist && card.types?.length) return card;
  const hit = cardMetaCache.get(card.id);
  if (hit && Date.now() - hit.at < META_TTL) {
    return {
      ...card,
      rarity: card.rarity ?? hit.rarity,
      artist: card.artist ?? hit.artist,
      types: card.types ?? hit.types,
      subtypes: card.subtypes ?? hit.subtypes,
    };
  }
  const { tcgdexCandidateIds } = await import("@/lib/pricing/quote");
  for (const candidate of tcgdexCandidateIds(card.id)) {
    if (!tcgdexOutboundBudget.tryTake()) return card;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(candidate)}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) continue;
      const body = (await res.json()) as {
        rarity?: string;
        illustrator?: string;
        types?: string[];
        stage?: string;
        category?: string;
      };
      const meta = {
        at: Date.now(),
        rarity: body.rarity ?? null,
        artist: body.illustrator ?? null,
        types: Array.isArray(body.types) && body.types.length ? body.types : null,
        subtypes: body.stage ? [body.stage] : null,
      };
      cardMetaCache.set(card.id, meta);
      return {
        ...card,
        rarity: card.rarity ?? meta.rarity,
        artist: card.artist ?? meta.artist,
        types: card.types ?? meta.types,
        subtypes: card.subtypes ?? meta.subtypes,
        supertype: body.category ?? card.supertype,
      };
    } catch {
      /* fallback to base card fields */
    } finally {
      clearTimeout(timer);
    }
  }
  cardMetaCache.set(card.id, { at: Date.now(), rarity: null, artist: null, types: null, subtypes: null });
  return card;
}

export const getCard = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    if (dbConfigured()) {
      try {
        const db = publicDb();
        const { data: card, error } = await db.from("cards").select("*, card_sets(*)").eq("id", data.id).maybeSingle();
        if (!error && card) return card;
      } catch {
        /* catálogo local abaixo */
      }
    }
    const local = localCard(data.id);
    return local ? enrichLocalCard(local) : null;
  });

export const getSet = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const local = localCardsBySet(data.id);
    if (!dbConfigured()) return { set: local.set, cards: local.cards };
    try {
      const db = publicDb();
      const [{ data: set }, { data: cards }] = await Promise.all([
        db.from("card_sets").select("*").eq("id", data.id).maybeSingle(),
        db.from("cards").select("id,name,number,rarity,image_small,set_id").eq("set_id", data.id).limit(400),
      ]);
      if (set && (cards?.length ?? 0) > 0) {
        const sorted = (cards ?? []).sort((a, b) => (parseInt(a.number) || 9999) - (parseInt(b.number) || 9999) || a.number.localeCompare(b.number));
        const normalizedSet = { ...(set as LocalSet), logo_url: normalizeSetLogoUrl((set as LocalSet).logo_url) };
        return { set: normalizedSet, cards: sorted };
      }
    } catch {
      /* catálogo local abaixo */
    }
    return { set: local.set, cards: local.cards };
  });

export const listSets = createServerFn({ method: "GET" }).handler(async (): Promise<LocalSet[]> => {
  const seeded = localSets();
  if (!dbConfigured()) return seeded;
  try {
    const { data, error } = await publicDb().from("card_sets").select("*").order("release_date", { ascending: false });
    if (!error && data && data.length > 0) {
      return (data as LocalSet[]).map((s) => ({ ...s, logo_url: normalizeSetLogoUrl(s.logo_url) }));
    }
  } catch {
    /* catálogo local abaixo */
  }
  return seeded;
});

export const searchCards = createServerFn({ method: "GET" })
  .inputValidator((d: { q?: string | undefined; set?: string | undefined; rarity?: string | undefined; limit?: number }) => catalogSearchInput.parse(d))
  .handler(async ({ data }) => {
    const seeded = () => localSearch(data);
    if (!dbConfigured()) return seeded();
    let qb = publicDb().from("cards").select("id,name,number,rarity,image_small,set_id,card_sets(name)").limit(data.limit ?? 60);
    const raw = (data.q ?? "").trim();
    if (raw) {
      // supports "charizard 4/102", "charizard 4", "sv3pt5-199"
      const parts = raw.split(/\s+/);
      const num = parts.find((p) => /^\d+(\/\d+)?$/.test(p));
      const name = parts.filter((p) => p !== num).join(" ");
      if (/^[a-z0-9.]+-\d+/i.test(raw)) qb = qb.ilike("id", `${raw}%`);
      else {
        if (name) qb = qb.ilike("name", `%${name}%`);
        const cardNumber = num?.split("/")[0];
        if (cardNumber) qb = qb.eq("number", cardNumber);
      }
    }
    if (data.set) qb = qb.eq("set_id", data.set);
    if (data.rarity) qb = qb.eq("rarity", data.rarity);
    try {
      const { data: rows, error } = await qb.order("name");
      if (!error && rows && rows.length > 0) return rows;
    } catch {
      /* catálogo local abaixo */
    }
    return seeded();
  });

export const latestListings = createServerFn({ method: "GET" }).handler(async () => {
  if (!dbConfigured()) return isDemoMode() ? getDemoLatestListings() : [];
  try {
    const { data, error } = await publicDb()
      .from("listings")
      .select("id,price,currency,condition,card_id,cards(name,number,image_small,card_sets(name))")
      .eq("status", "active")
      .gt("quantity", 0)
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
});

export const marketStats = createServerFn({ method: "GET" }).handler(async () => {
  if (!dbConfigured()) {
    const base = localStats();
    if (!isDemoMode()) return base;
    return {
      ...base,
      offers: DEMO_STORES.reduce((acc, s) => acc + s.active_listings, 0),
      stores: DEMO_STORES.length,
    };
  }
  try {
    const db = publicDb();
    const [cards, sets, listings] = await Promise.all([
      db.from("cards").select("id", { count: "exact", head: true }),
      db.from("card_sets").select("id", { count: "exact", head: true }),
      db.from("listings").select("seller_id").eq("status", "active").gt("quantity", 0).limit(1000),
    ]);
    if (cards.error || sets.error || !cards.count) return localStats();
    return {
      cards: cards.count,
      sets: sets.count ?? 0,
      offers: listings.data?.length ?? 0,
      stores: new Set((listings.data ?? []).map((l) => l.seller_id)).size,
      sample: false as const,
    };
  } catch {
    return localStats();
  }
});

const trendCache = new Map<string, { at: number; value: TrendSummary | null }>();
const trendInFlight = new Map<string, Promise<TrendSummary | null>>();
const TREND_CACHE_TTL = 15 * 60 * 1000;
const MAX_TREND_IDS = 30;
const MAX_UNCACHED_EXTERNAL_QUOTES = 6;

export const getTrends = createServerFn({ method: "GET" })
  .inputValidator((d: { ids: string[] }) => ({
    ids: [...new Set((d.ids ?? []).map((id) => id.trim()).filter((id) => /^[a-z0-9._-]{2,48}$/i.test(id)))].slice(
      0,
      MAX_TREND_IDS,
    ),
  }))
  .handler(async ({ data }) => {
    const out: Record<string, TrendSummary> = {};
    if (!data.ids.length) return out;

    if (dbConfigured()) {
      try {
        const { data: rows, error } = await publicDb().rpc("get_card_trends", { _ids: data.ids });
        if (!error) {
          for (const r of rows ?? []) {
            const pts = (r.points ?? []).map(Number).filter((n) => Number.isFinite(n));
            if (!pts.length) continue;
            out[r.card_id] = {
              points: pts,
              last: Number(r.last_price),
              change: r.change_pct == null ? null : Number(r.change_pct),
              demo: !!r.is_demo,
              currency: "BRL",
            };
          }
        }
      } catch {
        /* fallback TCGdex abaixo */
      }
    }

    const now = Date.now();
    const uncachedMissing: string[] = [];
    for (const id of data.ids) {
      if (out[id]?.points?.length) continue;
      const hit = trendCache.get(id);
      if (hit && now - hit.at < TREND_CACHE_TTL) {
        if (hit.value) out[id] = hit.value;
        continue;
      }
      uncachedMissing.push(id);
    }

    const batch = uncachedMissing.slice(0, MAX_UNCACHED_EXTERNAL_QUOTES);
    if (batch.length) {
      const [{ quoteCard }, { buildReferenceSeries, seriesToTrend }, { getFxRates, fxRateToBrl }] = await Promise.all([
        import("@/lib/pricing/quote"),
        import("@/lib/pricing/series"),
        import("@/lib/pricing/fx"),
      ]);
      const fx = await getFxRates();
      const fetchOne = (id: string): Promise<TrendSummary | null> => {
        const inflight = trendInFlight.get(id);
        if (inflight) return inflight;
        const job = (async () => {
          try {
            if (!tcgdexOutboundBudget.tryTake()) return null;
            const q = await quoteCard(id);
            const mult = fxRateToBrl(q.currency, fx);
            const trend = seriesToTrend(
              buildReferenceSeries(q, 90, undefined, { currency: "BRL", multiplier: mult }),
              "BRL",
            );
            trendCache.set(id, { at: Date.now(), value: trend });
            return trend;
          } finally {
            trendInFlight.delete(id);
          }
        })();
        trendInFlight.set(id, job);
        return job;
      };

      const concurrency = 4;
      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
        while (cursor < batch.length) {
          const idx = cursor++;
          const id = batch[idx];
          if (!id) continue;
          const trend = await fetchOne(id);
          if (trend) out[id] = trend;
        }
      });
      await Promise.all(workers);
    }
    if (isDemoMode()) {
      for (const id of data.ids) {
        if (!out[id]?.points?.length) {
          out[id] = getDemoTrend(id);
        }
      }
    }
    return out;
  });

export const listStores = createServerFn({ method: "GET" }).handler(async () => {
  if (!dbConfigured()) return isDemoMode() ? getDemoPublicStores() : [];
  try {
    const { data, error } = await publicDb().rpc("list_public_sellers", { _limit: 8 });
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
});

export const getStore = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    if (!dbConfigured()) return isDemoMode() ? getDemoStoreBySlug(data.slug) : null;
    try {
      const db = publicDb();
      const { data: rows, error } = await db.rpc("get_public_seller", { _slug: data.slug });
      if (error) return null;
      const store = rows?.[0];
      if (!store) return null;
      const [rep, thermo, listings, reviews] = await Promise.all([
        db.rpc("get_seller_trust", { _seller_id: store.id }),
        (db as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown[] | null; error: unknown }>;
        })
          .rpc("get_seller_thermometer", { _seller_id: store.id })
          .catch(() => ({ data: null, error: null })),
        db
          .from("listings")
          .select("id,price,currency,condition,language,finish,quantity,card_id,cards(name,number,rarity,image_small,card_sets(name))")
          .eq("seller_id", store.id)
          .eq("status", "active")
          .gt("quantity", 0)
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("seller_reviews")
          .select("id,rating_service,rating_packaging,rating_shipping,comment,reply,replied_at,created_at")
          .eq("seller_id", store.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      const tRow = Array.isArray(thermo.data) && thermo.data[0] ? (thermo.data[0] as Record<string, unknown>) : null;
      return {
        store,
        reputation: rep.data?.[0] ?? null,
        thermometer: tRow
          ? {
              claim_rate: Number(tRow["claim_rate"] ?? 0),
              cancel_rate: Number(tRow["cancel_rate"] ?? 0),
              on_time_rate: Number(tRow["on_time_rate"] ?? 100),
              avg_response_hours: tRow["avg_response_hours"] != null ? Number(tRow["avg_response_hours"]) : null,
              thermometer: String(tRow["thermometer"] ?? "new"),
              medal: String(tRow["medal"] ?? "none"),
              strike_status: String(tRow["strike_status"] ?? "ok"),
              score: Number(tRow["score"] ?? 0),
            }
          : null,
        listings: listings.data ?? [],
        reviews: reviews.data ?? [],
      };
    } catch {
      return null;
    }
  });

export const trendingCards = createServerFn({ method: "GET" }).handler(async () => {
  if (!dbConfigured()) return localTrending();
  try {
    const { data, error } = await publicDb()
      .from("cards")
      .select("id,name,number,rarity,image_small,set_id,card_sets(name)")
      .in("id", [
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
      ]);
    if (!error && data && data.length > 0) return data;
  } catch {
    /* catálogo local abaixo */
  }
  return localTrending();
});
