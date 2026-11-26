import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, LineChart, ShieldCheck, Store, TrendingUp } from "lucide-react";
import { PageShell, SearchBox } from "@/components/SiteHeader";
import { DemoBadge, Slab, useTrends } from "@/components/CardGrid";
import { Change, HoloCard, SellerLine, Sparkline } from "@/components/market";
import { latestListings, listSets, listStores, marketStats, trendingCards } from "@/lib/catalog.functions";
import { BRAND, money } from "@/lib/format";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [sets, listings, stats, stores, trending] = await Promise.all([
      listSets(),
      latestListings(),
      marketStats(),
      listStores(),
      trendingCards(),
    ]);
    return { sets, listings, stats, stores, trending };
  },
  head: () => ({
    meta: [
      { title: `${BRAND.name} — Marketplace e preços de cartas Pokémon` },
      { name: "description", content: "Encontre a carta exata, compare lojas avaliadas e acompanhe o preço de cada carta no tempo." },
      { property: "og:title", content: `${BRAND.name} — Marketplace de cartas Pokémon` },
      { property: "og:description", content: "Lojas com curadoria e reputação, e gráfico de preço em cada carta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { sets, listings, stats, stores, trending } = Route.useLoaderData();
  const fan = trending.slice(0, 5);
  const trends = useTrends(trending.map((c) => c.id));
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const movers = trending
    .map((c) => ({ c, t: trends[c.id] }))
    .filter((x) => x.t)
    .sort((a, b) => Math.abs(b.t!.change ?? 0) - Math.abs(a.t!.change ?? 0));
  const heroCard = trending.find((c) => c.id === "base1-4") ?? trending[0];
  const hero = heroCard ? trends[heroCard.id] : undefined;

  return (
    <PageShell>
      {/* HERO */}
      <section className="grain relative overflow-hidden bg-ink-glow text-ink-foreground">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-holo opacity-20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-10 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-24">
          <div className="animate-rise">
            <p className="num inline-flex items-center gap-2 rounded-full border border-ink-foreground/15 px-3 py-1 text-[11px] uppercase tracking-[0.2em] opacity-80">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Pokémon TCG · {fmt(stats.cards)} cartas catalogadas
            </p>
            <h1 className="mt-5 text-[13vw] font-extrabold leading-[0.88] sm:text-6xl md:text-7xl lg:text-8xl">
              A carta certa.
              <br />
              <span className="text-holo-grad animate-shine">O preço certo.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg opacity-70">
              Compare lojas avaliadas por colecionadores e veja como o preço de cada carta mudou no tempo — antes de comprar.
            </p>
            <div className="mt-8 max-w-xl text-foreground">
              <SearchBox big />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {["Charizard", "Umbreon", "Pikachu", "Mew ex", "Lugia", "Rayquaza"].map((t) => (
                <Link
                  key={t}
                  to="/busca"
                  search={{ q: t, set: undefined, rarity: undefined }}
                  className="rounded-full border border-ink-foreground/15 px-3 py-1 opacity-75 transition hover:bg-ink-foreground/10 hover:opacity-100"
                >
                  {t}
                </Link>
              ))}
            </div>
          </div>

          <div className="relative mx-auto h-[360px] w-full max-w-lg sm:h-[440px]">
            {fan.map((card, i) => {
              const rot = [-20, -10, 0, 10, 20][i] ?? 0;
              return (
                <Link
                  key={card.id}
                  to="/carta/$cardId"
                  params={{ cardId: card.id }}
                  style={{
                    transform: `translateX(${(i - 2) * 22}%) translateY(${Math.abs(i - 2) * 18}px) rotate(${rot}deg)`,
                    zIndex: i === 2 ? 10 : 5 - Math.abs(i - 2),
                  }}
                  className="absolute left-1/2 top-2 -ml-[95px] w-[190px] transition duration-500 hover:z-20 hover:-translate-y-4 sm:-ml-[115px] sm:w-[230px]"
                >
                  <div className={i === 2 ? "animate-float" : ""}>
                    <HoloCard src={card.image_small} alt={card.name} eager className="shadow-float ring-1 ring-ink-foreground/10" />
                  </div>
                </Link>
              );
            })}
            {hero && heroCard && (
              <Link
                to="/carta/$cardId"
                params={{ cardId: heroCard.id }}
                className="absolute bottom-0 left-1/2 z-30 w-64 -translate-x-1/2 rounded-2xl border border-border bg-card/95 p-3 text-card-foreground shadow-float backdrop-blur transition hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-semibold">
                    {heroCard.name} · {heroCard.card_sets?.name}
                  </span>
                  <Change pct={hero.change} />
                </div>
                <p className="num mt-0.5 text-xl font-bold">{money(hero.last, hero.currency)}</p>
                <Sparkline points={hero.points} className="mt-1 h-9 w-full" />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Últimos 90 dias · {hero.demo ? "ref. TCGdex" : "histórico PokePlace"}
                </p>
              </Link>
            )}
          </div>
        </div>
        <div className="relative border-t border-ink-foreground/10">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-ink-foreground/10 px-4 md:grid-cols-4">
            {[
              [fmt(stats.cards), "cartas no catálogo"],
              [fmt(stats.sets), "coleções"],
              [fmt(stats.offers), "ofertas ativas"],
              [fmt(stats.stores), "lojas vendendo"],
            ].map(([n, l]) => (
              <div key={l} className="px-4 py-5 first:pl-0">
                <p className="num text-2xl font-bold">{n}</p>
                <p className="text-xs opacity-60">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MOVERS */}
      <section className="mx-auto max-w-7xl px-4 pt-14">
        <SectionHead
          kicker="Mercado"
          title="Cartas em movimento"
          extra={movers.some((m) => m.t?.demo) ? <DemoBadge label="Referência TCGdex" /> : null}
          link={
            <Link to="/busca" search={{ q: undefined, set: undefined, rarity: undefined }} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              Explorar catálogo <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        <div className="no-scrollbar -mx-4 mt-6 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
          {movers.length > 0
            ? movers.map(({ c, t }) => (
                <Link
                  key={c.id}
                  to="/carta/$cardId"
                  params={{ cardId: c.id }}
                  className="group flex w-72 shrink-0 snap-start items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-slab transition hover:-translate-y-0.5 hover:border-foreground/25"
                >
                  {c.image_small && (
                    <img
                      src={c.image_small}
                      alt={c.name}
                      loading="lazy"
                      className="h-24 w-auto rounded-md shadow-slab transition group-hover:rotate-[-3deg]"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.card_sets?.name} · #{c.number}
                    </p>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <span className="num font-bold">{money(t!.last, t!.currency)}</span>
                      <Change pct={t!.change} />
                    </div>
                    <Sparkline points={t!.points} className="mt-1 h-8 w-full" />
                  </div>
                </Link>
              ))
            : trending.slice(0, 6).map((c) => (
                <Link
                  key={c.id}
                  to="/carta/$cardId"
                  params={{ cardId: c.id }}
                  className="flex w-72 shrink-0 snap-start items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-slab"
                >
                  {c.image_small && <img src={c.image_small} alt={c.name} loading="lazy" className="h-24 w-auto rounded-md shadow-slab" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.card_sets?.name} · #{c.number}
                    </p>
                    <div className="mt-2 h-4 w-24 animate-pulse rounded bg-muted" />
                    <div className="mt-2 h-7 w-full animate-pulse rounded bg-muted" />
                  </div>
                </Link>
              ))}
        </div>
      </section>

      {/* LATEST LISTINGS */}
      <section className="mx-auto max-w-7xl px-4 pt-14">
        <SectionHead kicker="À venda agora" title="Novidades das lojas" />
        {listings.length === 0 ? (
          <div className="dots mt-6 grid gap-6 rounded-3xl border border-dashed border-border p-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-display text-2xl font-bold">As primeiras lojas estão chegando.</p>
              <p className="mt-1 max-w-xl text-muted-foreground">
                Cada loja passa por curadoria antes de vender. Tem estoque de cartas? Seja uma das lojas fundadoras.
              </p>
            </div>
            <Link
              to="/vender"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Quero vender <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
            {listings.map((l) => (
              <Slab
                key={l.id}
                to={{ cardId: l.card_id }}
                image={l.cards?.image_small ?? null}
                title={l.cards?.name ?? ""}
                sub={`${l.cards?.card_sets?.name ?? ""} · ${l.condition}`}
                trend={trends[l.card_id]}
                priceLabel={<p className="num text-base font-bold">{money(Number(l.price), l.currency)}</p>}
              />
            ))}
          </div>
        )}
      </section>

      {/* STORES */}
      <section className="mx-auto max-w-7xl px-4 pt-14">
        <SectionHead kicker="Lojas" title="Lojas verificadas" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stores.map((s) => (
            <article key={s.id} className="rounded-2xl border border-border bg-card p-4 shadow-slab transition hover:-translate-y-0.5">
              <SellerLine s={s} />
              <p className="mt-3 text-xs text-muted-foreground">
                <b className="num text-foreground">{Number(s.active_listings)}</b> cartas à venda
              </p>
            </article>
          ))}
          <Link
            to="/vender"
            className="grid min-h-[112px] place-items-center rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <span>
              <Store className="mx-auto mb-2 h-6 w-6" />
              Abra sua loja aqui
            </span>
          </Link>
        </div>
      </section>

      {/* SETS */}
      <section className="mx-auto max-w-7xl px-4 pt-14">
        <SectionHead
          kicker="Catálogo"
          title="Coleções"
          link={
            <Link to="/colecoes" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              Ver todas <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {sets.slice(0, 10).map((s) => (
            <Link
              key={s.id}
              to="/colecoes/$setId"
              params={{ setId: s.id }}
              className="group grid h-32 place-items-center rounded-2xl border border-border bg-card p-4 text-center shadow-slab transition hover:-translate-y-0.5 hover:border-foreground/25"
            >
              {s.logo_url ? (
                <img src={s.logo_url} alt={s.name} loading="lazy" className="max-h-14 w-auto object-contain transition group-hover:scale-105" />
              ) : (
                <span className="font-display font-bold">{s.name}</span>
              )}
              <span className="text-[11px] text-muted-foreground">
                {s.total ?? "—"} cartas · {s.release_date?.slice(0, 4) ?? "—"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* WHY */}
      <section className="mx-auto max-w-7xl px-4 pt-16">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { i: ShieldCheck, t: "Lojas com curadoria", d: "Toda loja é analisada antes de vender. Selo de verificação e reputação pública." },
            { i: LineChart, t: "Preço no tempo", d: "Cada carta tem gráfico de preço com referências internacionais e histórico." },
            { i: BadgeCheck, t: "Avaliações reais", d: "Só quem comprou e recebeu pode avaliar a loja. Pedidos de teste não geram reputação." },
          ].map(({ i: I, t, d }) => (
            <div key={t} className="rounded-2xl border border-border bg-card p-6 shadow-slab">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-glow text-ink-foreground">
                <I className="h-5 w-5" />
              </span>
              <p className="mt-4 font-display text-lg font-bold">{t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
        <Link
          to="/planos"
          className="grain mt-3 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl bg-ink-glow p-6 text-ink-foreground transition hover:opacity-95"
        >
          <div className="flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-holo" />
            <p>
              <b>Histórico completo de preços</b>{" "}
              <span className="opacity-70">— 3 meses grátis para todos, desde o lançamento no Premium.</span>
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-ink-foreground px-4 py-2 text-sm font-semibold text-ink">
            Conhecer Premium <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </section>
    </PageShell>
  );
}

function SectionHead({ kicker, title, link, extra }: { kicker: string; title: string; link?: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="num text-[11px] uppercase tracking-[0.2em] text-primary">{kicker}</p>
        <h2 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-extrabold md:text-4xl">
          {title} {extra}
        </h2>
      </div>
      {link}
    </div>
  );
}
