import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageShell } from "@/components/SiteHeader";
import { SetLogo } from "@/components/market";
import { listSets } from "@/lib/catalog.functions";
import type { LocalSet } from "@/lib/catalog/local";
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
  const [q, setQ] = useState("");
  const [series, setSeries] = useState("");

  const allSeries = useMemo(() => [...new Set(sets.map((s) => s.series ?? "Outras"))], [sets]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return sets.filter((s) => {
      if (series && (s.series ?? "Outras") !== series) return false;
      if (!term) return true;
      return s.name.toLowerCase().includes(term) || s.id.toLowerCase().includes(term) || (s.series ?? "").toLowerCase().includes(term);
    });
  }, [sets, q, series]);

  const bySeries = useMemo(() => {
    const map: Record<string, LocalSet[]> = {};
    for (const s of filtered) {
      const key = s.series ?? "Outras";
      (map[key] ??= []).push(s);
    }
    return map;
  }, [filtered]);

  return (
    <PageShell>
      <section className="grain relative overflow-hidden bg-ink-glow text-ink-foreground">
        <div className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-holo opacity-15 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-6 md:py-8">
          <p className="num text-[11px] uppercase tracking-[0.2em] text-holo">Catálogo oficial · {sets.length} expansões</p>
          <h1 className="mt-1.5 text-3xl font-extrabold md:text-5xl">Coleções Pokémon TCG</h1>
          <p className="mt-2 max-w-2xl text-sm opacity-75 md:text-base">
            Navegue por era e expansão, acompanhe cotações públicas e encontre a impressão exata da carta que procura.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-ink-foreground/15 bg-ink-foreground/10 px-4 py-2.5 text-sm backdrop-blur">
              <Search className="h-4 w-4 opacity-70" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filtrar coleção ou código (ex.: 151, Base Set, swsh7)…"
                aria-label="Filtrar coleções"
                className="w-full bg-transparent text-ink-foreground outline-none placeholder:text-ink-foreground/50"
              />
            </div>
          </div>
          <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setSeries("")}
              className={`shrink-0 rounded-full px-3.5 py-1.5 font-semibold transition ${
                !series ? "bg-ink-foreground text-ink" : "border border-ink-foreground/15 text-ink-foreground/80 hover:bg-ink-foreground/10"
              }`}
            >
              Todas ({sets.length})
            </button>
            {allSeries.map((ser) => (
              <button
                key={ser}
                type="button"
                onClick={() => setSeries(ser)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 font-semibold transition ${
                  series === ser ? "bg-ink-foreground text-ink" : "border border-ink-foreground/15 text-ink-foreground/80 hover:bg-ink-foreground/10"
                }`}
              >
                {ser}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-7">
        {filtered.length === 0 ? (
          <div className="dots rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground">
            Nenhuma coleção encontrada para “{q}”.
          </div>
        ) : (
          Object.entries(bySeries).map(([ser, list]) => (
            <section key={ser} className="mt-7 first:mt-0">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-xl font-extrabold md:text-2xl">{ser}</h2>
                <span className="num text-xs text-muted-foreground">
                  {list.length} {list.length === 1 ? "expansão" : "expansões"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {list.map((s) => (
                  <Link
                    key={s.id}
                    to="/colecoes/$setId"
                    params={{ setId: s.id }}
                    className="group flex flex-col items-center justify-between rounded-2xl border border-border bg-card p-4 text-center shadow-slab transition hover:-translate-y-0.5 hover:border-foreground/25"
                  >
                    <div className="flex h-14 items-center justify-center transition group-hover:scale-105">
                      <SetLogo src={s.logo_url} name={s.name} className="max-h-12 max-w-[140px]" />
                    </div>
                    <div className="mt-2.5">
                      <p className="text-sm font-semibold">{s.name}</p>
                      <p className="num mt-0.5 text-xs text-muted-foreground">
                        {s.release_date?.slice(0, 4) ?? "—"} · {s.total ?? "—"} cartas
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </PageShell>
  );
}
