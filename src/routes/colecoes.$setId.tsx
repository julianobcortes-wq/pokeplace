import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/SiteHeader";
import { CardGrid } from "@/components/CardGrid";
import { getSet } from "@/lib/catalog.functions";
import { BRAND } from "@/lib/format";

export const Route = createFileRoute("/colecoes/$setId")({
  loader: async ({ params }) => {
    const r = await getSet({ data: { id: params.setId } });
    if (!r.set) throw notFound();
    return { ...r, value: null as { total: number | null; currency: string | null; pricedCount: number; note: string } | null };
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
  const { set, cards } = Route.useLoaderData();
  const [rarity, setRarity] = useState("");
  const [q, setQ] = useState("");
  const rarities = [...new Set(cards.map((c) => c.rarity).filter(Boolean))] as string[];
  const list = useMemo(() => cards.filter((c) => (!rarity || c.rarity === rarity) && (!q || `${c.name} ${c.number}`.toLowerCase().includes(q.toLowerCase()))), [cards, rarity, q]);
  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-wrap items-center gap-6 rounded-md bg-card p-5 shadow-sm">
          {set?.logo_url && <img src={set.logo_url} alt={set.name} className="h-16 w-auto" />}
          <div>
            <h1 className="text-2xl font-semibold">{set?.name}</h1>
            <p className="text-sm text-muted-foreground">{set?.series} · Lançamento {set?.release_date} · total oficial {set?.total ?? "—"} · {cards.length} cartas nesta amostra</p>
            <p className="mt-1 text-sm">Abra uma carta para ver o preço de mercado. A soma da amostra não é calculada nesta página.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por nome ou número" className="rounded-md border border-input bg-card px-3 py-2 text-sm" />
          <select value={rarity} onChange={(e) => setRarity(e.target.value)} className="rounded-md border border-input bg-card px-3 py-2 text-sm" aria-label="Raridade">
            <option value="">Todas as raridades</option>
            {rarities.map((r) => <option key={r}>{r}</option>)}
          </select>
          <span className="self-center text-sm text-muted-foreground">{list.length} cartas</span>
        </div>
        <div className="mt-4"><CardGrid cards={list} setName={set?.name} /></div>
      </main>
    </PageShell>
  );
}
