import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Heart, Layers, Search, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/SiteHeader";
import { useTrends } from "@/components/CardGrid";
import { Change, Sparkline } from "@/components/market";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BRAND, money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/colecao")({
  head: () => ({
    meta: [
      { title: `Minha coleção e desejos | ${BRAND.name}` },
      { name: "description", content: "Suas cartas Pokémon, valor estimado do acervo e lista de desejos." },
      { property: "og:title", content: `Minha coleção | ${BRAND.name}` },
      { property: "og:description", content: "Cartas e desejos pessoais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Collection,
});

function Collection() {
  const [kind, setKind] = useState<"owned" | "wanted">("owned");
  const [q, setQ] = useState("");
  const qc = useQueryClient();

  const { data = [], isPending, isError } = useQuery({
    queryKey: ["collection"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collection_entries")
        .select("*,cards(name,number,image_small,card_sets(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const owned = useMemo(() => data.filter((r) => r.kind === "owned"), [data]);
  const wanted = useMemo(() => data.filter((r) => r.kind === "wanted"), [data]);
  const totalCopies = useMemo(() => owned.reduce((acc, r) => acc + (r.quantity || 1), 0), [owned]);

  const cardIds = useMemo(() => [...new Set(data.map((r) => r.card_id))], [data]);
  const trends = useTrends(cardIds);

  // Sum reference portfolio value per currency so USD/EUR/BRL are never mixed.
  const portfolioTotals = useMemo(() => {
    const totals: Record<string, { value: number; pricedCards: number }> = {};
    for (const r of owned) {
      const t = trends[r.card_id];
      if (!t?.last) continue;
      const cur = t.currency || "USD";
      const bucket = (totals[cur] ??= { value: 0, pricedCards: 0 });
      bucket.value += t.last * (r.quantity || 1);
      bucket.pricedCards += 1;
    }
    return Object.entries(totals);
  }, [owned, trends]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("collection_entries").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["collection"] });
  };

  const visible = useMemo(
    () =>
      data.filter(
        (r) =>
          r.kind === kind &&
          (!q || `${r.cards?.name ?? ""} ${r.cards?.number ?? ""} ${r.cards?.card_sets?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, kind, q],
  );

  return (
    <PageShell>
      <section className="grain relative overflow-hidden bg-ink-glow text-ink-foreground">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-holo opacity-15 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-8 md:py-12">
          <p className="num text-[11px] uppercase tracking-[0.2em] text-holo">Portfólio pessoal</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl font-extrabold md:text-5xl">Minha coleção</h1>
              <p className="mt-2 max-w-xl text-sm opacity-75">
                Acompanhe suas cartas, quantidades e a cotação pública de referência do seu acervo.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 px-4 py-3">
                <p className="text-[11px] opacity-60">Cartas na coleção</p>
                <p className="num mt-0.5 text-2xl font-bold">{owned.length}</p>
                <p className="text-[11px] opacity-55">{totalCopies} {totalCopies === 1 ? "cópia" : "cópias"}</p>
              </div>
              <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 px-4 py-3">
                <p className="text-[11px] opacity-60">Lista de desejos</p>
                <p className="num mt-0.5 text-2xl font-bold">{wanted.length}</p>
                <p className="text-[11px] opacity-55">metas salvas</p>
              </div>
              <div className="col-span-2 rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 px-4 py-3 sm:col-span-1">
                <p className="flex items-center gap-1 text-[11px] opacity-60">
                  <TrendingUp className="h-3.5 w-3.5 text-holo" /> Valor de referência
                </p>
                {portfolioTotals.length > 0 ? (
                  <div className="mt-0.5 space-y-0.5">
                    {portfolioTotals.map(([cur, b]) => (
                      <p key={cur} className="num text-xl font-bold text-holo">
                        {money(b.value, cur)}
                      </p>
                    ))}
                    <p className="text-[10px] opacity-55">cotação pública de mercado</p>
                  </div>
                ) : (
                  <p className="num mt-1 text-lg font-semibold opacity-70">—</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button variant={kind === "owned" ? "default" : "outline"} onClick={() => setKind("owned")} className="rounded-full">
            <Layers className="h-4 w-4" /> Tenho ({owned.length})
          </Button>
          <Button variant={kind === "wanted" ? "default" : "outline"} onClick={() => setKind("wanted")} className="rounded-full">
            <Heart className="h-4 w-4" /> Quero ({wanted.length})
          </Button>
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-full border border-input bg-card px-3.5 py-2 text-sm sm:max-w-xs">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              aria-label="Buscar na coleção"
              placeholder="Filtrar na coleção…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full bg-transparent outline-none"
            />
          </div>
        </div>

        {isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-80 animate-pulse rounded-2xl border border-border bg-card" />
            ))}
          </div>
        ) : isError ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive">Não foi possível carregar sua coleção.</p>
        ) : visible.length === 0 ? (
          <div className="dots rounded-3xl border border-dashed border-border py-14 text-center">
            <p className="font-display text-lg font-bold">Nenhuma carta por aqui ainda</p>
            <p className="mt-1 text-sm text-muted-foreground">Abra qualquer carta no catálogo e marque “Tenho” ou “Quero”.</p>
            <Link to="/colecoes" className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
              Explorar cartas
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {visible.map((r) => {
              const t = trends[r.card_id];
              return (
                <article key={r.id} className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-slab">
                  <Link to="/carta/$cardId" params={{ cardId: r.card_id }} className="group block">
                    <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-muted/50 p-3">
                      {r.cards?.image_small && (
                        <img src={r.cards.image_small} alt={r.cards.name} className="h-full w-auto object-contain transition group-hover:scale-105" />
                      )}
                    </div>
                    <h2 className="mt-3 truncate font-semibold">
                      {r.cards?.name} <span className="num text-xs font-normal text-muted-foreground">#{r.cards?.number}</span>
                    </h2>
                    <p className="truncate text-xs text-muted-foreground">{r.cards?.card_sets?.name}</p>
                  </Link>
                  {t?.last != null && (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-2.5 py-1.5">
                      <div>
                        <p className="num text-xs font-bold">{money(t.last, t.currency)}</p>
                        <Change pct={t.change} />
                      </div>
                      {t.points.length > 1 && <Sparkline points={t.points} className="h-6 w-14" />}
                    </div>
                  )}
                  <div className="mt-3 flex items-end justify-between border-t border-border pt-3">
                    <EntryEditor row={r} />
                    <Button variant="ghost" size="icon" aria-label="Remover carta" onClick={() => remove(r.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </PageShell>
  );
}

function EntryEditor({ row }: { row: { id: string; kind: string; quantity: number; target_price: number | null } }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(row.kind === "owned" ? String(row.quantity) : row.target_price == null ? "" : String(row.target_price));
  const save = async () => {
    const n = Number(value.replace(",", "."));
    if (value && (!Number.isFinite(n) || n <= 0 || (row.kind === "owned" && !Number.isInteger(n)))) {
      toast.error("Informe um valor positivo válido");
      return;
    }
    const { error } = await supabase
      .from("collection_entries")
      .update(row.kind === "owned" ? { quantity: n || 1 } : { target_price: value ? n : null })
      .eq("id", row.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Salvo");
      qc.invalidateQueries({ queryKey: ["collection"] });
    }
  };
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted-foreground">{row.kind === "owned" ? "Quantidade" : "Preço desejado (R$)"}</label>
      <div className="mt-1 flex gap-1.5">
        <input
          aria-label={row.kind === "owned" ? "Quantidade" : "Preço desejado"}
          type="number"
          min={1}
          step={row.kind === "owned" ? 1 : "0.01"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="num w-24 rounded-lg border border-input bg-background px-2 py-1 text-sm"
        />
        <Button variant="outline" size="sm" onClick={save}>
          Salvar
        </Button>
      </div>
      {row.kind === "wanted" && row.target_price && (
        <p className="mt-1 text-[11px] text-muted-foreground">Meta salva: {money(row.target_price)}</p>
      )}
    </div>
  );
}
