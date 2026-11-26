import seed from "./seed.json";

export type LocalSet = {
  id: string;
  name: string;
  series: string | null;
  release_date: string | null;
  total: number | null;
  official?: number;
  logo_url: string | null;
  symbol_url: string | null;
  sample?: boolean;
  source: string;
};

export type LocalCard = {
  id: string;
  name: string;
  number: string;
  rarity: string | null;
  image_small: string | null;
  image_large: string | null;
  set_id: string;
  supertype: string | null;
  subtypes: string[] | null;
  types: string[] | null;
  artist: string | null;
  source: string;
  card_sets: LocalSet;
};

/** TCGdex logo/symbol URLs omit the file extension in raw API responses and 404 unless .webp/.png is appended. */
export function normalizeSetLogoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https:\/\/assets\.tcgdex\.net\/.+\/(logo|symbol)$/i.test(trimmed)) {
    return `${trimmed}.webp`;
  }
  return trimmed;
}

type RawSeedSet = Omit<LocalSet, "symbol_url"> & { asset_base?: string };
type RawSeedCardTuple = [setIdx: number, id: string, number: string, name: string];

const rawSets = seed.sets as RawSeedSet[];
const sets: LocalSet[] = rawSets.map(({ asset_base: _a, ...s }) => ({
  ...s,
  logo_url: normalizeSetLogoUrl(s.logo_url),
  symbol_url: null,
}));
const setById = new Map(sets.map((s) => [s.id, s]));

const cards: LocalCard[] = (seed.cards as RawSeedCardTuple[]).map(([setIdx, id, number, name]) => {
  const rawSet = rawSets[setIdx];
  const set = sets[setIdx];
  if (!rawSet || !set) throw new Error(`Coleção ausente no catálogo local: index ${setIdx}`);
  const base = rawSet.asset_base ? `${rawSet.asset_base}/${number}` : null;
  return {
    id,
    name,
    number,
    rarity: null,
    image_small: base ? `${base}/low.webp` : null,
    image_large: base ? `${base}/high.webp` : null,
    set_id: set.id,
    supertype: "Pokémon",
    subtypes: null,
    types: null,
    artist: null,
    source: set.source,
    card_sets: set,
  };
});
const cardById = new Map(cards.map((c) => [c.id, c]));

export function localSets(): LocalSet[] {
  return [...sets].sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""));
}

export function localCard(id: string): LocalCard | null {
  return cardById.get(id) ?? null;
}

export function localCardsBySet(setId: string): { set: LocalSet | null; cards: LocalCard[] } {
  const set = setById.get(setId) ?? null;
  const list = cards
    .filter((c) => c.set_id === setId)
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  return { set, cards: list };
}

export function localSearch(input: {
  q?: string | undefined;
  set?: string | undefined;
  rarity?: string | undefined;
  limit?: number | undefined;
}): LocalCard[] {
  const raw = (input.q ?? "").trim().toLowerCase();
  const limit = input.limit ?? 60;
  return cards
    .filter((c) => {
      if (input.set && c.set_id !== input.set) return false;
      if (input.rarity && c.rarity !== input.rarity) return false;
      if (!raw) return true;
      return (
        c.name.toLowerCase().includes(raw) ||
        c.number.toLowerCase().includes(raw) ||
        c.id.toLowerCase().includes(raw) ||
        c.card_sets.name.toLowerCase().includes(raw)
      );
    })
    .slice(0, limit);
}

export function localStats() {
  return { cards: cards.length, sets: sets.length, offers: 0, stores: 0, sample: true as const };
}

export function localTrending(): LocalCard[] {
  // Index 2 is the centered, floating focal card in the hero fan (Base Set Charizard).
  const ids = [
    "swsh7-95",
    "sv03.5-151",
    "base1-4",
    "sv08.5-161",
    "neo1-9",
    "base1-2",
    "sv03.5-183",
    "base1-10",
    "swsh12.5-019",
    "base3-5",
    "swsh7-111",
    "base1-58",
  ];
  const picked = ids.map((id) => localCard(id)).filter((c): c is LocalCard => !!c);
  return picked.length ? picked : cards.slice(0, 12);
}
