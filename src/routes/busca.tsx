import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { PageShell } from "@/components/SiteHeader";
import { CardGrid } from "@/components/CardGrid";
import { getTrends, listSets, searchCards } from "@/lib/catalog.functions";
import { BRAND } from "@/lib/format";

type S = { q?: string | undefined; set?: string | undefined; rarity?: string | undefined };
const PAGE_SIZE = 30;

export const Route = createFileRoute("/busca")({
  validateSearch: (s: Record<string, unknown>): S => ({
    q: typeof s["q"] === "string" && s["q"].trim() ? s["q"] : undefined,
    set: typeof s["set"] === "string" && s["set"].trim() ? s["set"] : undefined,
    rarity: typeof s["rarity"] === "string" && s["rarity"].trim() ? s["rarity"] : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [cards, sets] = await Promise.all([searchCards({ data: { ...deps, limit: 120 } }), listSets()]);
    const initialTrends = await getTrends({ data: { ids: cards.slice(0, PAGE_SIZE).map((c) => c.id) } });
    return { cards, sets, initialTrends };
  },
  head: () => ({
    meta: [
      { title: `Buscar cartas | ${BRAND.name}` },
      { name: "description", content: "Busque cartas Pokémon por nome, número, coleção ou raridade." },
      { property: "og:title", content: `Buscar cartas | ${BRAND.name}` },
      { property: "og:description", content: "Encontre a impressão exata da carta que você procura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { cards, sets, initialTrends } = Route.useLoaderData();
  const s = Route.useSearch();
  const nav = useNavigate();
  const [sort, setSort] = useState<"relevance" | "name-asc" | "name-desc" | "number">("relevance");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [s.q, s.set, s.rarity, sort]);

  const rarities = useMemo(() => [...new Set(cards.map((c) => c.rarity).filter(Boolean))] as string[], [cards]);
  const activeSet = sets.find((x) => x.id === s.set);

  const sorted = useMemo(() => {
    if (sort === "name-asc") return [...cards].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "name-desc") return [...cards].sort((a, b) => b.name.localeCompare(a.name));
    if (sort === "number") return [...cards].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    return cards;
  }, [cards, sort]);

  const visibleCards = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);
  const hasFilters = Boolean(s.q || s.set || s.rarity);

  return (
    <PageShell>
      <section className="grain bg-ink-glow text-ink-foreground">
        <div className="mx-auto max-w-7xl px-4 py-7 md:py-9">
          <p className="num text-[11px] uppercase tracking-[0.2em] text-holo">Busca no catálogo</p>
          <div className="mt-1.5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold md:text-4xl">
                {s.q ? `Resultados para “${s.q}”` : activeSet ? activeSet.name : "Todas as cartas"}
              </h1>
              <p className="mt-1 text-sm opacity-75">
                {sorted.length}
                {sorted.length === 120 ? "+" : ""} {sorted.length === 1 ? "carta encontrada" : "cartas encontradas"}
                {sorted.length > visibleCards.length ? ` · exibindo ${visibleCards.length}` : ""}
              </p>
            </div>
            {hasFilters && (
              <Link
                to="/busca"
                search={{ q: undefined, set: undefined, rarity: undefined }}
                className="rounded-full border border-ink-foreground/20 px-4 py-1.5 text-xs font-semibold text-ink-foreground transition hover:bg-ink-foreground/10"
              >
                Limpar filtros
              </Link>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-7 md:flex-row">
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-24 rounded-2xl border border-border bg-card p-4 shadow-slab">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-bold">
                <SlidersHorizontal className="h-4 w-4 text-primary" /> Filtros
              </h2>
              {hasFilters && (
                <Link to="/busca" search={{ q: undefined, set: undefined, rarity: undefined }} className="text-xs font-semibold text-primary hover:underline">
                  Limpar
                </Link>
              )}
            </div>

            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coleção</h3>
            <div className="mt-2 max-h-[55vh] space-y-1 overflow-y-auto pr-1 text-sm">
              <Link
                to="/busca"
                search={{ ...s, set: undefined }}
                className={`block rounded-lg px-2.5 py-1.5 transition ${!s.set ? "bg-ink font-semibold text-ink-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                Todas as coleções
              </Link>
              {sets.map((x) => (
                <Link
                  key={x.id}
                  to="/busca"
                  search={{ ...s, set: x.id }}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 transition ${
                    s.set === x.id ? "bg-ink font-semibold text-ink-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="truncate">{x.name}</span>
                  <span className="num ml-2 text-[10px] opacity-65">{x.release_date?.slice(0, 4)}</span>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3 shadow-slab">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={s.set ?? ""}
                onChange={(e) => nav({ to: "/busca", search: { ...s, set: e.target.value || undefined } })}
                aria-label="Filtrar por coleção"
                className="rounded-full border border-input bg-background px-3 py-1.5 text-sm md:hidden"
              >
                <option value="">Todas as coleções</option>
                {sets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>

              {rarities.length > 0 && (
                <select
                  value={s.rarity ?? ""}
                  onChange={(e) => nav({ to: "/busca", search: { ...s, rarity: e.target.value || undefined } })}
                  aria-label="Filtrar por raridade"
                  className="rounded-full border border-input bg-background px-3 py-1.5 text-sm"
                >
                  <option value="">Todas as raridades</option>
                  {rarities.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}

              {s.q && (
                <Link
                  to="/busca"
                  search={{ ...s, q: undefined }}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-semibold hover:bg-muted/80"
                >
                  “{s.q}” <X className="h-3 w-3" />
                </Link>
              )}
              {activeSet && (
                <Link
                  to="/busca"
                  search={{ ...s, set: undefined }}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-semibold hover:bg-muted/80"
                >
                  {activeSet.name} <X className="h-3 w-3" />
                </Link>
              )}
              {s.rarity && (
                <Link
                  to="/busca"
                  search={{ ...s, rarity: undefined }}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-semibold hover:bg-muted/80"
                >
                  {s.rarity} <X className="h-3 w-3" />
                </Link>
              )}
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              aria-label="Ordenar resultados"
              className="rounded-full border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="relevance">Relevância</option>
              <option value="name-asc">Nome (A–Z)</option>
              <option value="name-desc">Nome (Z–A)</option>
              <option value="number">Número da carta</option>
            </select>
          </div>

          {sorted.length === 0 ? (
            <div className="dots rounded-3xl border border-dashed border-border p-10 text-center">
              <p className="font-display text-lg font-bold">Nenhuma carta encontrada</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tente o nome em inglês (ex.: “Charizard”, “Umbreon”) ou o número (ex.: “4/102”).
              </p>
              {hasFilters && (
                <Link
                  to="/busca"
                  search={{ q: undefined, set: undefined, rarity: undefined }}
                  className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
                >
                  Ver todas as cartas
                </Link>
              )}
            </div>
          ) : (
            <>
              <CardGrid cards={visibleCards} initialTrends={initialTrends} columns="sidebar" />
              {visibleCards.length < sorted.length && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    className="rounded-full border border-border bg-card px-6 py-2.5 text-sm font-semibold text-foreground shadow-slab transition hover:border-foreground/30 hover:bg-muted"
                  >
                    Mostrar mais cartas ({sorted.length - visibleCards.length} restantes)
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </PageShell>
  );
}
