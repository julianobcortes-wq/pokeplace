import seed from "./seed.json";

export type LocalSet = {
  id: string;
  name: string;
  series: string | null;
  release_date: string | null;
  total: number;
  official: number;
  logo_url: string | null;
  sample: boolean;
  source: "tcgdex";
};

export type LocalCard = {
  id: string;
  name: string;
  number: string;
  rarity: null;
  image_small: string | null;
  image_large: string | null;
  set_id: string;
  supertype: "Pokémon";
  subtypes: null;
  types: null;
  artist: null;
  source: "tcgdex";
  card_sets: LocalSet;
};

const sets = seed.sets as LocalSet[];
const setById = new Map(sets.map((s) => [s.id, s]));

const cards: LocalCard[] = (seed.cards as Omit<LocalCard, "rarity" | "supertype" | "subtypes" | "types" | "artist" | "card_sets">[]).map((c) => {
  const set = setById.get(c.set_id);
  if (!set) throw new Error(`Coleção ausente no catálogo local: ${c.set_id}`);
  return { ...c, rarity: null, supertype: "Pokémon", subtypes: null, types: null, artist: null, card_sets: set };
});

export function localSets(): LocalSet[] {
  return [...sets].sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""));
}

export function localCard(id: string): LocalCard | null {
  return cards.find((c) => c.id === id) ?? null;
}

export function localCardsBySet(setId: string): { set: LocalSet | null; cards: LocalCard[] } {
  const set = setById.get(setId) ?? null;
  const list = cards
    .filter((c) => c.set_id === setId)
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  return { set, cards: list };
}

export function localSearch(input: { q?: string; set?: string; rarity?: string; limit?: number }): LocalCard[] {
  const raw = (input.q ?? "").trim().toLowerCase();
  const limit = input.limit ?? 60;
  return cards
    .filter((c) => {
      if (input.set && c.set_id !== input.set) return false;
      if (!raw) return true;
      return c.name.toLowerCase().includes(raw) || c.number.toLowerCase().includes(raw) || c.id.toLowerCase().includes(raw) || c.card_sets.name.toLowerCase().includes(raw);
    })
    .slice(0, limit);
}

export function localStats() {
  return { cards: cards.length, sets: sets.length, offers: 0, stores: 0, sample: true as const };
}

export function localTrending(): LocalCard[] {
  const ids = ["base1-4", "base1-2", "sv03.5-006", "swsh7-95", "me01-001"];
  const picked = ids.map((id) => localCard(id)).filter((c): c is LocalCard => !!c);
  return picked.length ? picked : cards.slice(0, 8);
}
