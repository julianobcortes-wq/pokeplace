import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { PageShell } from "@/components/SiteHeader";
import { CardGrid } from "@/components/CardGrid";
import { SetLogo } from "@/components/market";
import { getSet, getTrends } from "@/lib/catalog.functions";
import { BRAND } from "@/lib/format";

export const Route = createFileRoute("/colecoes/$setId")({
  loader: async ({ params }) => {
    const r = await getSet({ data: { id: params.setId } });
    if (!r.set) throw notFound();
    const initialTrends = await getTrends({ data: { ids: r.cards.slice(0, 30).map((c) => c.id) } });
    return { ...r, initialTrends };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.set?.name ?? "Coleção"} — lista de cartas | ${BRAND.name}` },
      { name: "description", content: `Todas as cartas da coleção ${loaderData?.set?.name ?? ""} com ofertas de lojas aprovadas.` },
      { property: "og:title", content: `${loaderData?.set?.name ?? "Coleção"} | ${BRAND.name}` },
      { property: "og:description", content: "Lista completa de cartas da coleção." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetPage,
});

function SetPage() {
  const { set, cards, initialTrends } = Route.useLoaderData();
  const [rarity, setRarity] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"number" | "name-asc" | "name-desc">("number");

  const rarities = useMemo(() => [...new Set(cards.map((c) => c.rarity).filter(Boolean))] as string[], [cards]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = cards.filter(
      (c) => (!rarity || c.rarity === rarity) && (!term || `${c.name} ${c.number} ${c.id}`.toLowerCase().includes(term)),
    );
    if (sort === "name-asc") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "name-desc") return [...filtered].sort((a, b) => b.name.localeCompare(a.name));
    return filtered;
  }, [cards, rarity, q, sort]);

  return (
    <PageShell>
      <section className="grain relative overflow-hidden bg-ink-glow text-ink-foreground">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-holo opacity-15 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-8 md:py-12">
          <Link to="/colecoes" className="inline-flex items-center gap-1.5 text-xs font-semibold opacity-70 transition hover:opacity-100">
            <ArrowLeft className="h-3.5 w-3.5" /> Todas as coleções
          </Link>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-6">
              {set?.logo_url && (
                <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 p-4 backdrop-blur">
                  <SetLogo src={set.logo_url} name={set.name} className="h-14 max-w-[160px] md:h-16" />
                </div>
              )}
              <div>
                <p className="num text-[11px] uppercase tracking-[0.2em] text-holo">{set?.series ?? "Pokémon TCG"}</p>
                <h1 className="mt-1 text-3xl font-extrabold md:text-5xl">{set?.name}</h1>
                <p className="mt-2 text-sm opacity-75">
                  Lançamento {set?.release_date?.split("-").reverse().join("/") ?? "—"} · Código <span className="num">{set?.id}</span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 px-5 py-3">
                <p className="num text-2xl font-bold">{set?.total ?? cards.length}</p>
                <p className="text-[11px] opacity-60">total da expansão</p>
              </div>
              <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 px-5 py-3">
                <p className="num text-2xl font-bold">{cards.length}</p>
                <p className="text-[11px] opacity-60">cartas listadas</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-slab">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-full border border-input bg-background px-3.5 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrar por nome ou número…"
              aria-label="Filtrar por nome ou número"
              className="w-full bg-transparent outline-none"
            />
          </div>
          {rarities.length > 0 && (
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value)}
              className="rounded-full border border-input bg-background px-3.5 py-2 text-sm"
              aria-label="Raridade"
            >
              <option value="">Todas as raridades</option>
              {rarities.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "number" | "name-asc" | "name-desc")}
            aria-label="Ordenar por"
            className="rounded-full border border-input bg-background px-3.5 py-2 text-sm"
          >
            <option value="number">Ordem numérica</option>
            <option value="name-asc">Nome (A–Z)</option>
            <option value="name-desc">Nome (Z–A)</option>
          </select>
          <span className="num px-2 text-xs text-muted-foreground">
            {list.length} {list.length === 1 ? "carta" : "cartas"}
          </span>
        </div>

        <div className="mt-6">
          {list.length === 0 ? (
            <div className="dots rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground">
              Nenhuma carta encontrada com esses filtros.
            </div>
          ) : (
            <CardGrid cards={list} setName={set?.name} initialTrends={initialTrends} />
          )}
        </div>
      </main>
    </PageShell>
  );
}
