import { ListingQuestions, ReportButton } from "@/components/ops";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Lock, ShieldCheck, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageShell } from "@/components/SiteHeader";
import { DemoBadge } from "@/components/CardGrid";
import { Change, HoloCard, SellerLine } from "@/components/market";
import { CollectionActions } from "@/components/CollectionActions";
import { ListingPhotos } from "@/components/ListingPhotos";
import { Button } from "@/components/ui/button";
import { getCard } from "@/lib/catalog.functions";
import { getCardQuote, type CardQuote } from "@/lib/pricing/quote";
import { buildReferenceSeries } from "@/lib/pricing/series";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { BRAND, CONDITIONS, LANGUAGES, FINISHES, money } from "@/lib/format";

export const Route = createFileRoute("/carta/$cardId")({
  loader: async ({ params }) => {
    const card = await getCard({ data: { id: params.cardId } });
    if (!card) throw notFound();
    const quote = await getCardQuote({ data: { id: params.cardId } });
    return { card, quote };
  },
  head: ({ loaderData }) => {
    const c = loaderData?.card;
    return ({
    meta: [
      { title: c ? `${c.name} #${c.number} — ${c.card_sets?.name} | ${BRAND.name}` : `Carta | ${BRAND.name}` },
      { name: "description", content: c ? `Compre ${c.name} (${c.card_sets?.name} #${c.number}) de lojas avaliadas e veja o gráfico de preço.` : "Carta Pokémon" },
      { property: "og:title", content: c ? `${c.name} #${c.number} — ${c.card_sets?.name}` : BRAND.name },
      { property: "og:description", content: "Ofertas de lojas verificadas, reputação do vendedor e histórico de preço." },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(c?.image_large ? [{ property: "og:image", content: c.image_large }, { name: "twitter:image", content: c.image_large }] : []),
    ],
  }); },
  component: CardPage,
});

function CardPage() {
  const { card, quote } = Route.useLoaderData();
  const cart = useCart();
  const nav = useNavigate();
  const [cond, setCond] = useState("");
  const [lang, setLang] = useState("");
  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["offers", card.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("get_card_offers", { _card_id: card.id });
        if (error) return [];
        return data ?? [];
      } catch {
        return [];
      }
    },
  });
  const { data: photos = [] } = useQuery({ queryKey: ["offer-photos", card.id], queryFn: async () => { try { const { data, error } = await supabase.from("listings").select("id,photo_paths").eq("card_id", card.id).eq("status", "active"); if (error) return []; return data ?? []; } catch { return []; } } });
  const shown = offers.filter((o) => (!cond || o.condition === cond) && (!lang || o.language === lang));
  const best = shown[0];
  const add = (o: (typeof offers)[number]) => {
    cart.add({ listingId: o.listing_id, cardId: card.id, cardName: `${card.name} #${card.number}`, image: card.image_small, storeName: o.store_name,
      condition: o.condition, language: o.language, price: Number(o.price), max: o.quantity });
    toast.success("Adicionado ao carrinho", { description: `${card.name} · ${o.store_name}` });
  };

  return (
    <PageShell>
      <section className="grain relative overflow-hidden bg-ink-glow text-ink-foreground">
        <div className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-holo opacity-15 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[380px_1fr] lg:py-14">
          <div className="mx-auto w-64 sm:w-80 lg:w-full">
            <HoloCard src={card.image_large ?? card.image_small} alt={card.name} eager className="shadow-float ring-1 ring-ink-foreground/10" />
          </div>
          <div className="animate-rise">
            <p className="text-sm opacity-70">
              <Link to="/colecoes" className="hover:opacity-100">Coleções</Link> / <Link to="/colecoes/$setId" params={{ setId: card.set_id }} className="hover:opacity-100">{card.card_sets?.name}</Link>
            </p>
            <h1 className="mt-2 break-words text-4xl font-extrabold md:text-6xl">{card.name}</h1>
            <CollectionActions cardId={card.id} />
            <MarketQuote quote={quote} />
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {[card.card_sets?.name, `#${card.number}/${card.card_sets?.total ?? "?"}`, card.rarity, ...(card.types ?? [])].filter(Boolean).map((t) => (
                <span key={t} className="num rounded-full border border-ink-foreground/15 px-3 py-1">{t}</span>
              ))}
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 p-5">
                <p className="text-xs uppercase tracking-wider opacity-60">Menor preço nas lojas</p>
                {best ? (
                  <>
                    <p className="num mt-1 text-4xl font-bold">{money(Number(best.price), best.currency)}</p>
                    <p className="mt-1 text-xs opacity-70">{CONDITIONS[best.condition]} · {LANGUAGES[best.language] ?? best.language}</p>
                    <div className="mt-4 flex gap-2">
                      <Button onClick={() => { add(best); nav({ to: "/carrinho" }); }} className="flex-1 rounded-full bg-primary py-3 font-semibold text-primary-foreground transition hover:opacity-90">Comprar</Button>
                      <Button onClick={() => add(best)} aria-label="Adicionar ao carrinho" className="rounded-full bg-ink-foreground px-4 text-ink"><ShoppingBag className="h-5 w-5" /></Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-lg font-semibold">{isLoading ? "Buscando ofertas…" : "Nenhuma loja vende esta carta agora"}</p>
                    <Link to="/vender" className="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Tem esta carta? Venda aqui</Link>
                  </>
                )}
              </div>
              <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 p-5">
                <p className="text-xs uppercase tracking-wider opacity-60">Ficha</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="opacity-60">Código</dt><dd className="num">{card.id}</dd>
                  <dt className="opacity-60">Série</dt><dd>{card.card_sets?.series}</dd>
                  <dt className="opacity-60">Tipo</dt><dd>{[card.supertype, ...(card.subtypes ?? [])].filter(Boolean).join(" · ")}</dd>
                  <dt className="opacity-60">Ilustração</dt><dd>{card.artist ?? "—"}</dd>
                  <dt className="opacity-60">Lançamento</dt><dd>{card.card_sets?.release_date?.split("-").reverse().join("/")}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4">
        <PriceHistory cardId={card.id} quote={quote} />

        <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="num text-[11px] uppercase tracking-[0.2em] text-primary">Ofertas</p>
              <h2 className="text-3xl font-extrabold">{shown.length} {shown.length === 1 ? "loja vendendo" : "lojas vendendo"}</h2>
            </div>
            <div className="flex gap-2">
              <select value={cond} onChange={(e) => setCond(e.target.value)} aria-label="Condição" className="rounded-full border border-input bg-card px-3 py-2 text-sm">
                <option value="">Toda condição</option>
                {Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Idioma" className="rounded-full border border-input bg-card px-3 py-2 text-sm">
                <option value="">Todo idioma</option>
                {Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="dots mt-4 rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground">Nenhuma oferta {cond || lang ? "com esses filtros" : "por enquanto"}.</div>
          ) : (
            <div className="mt-4 space-y-3">
              {shown.map((o, i) => (
                <div key={o.listing_id} className={`grid items-center gap-4 rounded-2xl border bg-card p-4 shadow-slab md:grid-cols-[1.4fr_1fr_auto_auto] ${i === 0 ? "border-primary/40" : "border-border"}`}>
                  <div><SellerLine s={o} />{o.notes && <p className="mt-2 break-words text-xs text-muted-foreground">{o.notes}</p>}<ListingPhotos paths={photos.find(p => p.id === o.listing_id)?.photo_paths ?? []} store={o.store_name} /><div className="mt-1"><ReportButton type="listing" id={o.listing_id} /></div></div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{o.condition}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5">{LANGUAGES[o.language] ?? o.language}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5">{FINISHES[o.finish] ?? o.finish}</span>
                    {o.graded && <span className="rounded-full bg-ink px-2 py-0.5 text-ink-foreground">{o.grade_company} {o.grade}</span>}
                    <span className="px-1 text-muted-foreground">{o.quantity} em estoque</span>
                  </div>
                  <p className="num text-2xl font-bold">{money(Number(o.price), o.currency)}</p>
                  <Button onClick={() => add(o)} className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90">Adicionar</Button>
                </div>
              ))}
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-success" /> Todas as lojas passaram pela curadoria {BRAND.name}. Avaliações só de compradores com pedido entregue. <Link to="/compra-garantida" className="text-primary">Compra Garantida</Link></p>
            </div>
          )}
        </section>
        <ListingQuestions cardId={card.id} listings={offers.map((o) => ({ listing_id: o.listing_id, store_name: o.store_name }))} />
      </main>

      {best && (
        <div className="fixed inset-x-3 bottom-[84px] z-30 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-float backdrop-blur lg:hidden">
          <div><p className="text-[11px] text-muted-foreground">a partir de</p><p className="num text-lg font-bold">{money(Number(best.price), best.currency)}</p></div>
          <Button onClick={() => { add(best); nav({ to: "/carrinho" }); }} className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">Comprar</Button>
        </div>
      )}
    </PageShell>
  );
}

const RANGES = [{ l: "7D", d: 7 }, { l: "1M", d: 30 }, { l: "3M", d: 90 }, { l: "6M", d: 182, pro: true }, { l: "1A", d: 365, pro: true }, { l: "Tudo", d: null, pro: true }] as const;

function MarketQuote({ quote }: { quote: CardQuote | undefined }) {
  return (
    <div className="mt-5 rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 p-5">
      <p className="text-xs uppercase tracking-wider opacity-60">Preço de mercado</p>
      {quote?.available && quote.price != null && quote.currency ? (
        <>
          <p className="num mt-1 text-4xl font-bold">{money(quote.price, quote.currency)}</p>
          <p className="mt-1 text-xs opacity-80">{quote.condition ? `${quote.condition} · ` : ""}{quote.sourceLabel}</p>
          <p className="mt-1 text-xs opacity-60">{quote.asOf ? `Publicado em ${new Date(quote.asOf).toLocaleString("pt-BR")}. ` : ""}{quote.note}</p>
        </>
      ) : (
        <p className="mt-1 text-sm">{quote ? quote.note : "Consultando a fonte pública…"}</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link to="/vender" className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground">Anunciar esta carta</Link>
        <Link to="/canais" className="rounded-full border border-ink-foreground/20 px-4 py-2 font-semibold">Conectar canal</Link>
      </div>
    </div>
  );
}

function PriceHistory({ cardId, quote }: { cardId: string; quote: CardQuote | undefined }) {
  const [r, setR] = useState<(typeof RANGES)[number]>(RANGES[2]);
  const currency = quote?.currency ?? "USD";
  const { data, isLoading } = useQuery({
    queryKey: ["history", cardId, r.d],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("get_price_history", { _card_id: cardId, _days: r.d as number });
        if (error) return [];
        return data ?? [];
      } catch {
        return [];
      }
    },
  });
  const locked = data?.[0]?.locked;
  const dbPoints = useMemo(
    () => (data ?? []).filter((p) => !p.locked && p.amount != null).map((p) => ({ t: new Date(p.observed_at ?? "").getTime(), price: Number(p.amount), source: p.source ?? "live" })),
    [data],
  );
  const fallback = useMemo(() => {
    if (dbPoints.length > 0 || locked || isLoading) return [];
    return buildReferenceSeries(quote, r.d).map((p) => ({ t: new Date(p.observed_at).getTime(), price: p.amount, source: p.source }));
  }, [dbPoints.length, locked, isLoading, quote, r.d]);
  const points = dbPoints.length ? dbPoints : fallback;
  const demo = points.some((p) => p.source === "demo" || p.source === "tcgdex-window");
  const fromWindows = points.some((p) => p.source === "tcgdex-window");
  const prices = points.map((p) => p.price);
  const last = prices[prices.length - 1], first = prices[0];
  const change = last != null && first ? ((last / first) - 1) * 100 : null;
  const up = (change ?? 0) >= 0;
  const color = up ? "var(--up)" : "var(--down)";
  const fmtDate = (t: number) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const fmtMoney = (v: number) => money(v, currency);

  return (
    <section className="relative z-10 -mt-6 rounded-3xl border border-border bg-card p-5 shadow-float md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">Preço de referência {demo && <DemoBadge />}</p>
          <div className="mt-1 flex items-baseline gap-3">
            <p className="num text-4xl font-bold">{last != null ? fmtMoney(last) : "—"}</p>
            <Change pct={change} className="text-sm" />
          </div>
        </div>
        <div className="flex rounded-full bg-muted p-1">
          {RANGES.map((x) => (
            <Button key={x.l} onClick={() => setR(x)} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${r.l === x.l ? "bg-ink text-ink-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
              {x.l}{"pro" in x && <Lock className="h-3 w-3" />}
            </Button>
          ))}
        </div>
      </div>
      {!locked && prices.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <Stat l="Mínima" v={fmtMoney(Math.min(...prices))} />
          <Stat l="Máxima" v={fmtMoney(Math.max(...prices))} />
          <Stat l="Média" v={fmtMoney(prices.reduce((a, b) => a + b, 0) / prices.length)} />
        </div>
      )}
      <div className="mt-5 h-64 min-h-[16rem]">
        {locked ? (
          <div className="dots flex h-full flex-col items-center justify-center rounded-2xl bg-muted p-6 text-center">
            <Lock className="h-6 w-6 text-primary" />
            <p className="mt-2 max-w-md text-sm">Veja como o preço desta carta evoluiu desde o lançamento. Desbloqueie o histórico completo e ferramentas avançadas.</p>
            <Link to="/planos" className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Desbloquear histórico completo</Link>
          </div>
        ) : isLoading && points.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground">Carregando gráfico…</div>
        ) : points.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-muted p-6 text-center text-sm text-muted-foreground">
            Ainda não há cotação pública para montar o gráfico desta carta.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id={`pg-${cardId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtDate} fontSize={11} tickLine={false} axisLine={false} minTickGap={40} stroke="var(--muted-foreground)" />
              <YAxis fontSize={11} width={72} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={(v: number) => fmtMoney(v).replace(",00", "")} stroke="var(--muted-foreground)" />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                labelFormatter={(t) => new Date(Number(t)).toLocaleDateString("pt-BR")} formatter={(v) => [fmtMoney(Number(v)), "Preço"]} />
              <Area dataKey="price" type="monotone" stroke={color} strokeWidth={2.2} fill={`url(#pg-${cardId})`} dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {fromWindows
          ? "Série montada a partir das médias públicas Cardmarket e do preço TCGplayer via TCGdex — não são vendas liquidadas no PokePlace."
          : demo
            ? "Histórico demonstrativo para visualização. Será substituído por preços reais de mercado e vendas da plataforma."
            : "Fonte e data registradas em cada ponto."}{" "}
        3 meses grátis; períodos maiores no Premium.
      </p>
    </section>
  );
}

function Stat({ l, v }: { l: string; v: string }) {
  return <div className="rounded-xl bg-muted px-3 py-2"><p className="text-[11px] text-muted-foreground">{l}</p><p className="num font-semibold">{v}</p></div>;
}
