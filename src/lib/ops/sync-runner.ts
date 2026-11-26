import { parseTcgdexCardPricing, tcgdexCandidateIds } from "@/lib/pricing/quote";

export const DEFAULT_CATALOG_SETS = [
  "base1",
  "base2",
  "base3",
  "swsh7",
  "swsh12pt5",
  "sv1",
  "sv3",
  "sv3pt5",
  "sv8",
  "sv8pt5",
] as const;

const SET_ID_RE = /^[a-z0-9]{2,16}$/;
const POKEMON_TCG_RAW = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master";
const TCGDEX_API = "https://api.tcgdex.net/v2/en/cards";

export function sanitizeSetIds(input: string[], max = 4): string[] {
  const unique: string[] = [];
  for (const raw of input) {
    const id = raw.trim().toLowerCase();
    if (!SET_ID_RE.test(id)) continue;
    if (!unique.includes(id)) unique.push(id);
    if (unique.length >= max) break;
  }
  return unique;
}

export async function importCatalogBatch(rawSetIds: string[]): Promise<{
  importedSets: string[];
  importedCards: number;
  skipped: string[];
}> {
  const targets = sanitizeSetIds(rawSetIds, 4);
  if (targets.length === 0) {
    throw new Error("Informe pelo menos um código de coleção válido (ex.: base1, sv3pt5).");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const setsRes = await fetch(`${POKEMON_TCG_RAW}/sets/en.json`);
  if (!setsRes.ok) throw new Error(`Falha ao buscar lista de coleções (${setsRes.status})`);
  const allSets = (await setsRes.json()) as Array<{
    id: string;
    name: string;
    series: string;
    total: number;
    releaseDate: string;
    images: { symbol: string; logo: string };
  }>;

  const importedSets: string[] = [];
  const skipped: string[] = [];
  let importedCards = 0;

  for (const id of targets) {
    const s = allSets.find((x) => x.id === id);
    if (!s) {
      skipped.push(id);
      continue;
    }
    const { error: setErr } = await supabaseAdmin.from("card_sets").upsert(
      {
        id: s.id,
        name: s.name,
        series: s.series,
        total: s.total,
        release_date: s.releaseDate.replaceAll("/", "-"),
        symbol_url: s.images?.symbol ?? null,
        logo_url: s.images?.logo ?? null,
      },
      { onConflict: "id" },
    );
    if (setErr) throw new Error(`card_sets (${id}): ${setErr.message}`);

    const cardsRes = await fetch(`${POKEMON_TCG_RAW}/cards/en/${encodeURIComponent(id)}.json`);
    if (!cardsRes.ok) {
      skipped.push(id);
      continue;
    }
    const cards = (await cardsRes.json()) as Array<{
      id: string;
      name: string;
      number: string;
      rarity?: string;
      supertype?: string;
      subtypes?: string[];
      types?: string[];
      artist?: string;
      images?: { small?: string; large?: string };
    }>;

    // Upsert in chunks of 100 to stay well within PostgREST payload limits.
    for (let i = 0; i < cards.length; i += 100) {
      const chunk = cards.slice(i, i + 100).map((c) => ({
        id: c.id,
        set_id: id,
        name: c.name,
        number: c.number,
        rarity: c.rarity ?? null,
        supertype: c.supertype ?? null,
        subtypes: c.subtypes ?? [],
        types: c.types ?? [],
        artist: c.artist ?? null,
        image_small: c.images?.small ?? null,
        image_large: c.images?.large ?? null,
      }));
      const { error: cardErr } = await supabaseAdmin.from("cards").upsert(chunk, { onConflict: "id" });
      if (cardErr) throw new Error(`cards (${id}): ${cardErr.message}`);
    }

    importedSets.push(id);
    importedCards += cards.length;
  }

  return { importedSets, importedCards, skipped };
}

export async function syncPricesBatch(limit = 25): Promise<{
  checked: number;
  inserted: number;
}> {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 40));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: cards, error } = await supabaseAdmin.from("cards").select("id").limit(safeLimit);
  if (error) throw new Error(`cards: ${error.message}`);
  if (!cards?.length) return { checked: 0, inserted: 0 };

  const observedAt = new Date().toISOString();
  const rows: Array<{
    card_id: string;
    market_code: string;
    source: string;
    source_url: string;
    price_type: string;
    language: string;
    finish: string;
    condition: string;
    graded: boolean;
    currency: string;
    amount: number;
    observed_at: string;
  }> = [];

  for (const c of cards) {
    for (const candidate of tcgdexCandidateIds(c.id)) {
      try {
        const sourceUrl = `${TCGDEX_API}/${encodeURIComponent(candidate)}`;
        const res = await fetch(sourceUrl, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) continue;
        const raw = (await res.json()) as Record<string, unknown>;
        const parsed = parseTcgdexCardPricing(c.id, raw);
        if (!parsed) continue;
        if (parsed.tcgplayer?.market) {
          rows.push({
            card_id: c.id,
            market_code: "US",
            source: "tcgdex",
            source_url: sourceUrl,
            price_type: "market",
            language: "en",
            finish: parsed.tcgplayer.finish.toLowerCase().includes("reverse")
              ? "reverse"
              : parsed.tcgplayer.finish.toLowerCase().includes("holo")
                ? "holo"
                : "normal",
            condition: "NM",
            graded: false,
            currency: parsed.tcgplayer.currency,
            amount: parsed.tcgplayer.market,
            observed_at: observedAt,
          });
        }
        const cmPrice = parsed.cardmarket?.trend ?? parsed.cardmarket?.avg ?? parsed.cardmarket?.avg7;
        if (cmPrice && parsed.cardmarket) {
          rows.push({
            card_id: c.id,
            market_code: "EU",
            source: "tcgdex",
            source_url: sourceUrl,
            price_type: "market",
            language: "en",
            finish: "normal",
            condition: "NM",
            graded: false,
            currency: parsed.cardmarket.currency,
            amount: cmPrice,
            observed_at: observedAt,
          });
        }
        break;
      } catch {
        continue;
      }
    }
  }

  if (rows.length > 0) {
    const { error: insErr } = await supabaseAdmin.from("price_observations").insert(rows);
    if (insErr) throw new Error(`price_observations: ${insErr.message}`);
  }

  return { checked: cards.length, inserted: rows.length };
}

export function verifyCronBearer(request: Request): { ok: boolean; status: number } {
  const secret = process.env["CRON_SECRET"]?.trim();
  if (!secret) return { ok: false, status: 503 };
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return { ok: false, status: 401 };
  const token = auth.slice("Bearer ".length).trim();
  if (token.length !== secret.length) return { ok: false, status: 401 };
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0 ? { ok: true, status: 200 } : { ok: false, status: 401 };
}
