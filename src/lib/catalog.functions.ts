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
  if (!dbConfigured()) return [];
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
  if (!dbConfigured()) return localStats();
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

export const getTrends = createServerFn({ method: "GET" })
  .inputValidator((d: { ids: string[] }) => ({ ids: d.ids.slice(0, 40) }))
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

    const missing = data.ids.filter((id) => !out[id]?.points?.length).slice(0, 40);
    if (missing.length) {
      const [{ quoteCard }, { buildReferenceSeries, seriesToTrend }, { getFxRates, fxRateToBrl }] = await Promise.all([
        import("@/lib/pricing/quote"),
        import("@/lib/pricing/series"),
        import("@/lib/pricing/fx"),
      ]);
      const fx = await getFxRates();
      const concurrency = 8;
      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, missing.length) }, async () => {
        while (cursor < missing.length) {
          const idx = cursor++;
          const id = missing[idx];
          if (!id) continue;
          const q = await quoteCard(id);
          const mult = fxRateToBrl(q.currency, fx);
          const trend = seriesToTrend(buildReferenceSeries(q, 90, undefined, { currency: "BRL", multiplier: mult }), "BRL");
          if (trend) out[q.cardId] = trend;
        }
      });
      await Promise.all(workers);
    }
    return out;
  });

export const listStores = createServerFn({ method: "GET" }).handler(async () => {
  if (!dbConfigured()) return [];
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
    if (!dbConfigured()) return null;
    try {
      const db = publicDb();
      const { data: rows, error } = await db.rpc("get_public_seller", { _slug: data.slug });
      if (error) return null;
      const store = rows?.[0];
      if (!store) return null;
      const [rep, listings, reviews] = await Promise.all([
        db.rpc("get_seller_trust", { _seller_id: store.id }),
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
      return { store, reputation: rep.data?.[0] ?? null, listings: listings.data ?? [], reviews: reviews.data ?? [] };
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
