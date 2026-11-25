import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/SiteHeader";
import { CardGrid } from "@/components/CardGrid";
import { listSets, searchCards } from "@/lib/catalog.functions";
import { BRAND } from "@/lib/format";

type S = { q?: string | undefined; set?: string | undefined; rarity?: string | undefined };

export const Route = createFileRoute("/busca")({
  validateSearch: (s: Record<string, unknown>): S => ({
    q: typeof s["q"] === "string" ? s["q"] : undefined,
    set: typeof s["set"] === "string" ? s["set"] : undefined,
    rarity: typeof s["rarity"] === "string" ? s["rarity"] : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [cards, sets] = await Promise.all([searchCards({ data: { ...deps, limit: 120 } }), listSets()]);
    return { cards, sets };
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
  const { cards, sets } = Route.useLoaderData();
  const s = Route.useSearch();
  return (
    <PageShell>
      <main className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <h1 className="text-xl font-semibold">{s.q ? `“${s.q}”` : "Todas as cartas"}</h1>
          <p className="text-sm text-muted-foreground">{cards.length}{cards.length === 120 ? "+" : ""} resultados</p>
          <h3 className="mt-6 font-semibold">Coleção</h3>
          <div className="mt-2 space-y-1.5 text-sm">
            <Link to="/busca" search={{ ...s, set: undefined }} className={!s.set ? "font-bold" : "text-muted-foreground hover:text-primary"}>Todas</Link>
            {sets.map((x) => (
              <Link key={x.id} to="/busca" search={{ ...s, set: x.id }} className={`block ${s.set === x.id ? "font-bold" : "text-muted-foreground hover:text-primary"}`}>{x.name}</Link>
            ))}
          </div>
        </aside>
        <section className="flex-1">
          {cards.length === 0 ? <p className="rounded-md bg-card p-10 text-center text-muted-foreground">Nenhuma carta encontrada. Tente o nome em inglês (ex.: “Charizard”) ou o número (ex.: “4/102”).</p>
            : <CardGrid cards={cards} />}
        </section>
      </main>
    </PageShell>
  );
}
