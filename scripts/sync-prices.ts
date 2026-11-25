/**
 * Daily price snapshot from TCGdex into price_observations.
 * Usage: bun scripts/sync-prices.ts [--limit=200]
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const headers: Record<string, string> = {
  apikey: key,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};
if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 500;

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init?.headers as object) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

type CardRow = { id: string };
type Variant = {
  pricing?: {
    tcgplayer?: { unit?: string; holofoil?: { marketPrice?: number }; normal?: { marketPrice?: number }; reverseHolofoil?: { marketPrice?: number } };
    cardmarket?: { unit?: string; avg?: number | null; avg7?: number | null };
  };
};

const cards = await rest<CardRow[]>(`cards?select=id&limit=${limit}`);
if (!cards?.length) {
  console.error("No cards in database. Run import-catalog.ts first.");
  process.exit(1);
}

const now = new Date().toISOString();
let ok = 0;
let miss = 0;

for (const card of cards) {
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(card.id)}`);
    if (!res.ok) {
      miss++;
      continue;
    }
    const body = (await res.json()) as { variants_detailed?: Variant[]; pricing?: Variant["pricing"] };
    const variants = body.variants_detailed ?? [];
    const rows: Record<string, unknown>[] = [];

    for (const v of variants.length ? variants : [{ pricing: body.pricing }]) {
      const tcg = v.pricing?.tcgplayer;
      const bucket = tcg?.holofoil ?? tcg?.normal ?? tcg?.reverseHolofoil;
      const usd = bucket?.marketPrice;
      if (usd != null && Number.isFinite(usd) && usd > 0) {
        rows.push({
          card_id: card.id,
          market_code: "US",
          source: "tcgdex",
          source_url: `https://api.tcgdex.net/v2/en/cards/${card.id}`,
          price_type: "market",
          language: "en",
          finish: tcg?.holofoil ? "holo" : tcg?.reverseHolofoil ? "reverse" : "normal",
          condition: "NM",
          graded: false,
          currency: tcg?.unit ?? "USD",
          amount: usd,
          observed_at: now,
        });
      }
      const cm = v.pricing?.cardmarket;
      const eur = cm?.avg7 ?? cm?.avg;
      if (eur != null && Number.isFinite(eur) && eur > 0) {
        rows.push({
          card_id: card.id,
          market_code: "EU",
          source: "tcgdex",
          source_url: `https://api.tcgdex.net/v2/en/cards/${card.id}`,
          price_type: "market",
          language: "en",
          finish: "normal",
          condition: "NM",
          graded: false,
          currency: cm?.unit ?? "EUR",
          amount: eur,
          observed_at: now,
        });
      }
    }

    if (!rows.length) {
      miss++;
      continue;
    }
    await rest("price_observations", { method: "POST", body: JSON.stringify(rows) });
    ok++;
    await new Promise((r) => setTimeout(r, 80));
  } catch (e) {
    console.warn(card.id, e instanceof Error ? e.message : e);
    miss++;
  }
}

console.log(JSON.stringify({ synced: ok, missed: miss, total: cards.length, at: now }));
