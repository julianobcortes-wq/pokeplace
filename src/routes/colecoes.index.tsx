import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/SiteHeader";
import { listSets } from "@/lib/catalog.functions";
import { BRAND } from "@/lib/format";

export const Route = createFileRoute("/colecoes/")({
  loader: () => listSets(),
  head: () => ({
    meta: [
      { title: `Coleções Pokémon TCG | ${BRAND.name}` },
      { name: "description", content: "Todas as expansões de cartas Pokémon do catálogo, com lista completa de cartas." },
      { property: "og:title", content: `Coleções Pokémon TCG | ${BRAND.name}` },
      { property: "og:description", content: "Navegue pelas expansões e encontre cada carta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Sets,
});

function Sets() {
  const sets = Route.useLoaderData();
  const bySeries = sets.reduce<Record<string, typeof sets>>((a, s) => ((a[s.series ?? "Outras"] ??= []).push(s), a), {});
  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Coleções</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Escolha uma coleção, depois a carta, e veja o preço de mercado. O catálogo inicial é uma amostra pública da TCGdex (nome, código, lançamento e total oficial).</p>
        {Object.entries(bySeries).map(([series, list]) => (
          <section key={series} className="mt-6">
            <h2 className="text-lg font-semibold text-muted-foreground">{series}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {list.map((s) => (
                <Link key={s.id} to="/colecoes/$setId" params={{ setId: s.id }} className="flex flex-col items-center rounded-md bg-card p-4 shadow-sm hover:shadow-lg">
                  {s.logo_url && <img src={s.logo_url} alt={s.name} loading="lazy" className="h-14 w-auto object-contain" />}
                  <p className="mt-3 text-center text-sm font-semibold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.release_date?.slice(0, 4)} · {s.total} cartas</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </PageShell>
  );
}
