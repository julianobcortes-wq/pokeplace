import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, Clock, MapPin, MessageSquareReply, Package, RotateCcw, Truck } from "lucide-react";
import { MarketplaceImage } from "@/components/MarketplaceImage";
import { PageShell } from "@/components/SiteHeader";
import { Slab, useTrends } from "@/components/CardGrid";
import { MedalBadge, ReputationMeter, Stars, StoreAvatar, VerifiedPill, SellerTrustPanel } from "@/components/market";
import { getStore } from "@/lib/catalog.functions";
import { BRAND, money } from "@/lib/format";
import { formatResponseTime, type ThermometerLevel } from "@/lib/marketplace/rules";

export const Route = createFileRoute("/loja/$slug")({
  loader: async ({ params }) => {
    const data = await getStore({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData: d }) => ({
    meta: [
      { title: d ? `${d.store.store_name} — loja de cartas Pokémon | ${BRAND.name}` : `Loja | ${BRAND.name}` },
      { name: "description", content: d ? `${d.store.store_name} (${d.store.city}/${d.store.state}): cartas à venda, avaliações de compradores e reputação.` : "Loja verificada" },
      { property: "og:title", content: d ? `${d.store.store_name} | ${BRAND.name}` : BRAND.name },
      { property: "og:description", content: "Loja verificada com reputação pública e avaliações reais." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
      ...(d?.store.cover_url?.startsWith("https://") ? [{ property: "og:image", content: d.store.cover_url }, { name: "twitter:image", content: d.store.cover_url }] : []),
    ],
  }),
  notFoundComponent: () => <PageShell><main className="mx-auto max-w-3xl p-10 text-center"><h1 className="text-3xl font-bold">Loja não encontrada</h1><Link to="/" className="mt-4 inline-block text-primary">Voltar ao início</Link></main></PageShell>,
  component: StorePage,
});

function StorePage() {
  const { store, reputation: rep, thermometer: thermo, listings, reviews } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"cartas" | "avaliacoes" | "sobre">("cartas");
  const trends = useTrends(listings.slice(0, 120).map((l) => l.card_id));
  const rating = Number(rep?.rating ?? 0), nReviews = Number(rep?.reviews ?? 0);
  const level = rep?.level ?? "nova";
  const shown = listings.filter((l) => !q || l.cards?.name.toLowerCase().includes(q.toLowerCase()));
  const avg = (k: "rating_service" | "rating_packaging" | "rating_shipping") => Number(k === "rating_service" ? rep?.service_rating ?? 0 : k === "rating_packaging" ? rep?.packaging_rating ?? 0 : rep?.shipping_rating ?? 0);
  const cancelRate = thermo ? thermo.cancel_rate : Number(rep?.total_items ?? 0) ? (Number(rep?.cancelled ?? 0) / Number(rep?.total_items)) * 100 : 0;

  return (
    <PageShell>
      <section className="grain relative overflow-hidden bg-ink-glow text-ink-foreground">
        {store.cover_url && <MarketplaceImage src={store.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-holo opacity-20 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-10">
          <div className="flex flex-wrap items-end gap-5">
            <StoreAvatar name={store.store_name} logo={store.logo_url} size="h-24 w-24 text-2xl ring-4 ring-ink-foreground/10" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <VerifiedPill />
                {store.is_official && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Oficial</span>}
                {thermo && <MedalBadge medal={thermo.medal} />}
              </div>
              <h1 className="mt-2 text-4xl font-extrabold md:text-5xl">{store.store_name}</h1>
              <p className="mt-2 flex flex-wrap gap-4 text-sm opacity-70">
                <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{store.city}/{store.state}</span>
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" />Na plataforma desde {new Date(store.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>
                {thermo?.avg_response_hours != null && (
                  <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{formatResponseTime(thermo.avg_response_hours)}</span>
                )}
              </p>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric l="Avaliação" v={nReviews ? <span className="inline-flex items-center gap-2">{rating.toFixed(1)} <Stars value={rating} /></span> : "—"} sub={`${nReviews} avaliações`} />
            <Metric l="Vendas concluídas" v={String(rep?.completed_sales ?? 0)} sub={thermo ? `${thermo.on_time_rate.toFixed(0)}% envios no prazo` : "itens entregues"} />
            <Metric l="Cancelamentos" v={Number(rep?.total_items ?? 0) ? `${cancelRate.toFixed(0)}%` : "—"} sub={thermo ? `${thermo.claim_rate.toFixed(1)}% reclamações` : "dos itens vendidos"} />
            <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 p-4"><p className="text-xs opacity-60">Termômetro</p><div className="mt-2"><ReputationMeter level={level} thermometer={thermo?.thermometer as ThermometerLevel | undefined} /></div></div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4">
        <SellerTrustPanel sellerId={store.id} approved />
        <div className="sticky top-[60px] z-20 -mx-4 flex gap-1 border-b border-border bg-background/90 px-4 py-2 backdrop-blur">
          {([["cartas", `Cartas (${listings.length})`], ["avaliacoes", `Avaliações (${nReviews})`], ["sobre", "Sobre e políticas"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === k ? "bg-ink text-ink-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
          ))}
        </div>

        {tab === "cartas" && (
          <section className="pt-6">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nesta loja" aria-label="Buscar nesta loja" className="w-full max-w-sm rounded-full border border-input bg-card px-4 py-2.5 text-sm" />
            {shown.length === 0 ? <p className="dots mt-6 rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground">Nenhuma carta à venda{q ? " com esse nome" : " no momento"}.</p> : (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
                {shown.map((l) => (
                  <Slab key={l.id} to={{ cardId: l.card_id }} image={l.cards?.image_small ?? null} title={l.cards?.name ?? ""} sub={`${l.cards?.card_sets?.name ?? ""} · ${l.condition}`}
                    trend={trends[l.card_id]} priceLabel={<p className="num text-base font-bold">{money(Number(l.price), l.currency)}</p>} />
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "avaliacoes" && (
          <section className="grid gap-6 pt-6 lg:grid-cols-[300px_1fr]">
            <div className="h-fit rounded-2xl border border-border bg-card p-5 shadow-slab">
              <p className="num text-5xl font-bold">{nReviews ? rating.toFixed(1) : "—"}</p>
              <Stars value={rating} size="h-5 w-5" />
              <p className="mt-1 text-sm text-muted-foreground">{nReviews} avaliações de compradores</p>
              <div className="mt-5 space-y-3 text-sm">
                {([["Atendimento", "rating_service"], ["Embalagem", "rating_packaging"], ["Prazo de envio", "rating_shipping"]] as const).map(([l, k]) => (
                  <div key={k}><div className="flex justify-between"><span>{l}</span><span className="num">{reviews.length ? avg(k).toFixed(1) : "—"}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-chart-4" style={{ width: `${(avg(k) / 5) * 100}%` }} /></div></div>
                ))}
              </div>
              <p className="mt-5 text-xs text-muted-foreground">Só quem comprou e recebeu o pedido pode avaliar — uma vez por pedido.</p>
            </div>
            <div className="space-y-3">
              {reviews.length === 0 ? <p className="dots rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground">Esta loja ainda não recebeu avaliações.</p> :
                reviews.map((r) => {
                  const s = (r.rating_service + r.rating_packaging + r.rating_shipping) / 3;
                  return (
                    <article key={r.id} className="rounded-2xl border border-border bg-card p-5 shadow-slab">
                      <div className="flex items-center justify-between"><Stars value={s} /><span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</span></div>
                      <p className="mt-1 text-xs text-muted-foreground">Comprador verificado</p>
                      {r.comment && <p className="mt-3">{r.comment}</p>}
                      {r.reply && <div className="mt-3 rounded-xl bg-muted p-3 text-sm"><p className="flex items-center gap-1 text-xs font-semibold"><MessageSquareReply className="h-3.5 w-3.5" /> Resposta da loja</p><p className="mt-1">{r.reply}</p></div>}
                    </article>
                  );
                })}
            </div>
          </section>
        )}

        {tab === "sobre" && (
          <section className="grid gap-3 pt-6 md:grid-cols-3">
            <Info icon={Package} t="Sobre a loja" d={store.bio} />
            <Info icon={Truck} t="Envio" d={store.shipping_policy} />
            <Info icon={RotateCcw} t="Trocas e devoluções" d={store.return_policy} />
          </section>
        )}
      </main>
    </PageShell>
  );
}

function Metric({ l, v, sub }: { l: string; v: React.ReactNode; sub: string }) {
  return <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 p-4"><p className="text-xs opacity-60">{l}</p><p className="num mt-1 text-2xl font-bold">{v}</p><p className="text-[11px] opacity-50">{sub}</p></div>;
}
function Info({ icon: I, t, d }: { icon: typeof Package; t: string; d: string | null }) {
  return <div className="rounded-2xl border border-border bg-card p-5 shadow-slab"><I className="h-5 w-5 text-primary" /><p className="mt-3 font-display text-lg font-bold">{t}</p><p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{d || "A loja ainda não preencheu esta informação."}</p></div>;
}
