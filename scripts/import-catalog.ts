// Catalog connector: imports sets/cards from the open PokemonTCG/pokemon-tcg-data dataset.
// Usage: bun scripts/import-catalog.ts base1 swsh7 sv3pt5 ...
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server/sandbox only).
const BASE = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master";
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" } as Record<string, string>;
if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;

async function upsert(table: string, rows: unknown[]) {
  const r = await fetch(`${url}/rest/v1/${table}`, { method: "POST", headers, body: JSON.stringify(rows) });
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
}

const ids = process.argv.slice(2);
const sets = (await (await fetch(`${BASE}/sets/en.json`)).json()) as any[];
for (const id of ids) {
  const s = sets.find((x) => x.id === id);
  if (!s) { console.error("set not found", id); continue; }
  await upsert("card_sets", [{ id, name: s.name, series: s.series, total: s.total, release_date: s.releaseDate.replaceAll("/", "-"), symbol_url: s.images.symbol, logo_url: s.images.logo }]);
  const cards = (await (await fetch(`${BASE}/cards/en/${id}.json`)).json()) as any[];
  await upsert("cards", cards.map((c) => ({
    id: c.id, set_id: id, name: c.name, number: c.number, rarity: c.rarity ?? null, supertype: c.supertype ?? null,
    subtypes: c.subtypes ?? [], types: c.types ?? [], artist: c.artist ?? null, image_small: c.images.small, image_large: c.images.large,
  })));
  console.log(id, cards.length);
}
