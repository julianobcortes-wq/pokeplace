import { createServerFn } from "@tanstack/react-start";
import { publicDb } from "./public-db";
import { catalogSearchInput } from "./catalog-validation";
import { localCard, localCardsBySet, localSearch, localSets, localStats, localTrending } from "./catalog/local";

function dbConfigured() {
  return Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_PUBLISHABLE_KEY"]);
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
    return localCard(data.id);
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
        return { set, cards: sorted };
      }
    } catch {
      /* catálogo local abaixo */
    }
    return { set: local.set, cards: local.cards };
  });

export const listSets = createServerFn({ method: "GET" }).handler(async () => {
  const seeded = localSets();
  if (!dbConfigured()) return seeded;
  try {
    const { data } = await publicDb().from("card_sets").select("*").order("release_date", { ascending: false });
    if (data && data.length > 0) return data;
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
      if (/^[a-z0-9]+-\d+/i.test(raw)) qb = qb.ilike("id", `${raw}%`);
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
  const { data } = await publicDb()
    .from("listings").select("id,price,currency,condition,card_id,cards(name,number,image_small,card_sets(name))")
    .eq("status", "active").gt("quantity", 0).order("created_at", { ascending: false }).limit(12);
  return data ?? [];
});

export const marketStats = createServerFn({ method: "GET" }).handler(async () => {
  if (!dbConfigured()) return localStats();
  const db = publicDb();
  const [cards, sets, listings] = await Promise.all([
    db.from("cards").select("id", { count: "exact", head: true }),
    db.from("card_sets").select("id", { count: "exact", head: true }),
    db.from("listings").select("seller_id").eq("status", "active").gt("quantity", 0).limit(1000),
  ]);
  return {
    cards: cards.count ?? 0,
    sets: sets.count ?? 0,
    offers: listings.data?.length ?? 0,
    stores: new Set((listings.data ?? []).map((l) => l.seller_id)).size,
  };
});

export const getTrends = createServerFn({ method: "GET" })
  .inputValidator((d: { ids: string[] }) => ({ ids: d.ids.slice(0, 40) }))
  .handler(async ({ data }) => {
    type Trend = { points: number[]; last: number; change: number | null; demo: boolean };
    const out: Record<string, Trend> = {};
    if (!data.ids.length) return out;

    if (dbConfigured()) {
      const { data: rows } = await publicDb().rpc("get_card_trends", { _ids: data.ids });
      for (const r of rows ?? []) {
        out[r.card_id] = {
          points: (r.points ?? []).map(Number),
          last: Number(r.last_price),
          change: r.change_pct == null ? null : Number(r.change_pct),
          demo: !!r.is_demo,
        };
      }
    }

    const missing = data.ids.filter((id) => !out[id]?.points?.length).slice(0, 24);
    if (missing.length) {
      const { quoteCard } = await import("@/lib/pricing/quote");
      const { buildReferenceSeries, seriesToTrend } = await import("@/lib/pricing/series");
      const quotes = await Promise.all(missing.map((id) => quoteCard(id)));
      for (const q of quotes) {
        const trend = seriesToTrend(buildReferenceSeries(q, 90));
        if (trend) out[q.cardId] = trend;
      }
    }
    return out;
  });

export const listStores = createServerFn({ method: "GET" }).handler(async () => {
  if (!dbConfigured()) return [];
  const { data } = await publicDb().rpc("list_public_sellers", { _limit: 8 });
  return data ?? [];
});

export const getStore = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    if (!dbConfigured()) return null;
    const db = publicDb();
    const { data: rows } = await db.rpc("get_public_seller", { _slug: data.slug });
    const store = rows?.[0];
    if (!store) return null;
    const [rep, listings, reviews] = await Promise.all([
      db.rpc("get_seller_trust", { _seller_id: store.id }),
      db.from("listings").select("id,price,currency,condition,language,finish,quantity,card_id,cards(name,number,rarity,image_small,card_sets(name))")
        .eq("seller_id", store.id).eq("status", "active").gt("quantity", 0).order("created_at", { ascending: false }).limit(200),
      db.from("seller_reviews").select("id,rating_service,rating_packaging,rating_shipping,comment,reply,replied_at,created_at")
        .eq("seller_id", store.id).order("created_at", { ascending: false }).limit(50),
    ]);
    return { store, reputation: rep.data?.[0] ?? null, listings: listings.data ?? [], reviews: reviews.data ?? [] };
  });

export const trendingCards = createServerFn({ method: "GET" }).handler(async () => {
  if (!dbConfigured()) return localTrending();
  const { data } = await publicDb().from("cards").select("id,name,number,rarity,image_small,set_id,card_sets(name)")
    .in("id", ["sv3pt5-199", "swsh7-215", "sv8pt5-161", "base1-4", "sv3pt5-151", "swsh12pt5-160", "sv4pt5-232", "sv6-214", "sv7-175", "sv8-238", "base1-2", "swsh7-218"]);
  if (data && data.length > 0) return data;
  return localTrending();
});
