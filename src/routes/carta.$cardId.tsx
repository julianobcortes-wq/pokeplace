import { ListingQuestions, ReportButton } from "@/components/ops";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowUpRight, Globe2, Lock, ShieldCheck, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageShell } from "@/components/SiteHeader";
import { DemoBadge } from "@/components/CardGrid";
import { Change, HoloCard, SellerLine } from "@/components/market";
import { CollectionActions } from "@/components/CollectionActions";
import { ConditionGuide } from "@/components/ConditionGuide";
import { ListingPhotos } from "@/components/ListingPhotos";
import { Button } from "@/components/ui/button";
import { getCard } from "@/lib/catalog.functions";
import { getCardQuote, type CardQuote } from "@/lib/pricing/quote";
import { convertToBrl, fxRateToBrl, getFxRatesFn, type FxRates } from "@/lib/pricing/fx";
import { buildReferenceSeries } from "@/lib/pricing/series";
import { isSupabaseConfigured } from "@/lib/runtime-config";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/hooks/useAuth";
import { BRAND, CONDITIONS, LANGUAGES, FINISHES, money } from "@/lib/format";

export const Route = createFileRoute("/carta/$cardId")({
  loader: async ({ params }) => {
    const card = await getCard({ data: { id: params.cardId } });
    if (!card) throw notFound();
    const [quote, fx] = await Promise.all([getCardQuote({ data: { id: params.cardId } }), getFxRatesFn()]);
    return { card, quote, fx };
  },
  head: ({ loaderData }) => {
    const c = loaderData?.card;
    return {
      meta: [
        { title: c ? `${c.name} #${c.number} — ${c.card_sets?.name} | ${BRAND.name}` : `Carta | ${BRAND.name}` },
        {
          name: "description",
          content: c ? `Compre ${c.name} (${c.card_sets?.name} #${c.number}) de lojas avaliadas e veja o gráfico de preço.` : "Carta Pokémon",
        },
        { property: "og:title", content: c ? `${c.name} #${c.number} — ${c.card_sets?.name}` : BRAND.name },
        { property: "og:description", content: "Ofertas de lojas verificadas, reputação do vendedor e histórico de preço." },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(c?.image_large ? [{ property: "og:image", content: c.image_large }, { name: "twitter:image", content: c.image_large }] : []),
      ],
    };
  },
  component: CardPage,
});

function CardPage() {
  const { card, quote, fx } = Route.useLoaderData();
  const cart = useCart();
  const { roles } = useAuth();
  const nav = useNavigate();
  const [cond, setCond] = useState("");
  const [lang, setLang] = useState("");
  const supabaseReady = isSupabaseConfigured();

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["offers", card.id],
    enabled: supabaseReady,
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

  const { data: photos = [] } = useQuery({
    queryKey: ["offer-photos", card.id],
    enabled: supabaseReady,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("listings").select("id,photo_paths").eq("card_id", card.id).eq("status", "active");
        if (error) return [];
        return data ?? [];
      } catch {
        return [];
      }
    },
  });

  const shown = offers.filter((o) => (!cond || o.condition === cond) && (!lang || o.language === lang));
  const best = shown[0];
  const sellLink = roles.includes("seller") ? "/minha-loja" : "/vender";
  const refSpotBrl =
    quote?.available && quote.price != null && quote.currency
      ? {
          brl: money(convertToBrl(quote.price, quote.currency, fx), "BRL"),
          intl: [
            quote.tcgplayer ? money(quote.tcgplayer.market, quote.tcgplayer.currency) : null,
            quote.cardmarket
              ? money(quote.cardmarket.trend ?? quote.cardmarket.avg ?? quote.cardmarket.avg7 ?? 0, quote.cardmarket.currency)
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }
      : null;

  const add = (o: (typeof offers)[number]) => {
    cart.add({
      listingId: o.listing_id,
      cardId: card.id,
      cardName: `${card.name} #${card.number}`,
      image: card.image_small,
      storeName: o.store_name,
      condition: o.condition,
      language: o.language,
      price: Number(o.price),
      max: o.quantity,
    });
    toast.success("Adicionado ao carrinho", { description: `${card.name} · ${o.store_name}` });
  };

  return (
    <PageShell>
      <section className="grain relative overflow-hidden bg-ink-glow text-ink-foreground">
        <div className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-holo opacity-15 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-start gap-8 px-4 pb-14 pt-8 lg:grid-cols-[340px_1fr] lg:pb-16 lg:pt-12">
          <div className="mx-auto w-60 sm:w-72 lg:w-full">
            <HoloCard src={card.image_large ?? card.image_small} alt={card.name} eager className="shadow-float ring-1 ring-ink-foreground/10" />
          </div>
          <div className="animate-rise min-w-0">
            <p className="text-sm opacity-70">
              <Link to="/colecoes" className="hover:opacity-100">
                Coleções
              </Link>{" "}
              /{" "}
              <Link to="/colecoes/$setId" params={{ setId: card.set_id }} className="hover:opacity-100">
                {card.card_sets?.name}
              </Link>
            </p>
            <h1 className="mt-2 break-words text-4xl font-extrabold md:text-6xl">{card.name}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {[card.card_sets?.name, `#${card.number}/${card.card_sets?.total ?? "?"}`, card.rarity, ...(card.types ?? [])]
                .filter(Boolean)
                .map((t) => (
                  <span key={t} className="num rounded-full border border-ink-foreground/15 px-3 py-1">
                    {t}
                  </span>
                ))}
            </div>
            <CollectionActions cardId={card.id} />

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="flex flex-col justify-between rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 p-5">
                <div>
                  <p className="text-xs uppercase tracking-wider opacity-60">Menor preço nas lojas</p>
                  {best ? (
                    <>
                      <p className="num mt-1 text-4xl font-bold">{money(Number(best.price), best.currency)}</p>
                      <p className="mt-1 text-xs opacity-70">
                        {CONDITIONS[best.condition]} · {LANGUAGES[best.language] ?? best.language} · {best.store_name}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1.5 text-lg font-semibold">
                        {supabaseReady && isLoading ? "Buscando ofertas…" : "Nenhuma loja vende esta carta agora"}
                      </p>
                      <p className="mt-1 text-xs opacity-65">Tem esta carta no seu estoque? Seja a primeira loja a anunciar.</p>
                      {refSpotBrl && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-foreground/15 bg-ink/40 px-3 py-1">
                            <Globe2 className="h-3.5 w-3.5 text-holo" />
                            <span className="opacity-70">Ref. Brasil:</span>
                            <b className="num text-ink-foreground">{refSpotBrl.brl}</b>
                          </span>
                          {refSpotBrl.intl && <span className="num opacity-65">({refSpotBrl.intl})</span>}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {best ? (
                  <div className="mt-4 flex gap-2">
                    <Button
                      onClick={() => {
                        add(best);
                        nav({ to: "/carrinho" });
                      }}
                      className="flex-1 rounded-full bg-primary py-3 font-semibold text-primary-foreground transition hover:opacity-90"
                    >
                      Comprar agora
                    </Button>
                    <Button onClick={() => add(best)} aria-label="Adicionar ao carrinho" className="rounded-full bg-ink-foreground px-4 text-ink">
                      <ShoppingBag className="h-5 w-5" />
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4">
                    <Link
                      to={sellLink}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                    >
                      Vender esta carta <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 p-5">
                <p className="text-xs uppercase tracking-wider opacity-60">Ficha técnica</p>
                <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="opacity-60">Código</dt>
                  <dd className="num">{card.id}</dd>
                  <dt className="opacity-60">Série</dt>
                  <dd>{card.card_sets?.series ?? "—"}</dd>
                  <dt className="opacity-60">Tipo</dt>
                  <dd>{[card.supertype, ...(card.subtypes ?? [])].filter(Boolean).join(" · ") || "—"}</dd>
                  <dt className="opacity-60">Ilustração</dt>
                  <dd>{card.artist ?? "—"}</dd>
                  <dt className="opacity-60">Lançamento</dt>
                  <dd>{card.card_sets?.release_date?.split("-").reverse().join("/") ?? "—"}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4">
        <PriceHistory cardId={card.id} quote={quote} fx={fx} />

        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="num text-[11px] uppercase tracking-[0.2em] text-primary">Ofertas</p>
              <h2 className="text-3xl font-extrabold">
                {shown.length} {shown.length === 1 ? "loja vendendo" : "lojas vendendo"}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ConditionGuide />
              <select
                value={cond}
                onChange={(e) => setCond(e.target.value)}
                aria-label="Condição"
                className="rounded-full border border-input bg-card px-3.5 py-2 text-sm"
              >
                <option value="">Toda condição</option>
                {Object.entries(CONDITIONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                aria-label="Idioma"
                className="rounded-full border border-input bg-card px-3.5 py-2 text-sm"
              >
                <option value="">Todo idioma</option>
                {Object.entries(LANGUAGES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="dots mt-4 rounded-3xl border border-dashed border-border p-10 text-center">
              <p className="font-display text-lg font-bold text-foreground">
                Nenhuma oferta {cond || lang ? "com esses filtros" : "disponível no momento"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {cond || lang
                  ? "Limpe os filtros para ver todas as condições e idiomas disponíveis."
                  : "Salve esta carta na sua lista de desejos ou anuncie se você tiver uma cópia."}
              </p>
              {(cond || lang) && (
                <Button
                  variant="outline"
                  className="mt-4 rounded-full"
                  onClick={() => {
                    setCond("");
                    setLang("");
                  }}
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {shown.map((o, i) => (
                <div
                  key={o.listing_id}
                  className={`grid items-center gap-4 rounded-2xl border bg-card p-4 shadow-slab md:grid-cols-[1.4fr_1fr_auto_auto] ${
                    i === 0 ? "border-primary/40" : "border-border"
                  }`}
                >
                  <div>
                    <SellerLine s={o} />
                    {o.notes && <p className="mt-2 break-words text-xs text-muted-foreground">{o.notes}</p>}
                    <ListingPhotos paths={photos.find((p) => p.id === o.listing_id)?.photo_paths ?? []} store={o.store_name} />
                    <div className="mt-1">
                      <ReportButton type="listing" id={o.listing_id} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 font-semibold">{o.condition}</span>
                    <span className="rounded-full bg-muted px-2.5 py-0.5">{LANGUAGES[o.language] ?? o.language}</span>
                    <span className="rounded-full bg-muted px-2.5 py-0.5">{FINISHES[o.finish] ?? o.finish}</span>
                    {o.graded && (
                      <span className="rounded-full bg-ink px-2.5 py-0.5 text-ink-foreground">
                        {o.grade_company} {o.grade}
                      </span>
                    )}
                    <span className="px-1 text-muted-foreground">{o.quantity} em estoque</span>
                  </div>
                  <p className="num text-2xl font-bold">{money(Number(o.price), o.currency)}</p>
                  <Button
                    onClick={() => add(o)}
                    className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                  >
                    Adicionar
                  </Button>
                </div>
              ))}
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-success" /> Todas as lojas passaram pela curadoria {BRAND.name}. Avaliações só de compradores
                com pedido entregue.{" "}
                <Link to="/compra-garantida" className="text-primary underline">
                  Compra Garantida
                </Link>
              </p>
            </div>
          )}
        </section>
        <ListingQuestions cardId={card.id} listings={offers.map((o) => ({ listing_id: o.listing_id, store_name: o.store_name }))} />
      </main>

      {best && (
        <div className="fixed inset-x-3 bottom-[84px] z-30 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-float backdrop-blur lg:hidden">
          <div>
            <p className="text-[11px] text-muted-foreground">a partir de</p>
            <p className="num text-lg font-bold">{money(Number(best.price), best.currency)}</p>
          </div>
          <Button
            onClick={() => {
              add(best);
              nav({ to: "/carrinho" });
            }}
            className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground"
          >
            Comprar
          </Button>
        </div>
      )}
    </PageShell>
  );
}

const RANGES = [
  { l: "7D", d: 7, pro: false },
  { l: "1M", d: 30, pro: false },
  { l: "3M", d: 90, pro: false },
  { l: "6M", d: 182, pro: true },
  { l: "1A", d: 365, pro: true },
  { l: "Tudo", d: null, pro: true },
] as const;

function PriceHistory({ cardId, quote, fx }: { cardId: string; quote: CardQuote | undefined; fx: FxRates }) {
  const [r, setR] = useState<(typeof RANGES)[number]>(RANGES[2]);
  const hasTcg = Boolean(quote?.tcgplayer);
  const hasCm = Boolean(quote?.cardmarket);
  const [viewMode, setViewMode] = useState<"brl" | "tcgplayer" | "cardmarket">("brl");
  const supabaseReady = isSupabaseConfigured();

  const { data, isLoading } = useQuery({
    queryKey: ["history", cardId, r.d],
    enabled: supabaseReady,
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

  const dbLocked = Boolean(data?.[0]?.locked);
  const dbPoints = useMemo(
    () =>
      (data ?? [])
        .filter((p) => !p.locked && p.amount != null)
        .map((p) => ({ t: new Date(p.observed_at ?? "").getTime(), price: Number(p.amount), source: p.source ?? "live" })),
    [data],
  );

  // When DB has no rows yet and user clicks a Pro timeframe (6M, 1A, Tudo), honor the Pro gate consistently.
  const locked = dbLocked || (dbPoints.length === 0 && r.pro);

  const activeMode: "brl" | "tcgplayer" | "cardmarket" =
    viewMode === "cardmarket" && hasCm ? "cardmarket" : viewMode === "tcgplayer" && hasTcg ? "tcgplayer" : "brl";

  const fallbackSeries = useMemo(() => {
    if (dbPoints.length > 0 || locked) return [];
    if (activeMode === "brl") {
      const baseMarket = hasTcg ? "tcgplayer" : hasCm ? "cardmarket" : undefined;
      const srcCurr = baseMarket === "cardmarket" ? quote?.cardmarket?.currency : quote?.tcgplayer?.currency ?? quote?.currency;
      const mult = fxRateToBrl(srcCurr, fx);
      return buildReferenceSeries(quote, r.d, baseMarket, { currency: "BRL", multiplier: mult });
    }
    return buildReferenceSeries(quote, r.d, activeMode);
  }, [dbPoints.length, locked, quote, r.d, activeMode, hasTcg, hasCm, fx]);

  const points = useMemo(() => {
    if (dbPoints.length > 0) return dbPoints;
    return fallbackSeries.map((p) => ({ t: new Date(p.observed_at).getTime(), price: p.amount, source: p.source }));
  }, [dbPoints, fallbackSeries]);

  const currency =
    dbPoints.length > 0 || activeMode === "brl"
      ? "BRL"
      : activeMode === "cardmarket"
        ? quote?.cardmarket?.currency ?? "EUR"
        : quote?.tcgplayer?.currency ?? quote?.currency ?? "USD";

  const fromWindows = points.some((p) => p.source === "tcgdex-window");
  const demo = points.some((p) => p.source === "demo");
  const prices = points.map((p) => p.price);
  const last = prices[prices.length - 1];
  const first = prices[0];
  const change = last != null && first ? ((last / first) - 1) * 100 : null;
  const up = (change ?? 0) >= 0;
  const color = up ? "var(--up)" : "var(--down)";
  const fmtDate = (t: number) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const fmtMoney = (v: number) => money(v, currency);
  const tcg = quote?.tcgplayer;
  const cm = quote?.cardmarket;

  return (
    <section className="relative z-10 -mt-6 rounded-3xl border border-border bg-card p-5 shadow-float md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <span>Histórico de preço</span>
            {activeMode === "brl" && dbPoints.length === 0 && <DemoBadge label="Referência BRL · TCGdex" />}
            {activeMode !== "brl" && fromWindows && <DemoBadge label="Médias Cardmarket" />}
            {activeMode !== "brl" && !fromWindows && demo && <DemoBadge label="Referência TCGdex" />}
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <p className="num text-4xl font-bold">{!locked && last != null ? fmtMoney(last) : "—"}</p>
            {!locked && <Change pct={change} className="text-sm" />}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dbPoints.length === 0 && (hasTcg || hasCm) && (
            <div className="flex rounded-full border border-border bg-muted/60 p-1 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("brl")}
                className={`rounded-full px-3 py-1 font-semibold transition ${
                  activeMode === "brl" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                BRL (R$)
              </button>
              {hasTcg && (
                <button
                  type="button"
                  onClick={() => setViewMode("tcgplayer")}
                  className={`rounded-full px-3 py-1 font-semibold transition ${
                    activeMode === "tcgplayer" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  USD
                </button>
              )}
              {hasCm && (
                <button
                  type="button"
                  onClick={() => setViewMode("cardmarket")}
                  className={`rounded-full px-3 py-1 font-semibold transition ${
                    activeMode === "cardmarket" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  EUR
                </button>
              )}
            </div>
          )}
          <div className="flex rounded-full bg-muted p-1">
            {RANGES.map((x) => (
              <button
                key={x.l}
                type="button"
                onClick={() => setR(x)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  r.l === x.l ? "bg-ink text-ink-foreground shadow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {x.l}
                {x.pro && <Lock className="h-3 w-3 opacity-75" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!locked && prices.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <Stat l="Mínima no período" v={fmtMoney(Math.min(...prices))} />
          <Stat l="Máxima no período" v={fmtMoney(Math.max(...prices))} />
          <Stat l="Média no período" v={fmtMoney(prices.reduce((a, b) => a + b, 0) / prices.length)} />
        </div>
      )}

      <div className="mt-5 h-64 min-h-[16rem]">
        {locked ? (
          <div className="dots flex h-full flex-col items-center justify-center rounded-2xl bg-muted/70 p-6 text-center">
            <Lock className="h-6 w-6 text-primary" />
            <p className="mt-2 font-display text-lg font-bold">Histórico estendido ({r.l})</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Acompanhe como o preço desta carta evoluiu em 6 meses, 1 ano ou desde o lançamento com o Collector Pro.
            </p>
            <Link to="/planos" className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
              Conhecer planos
            </Link>
          </div>
        ) : supabaseReady && isLoading && points.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground">Carregando gráfico…</div>
        ) : points.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-muted p-6 text-center text-sm text-muted-foreground">
            Ainda não há cotação pública para montar o gráfico desta carta.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id={`pg-${cardId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={fmtDate}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={44}
                stroke="var(--muted-foreground)"
              />
              <YAxis
                fontSize={11}
                width={76}
                tickLine={false}
                axisLine={false}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => fmtMoney(v).replace(",00", "")}
                stroke="var(--muted-foreground)"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                  boxShadow: "0 12px 30px -12px rgba(0,0,0,0.35)",
                }}
                labelFormatter={(t) => new Date(Number(t)).toLocaleDateString("pt-BR")}
                formatter={(v) => [fmtMoney(Number(v)), "Preço"]}
              />
              <Area
                dataKey="price"
                type="monotone"
                stroke={color}
                strokeWidth={2.2}
                fill={`url(#pg-${cardId})`}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {quote?.available && (tcg || cm) && (
        <div className="mt-4 grid gap-2.5 border-t border-border pt-4 text-xs sm:grid-cols-2">
          {tcg && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5">
              <div>
                <p className="font-semibold text-foreground">TCGplayer · EUA ({tcg.finish})</p>
                <p className="text-[11px] text-muted-foreground">
                  {tcg.low != null ? `Mín ${money(tcg.low, tcg.currency)}` : ""}
                  {tcg.low != null && tcg.mid != null ? " · " : ""}
                  {tcg.mid != null ? `Med ${money(tcg.mid, tcg.currency)}` : ""}
                </p>
              </div>
              <p className="num text-base font-bold text-foreground">{money(tcg.market, tcg.currency)}</p>
            </div>
          )}
          {cm && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5">
              <div>
                <p className="font-semibold text-foreground">Cardmarket · Europa</p>
                <p className="text-[11px] text-muted-foreground">
                  {cm.avg7 != null ? `7D ${money(cm.avg7, cm.currency)}` : ""}
                  {cm.avg7 != null && cm.avg30 != null ? " · " : ""}
                  {cm.avg30 != null ? `30D ${money(cm.avg30, cm.currency)}` : ""}
                </p>
              </div>
              <p className="num text-base font-bold text-foreground">{money(cm.trend ?? cm.avg ?? cm.avg7 ?? 0, cm.currency)}</p>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        {dbPoints.length > 0
          ? "Histórico registrado no banco PokePlace a partir de observações diárias e vendas liquidadas."
          : activeMode === "brl"
            ? `Referência convertida para reais (US$ 1 ≈ ${money(fx.USD, "BRL")} · € 1 ≈ ${money(fx.EUR, "BRL")}) a partir das cotações públicas da TCGdex enquanto o histórico nacional acumula.`
            : fromWindows
              ? "Série ancorada nas médias públicas de 1, 7 e 30 dias da Cardmarket (via TCGdex). Não representa vendas liquidadas no PokePlace."
              : "Curva de referência ancorada no preço de mercado TCGplayer (TCGdex) enquanto o histórico diário acumula no banco."}{" "}
        3 meses grátis; períodos maiores no Collector Pro.
      </p>
    </section>
  );
}

function Stat({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded-xl bg-muted px-3.5 py-2.5">
      <p className="text-[11px] text-muted-foreground">{l}</p>
      <p className="num mt-0.5 font-semibold">{v}</p>
    </div>
  );
}
