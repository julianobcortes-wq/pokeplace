import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Award,
  BadgeCheck,
  Clock,
  Flame,
  MapPin,
  ShieldCheck,
  Store,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { PageShell } from "@/components/SiteHeader";
import {
  BuyerTierBadge,
  Change,
  MedalBadge,
  Sparkline,
  Stars,
  StoreAvatar,
  ThermometerBar,
  VerifiedPill,
} from "@/components/market";
import { Button } from "@/components/ui/button";
import { BRAND, money } from "@/lib/format";
import {
  getBuyerRankings,
  getMarketCardRankings,
  getSellerRankings,
  type RankedCard,
} from "@/lib/marketplace/ranking.functions";
import {
  BR_STATES,
  BUYER_TIER_META,
  formatResponseTime,
  MEDAL_META,
} from "@/lib/marketplace/rules";

type RankingTab = "lojas" | "compradores" | "cartas";

export const Route = createFileRoute("/ranking")({
  validateSearch: (s: Record<string, unknown>): { tab?: RankingTab } => {
    const t = s["tab"];
    if (t === "lojas" || t === "compradores" || t === "cartas") return { tab: t };
    return {};
  },
  loader: async () => {
    const [sellers, buyers, cards] = await Promise.all([
      getSellerRankings({ data: { sort: "score", limit: 50 } }),
      getBuyerRankings({ data: { limit: 50 } }),
      getMarketCardRankings(),
    ]);
    return { sellers, buyers, cards };
  },
  head: () => ({
    meta: [
      { title: `Ranking de Lojas, Compradores e Cartas | ${BRAND.name}` },
      {
        name: "description",
        content:
          "Ranking oficial PokePlace com Termômetro de Reputação estilo Mercado Livre, medalhas PokeLíder, colecionadores verificados e maiores altas do mercado Pokémon TCG em R$.",
      },
      { property: "og:title", content: `Ranking oficial | ${BRAND.name}` },
      {
        property: "og:description",
        content:
          "Lojas com termômetro verde, compradores verificados (opt-in LGPD) e cartas em alta em R$.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RankingPage,
});

function RankingPage() {
  const initial = Route.useLoaderData();
  const search = Route.useSearch();
  const [tab, setTab] = useState<RankingTab>(search.tab ?? "lojas");
  const [uf, setUf] = useState("");
  const [sort, setSort] = useState<"score" | "sales" | "rating">("score");

  const { data: sellers = initial.sellers, isFetching: loadingSellers } = useQuery({
    queryKey: ["ranking-sellers", uf, sort],
    queryFn: () => getSellerRankings({ data: { state: uf || undefined, sort, limit: 50 } }),
    initialData: uf === "" && sort === "score" ? initial.sellers : undefined,
    staleTime: 60_000,
  });

  const buyers = initial.buyers;
  const cards = initial.cards;
  const topGainer = cards.gainers[0];
  const topValuable = cards.valuable[0];

  return (
    <PageShell>
      {/* Hero */}
      <section className="grain relative overflow-hidden bg-ink-glow text-ink-foreground">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-holo opacity-20 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 md:py-14">
          <p className="num inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            <Trophy className="h-3.5 w-3.5" /> Reputação & Transparência
          </p>
          <h1 className="mt-2 max-w-3xl font-display text-3xl font-extrabold tracking-tight md:text-5xl">
            Ranking PokePlace
          </h1>
          <p className="mt-3 max-w-2xl text-sm opacity-75 md:text-base">
            Classificação auditável calculada diretamente sobre vendas reais: Termômetro de 5 cores, medalhas PokeLíder,
            ranking de colecionadores (opt-in LGPD) e as cartas mais quentes do mercado em R$.
          </p>

          <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
            <HeroStat
              label="Lojas ranqueadas"
              value={String(initial.sellers.length)}
              sub="curadoria + termômetro ativo"
            />
            <HeroStat
              label="Colecionadores"
              value={String(buyers.length)}
              sub="perfil público (opt-in LGPD)"
            />
            <HeroStat
              label="Maior alta (30d)"
              value={topGainer ? `+${topGainer.changePct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}
              sub={topGainer ? `${topGainer.name} #${topGainer.number}` : "mercado ao vivo"}
            />
            <HeroStat
              label="Carta mais valiosa"
              value={topValuable ? money(topValuable.priceBrl) : "—"}
              sub={topValuable ? `${topValuable.name} #${topValuable.number}` : "referência BRL"}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3 text-xs">
            <Link
              to="/regras-vendedor"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-foreground/15 bg-ink-foreground/5 px-3.5 py-1.5 font-medium transition hover:bg-ink-foreground/10"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-success" /> Como funciona o Termômetro e Strikes
            </Link>
            <Link
              to="/compra-garantida"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-foreground/15 bg-ink-foreground/5 px-3.5 py-1.5 font-medium transition hover:bg-ink-foreground/10"
            >
              <Award className="h-3.5 w-3.5 text-primary" /> Compra Garantida & Arrependimento 7 dias (CDC)
            </Link>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <main className="mx-auto max-w-7xl px-4">
        <div className="sticky top-[60px] z-20 -mx-4 flex flex-wrap items-center gap-1.5 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          {([
            ["lojas", "Top Lojas", Store, initial.sellers.length],
            ["compradores", "Top Compradores", Users, buyers.length],
            ["cartas", "Mercado de Cartas", Flame, cards.valuable.length],
          ] as const).map(([key, label, Icon, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                tab === key
                  ? "bg-ink text-ink-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              <span
                className={`num rounded-full px-1.5 py-0.5 text-[11px] ${
                  tab === key ? "bg-ink-foreground/15 text-ink-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* TAB 1: TOP LOJAS */}
        {tab === "lojas" && (
          <section className="space-y-6 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">Ranking de Lojas Verificadas</h2>
                <p className="text-xs text-muted-foreground">
                  Pontuação automática combinando nota dos compradores, envios no prazo (SLA), reclamações, cancelamentos e medalhas PokeLíder.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filtrar por estado"
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                  className="rounded-full border border-input bg-card px-3.5 py-2 text-xs font-medium"
                >
                  <option value="">Todos os estados (UF)</option>
                  {BR_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Ordenar ranking de lojas"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as "score" | "sales" | "rating")}
                  className="rounded-full border border-input bg-card px-3.5 py-2 text-xs font-medium"
                >
                  <option value="score">Melhor reputação (geral)</option>
                  <option value="sales">Mais vendas concluídas</option>
                  <option value="rating">Maior nota média</option>
                </select>
              </div>
            </div>

            {loadingSellers ? (
              <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                Atualizando ranking de lojas…
              </p>
            ) : sellers.length === 0 ? (
              <div className="dots rounded-3xl border border-dashed border-border p-8 text-center">
                <Store className="mx-auto h-9 w-9 text-muted-foreground/60" />
                <h3 className="mt-3 font-display text-lg font-bold">
                  {uf ? `Nenhuma loja aprovada em ${uf} ainda` : "O ranking está pronto para as primeiras lojas aprovadas"}
                </h3>
                <p className="mx-auto mt-1.5 max-w-lg text-sm text-muted-foreground">
                  O PokePlace nunca exibe lojas fictícias. Assim que as primeiras lojas forem aprovadas na curadoria e
                  concluírem vendas reais, elas aparecerão automaticamente aqui com Termômetro e medalhas PokeLíder.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                  <Link to="/vender">
                    <Button className="rounded-full">Cadastrar minha loja</Button>
                  </Link>
                  <Button variant="outline" className="rounded-full" onClick={() => setTab("cartas")}>
                    Explorar Mercado de Cartas ao vivo →
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {sellers.map((s, idx) => (
                  <article
                    key={s.id}
                    className="grid items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-slab transition hover:border-primary/40 md:grid-cols-[44px_minmax(0,1.4fr)_180px_minmax(0,1.2fr)_auto]"
                  >
                    <div className="flex items-center justify-center">
                      <span
                        className={`num grid h-9 w-9 place-items-center rounded-xl text-sm font-extrabold ${
                          idx === 0
                            ? "bg-chart-4/20 text-chart-4"
                            : idx === 1
                              ? "bg-muted text-foreground"
                              : idx === 2
                                ? "bg-chart-5/20 text-chart-5"
                                : "bg-muted/60 text-muted-foreground"
                        }`}
                      >
                        #{idx + 1}
                      </span>
                    </div>

                    <div className="flex min-w-0 items-center gap-3">
                      <StoreAvatar name={s.store_name} logo={s.logo_url} size="h-12 w-12" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            to="/loja/$slug"
                            params={{ slug: s.slug }}
                            className="truncate font-display text-base font-bold hover:text-primary"
                          >
                            {s.store_name}
                          </Link>
                          {s.is_official && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Loja oficial" />}
                          <MedalBadge medal={s.medal} />
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
                          <VerifiedPill />
                          {s.city && (
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" /> {s.city}/{s.state}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="h-3 w-3" /> {formatResponseTime(s.avg_response_hours)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <ThermometerBar thermometer={s.thermometer} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-muted/60 px-2 py-1.5">
                        <p className="num font-bold text-foreground">
                          {s.reviews > 0 ? s.rating.toFixed(1) : "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.reviews > 0 ? `${s.reviews} aval.` : "Sem aval."}
                        </p>
                      </div>
                      <div className="rounded-xl bg-muted/60 px-2 py-1.5">
                        <p className="num font-bold text-foreground">{s.completed_sales}</p>
                        <p className="text-[10px] text-muted-foreground">vendas</p>
                      </div>
                      <div className="rounded-xl bg-muted/60 px-2 py-1.5">
                        <p className="num font-bold text-foreground">{s.on_time_rate.toFixed(0)}%</p>
                        <p className="text-[10px] text-muted-foreground">no prazo</p>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Link to="/loja/$slug" params={{ slug: s.slug }}>
                        <Button size="sm" variant="outline" className="rounded-full">
                          Ver loja ({s.active_listings})
                        </Button>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* Transparent Criteria Card */}
            <div className="grid gap-4 pt-2 md:grid-cols-3">
              {(["lider", "lider_gold", "lider_platinum"] as const).map((m) => (
                <div key={m} className="rounded-2xl border border-border bg-card p-5 shadow-slab">
                  <MedalBadge medal={m} />
                  <p className="mt-2 font-display text-base font-bold">{MEDAL_META[m].minSales}+ vendas concluídas</p>
                  <p className="mt-1 text-xs text-muted-foreground">{MEDAL_META[m].description}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Requisito: reclamações &lt; 2%, cancelamentos &lt; 2%, envios no prazo ≥ 95% e nota ≥ 4,7.
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 2: TOP COMPRADORES */}
        {tab === "compradores" && (
          <section className="space-y-6 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">Ranking de Compradores e Colecionadores</h2>
                <p className="text-xs text-muted-foreground">
                  Participação 100% opcional (LGPD): apenas quem ativa o apelido público em Minha Conta aparece nesta lista.
                </p>
              </div>
              <Link to="/conta">
                <Button size="sm" variant="outline" className="rounded-full">
                  Ativar meu apelido público →
                </Button>
              </Link>
            </div>

            {buyers.length === 0 ? (
              <div className="dots rounded-3xl border border-dashed border-border p-8 text-center">
                <Users className="mx-auto h-9 w-9 text-muted-foreground/60" />
                <h3 className="mt-3 font-display text-lg font-bold">Nenhum colecionador listado publicamente ainda</h3>
                <p className="mx-auto mt-1.5 max-w-lg text-sm text-muted-foreground">
                  Para respeitar a LGPD, todos os compradores começam com o perfil privado. Ative a opção{" "}
                  <b>“Aparecer no Ranking de Compradores”</b> em Minha Conta e escolha seu apelido de colecionador.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                  <Link to="/conta">
                    <Button className="rounded-full">Configurar meu perfil de colecionador</Button>
                  </Link>
                  <Button variant="outline" className="rounded-full" onClick={() => setTab("cartas")}>
                    Ver Mercado de Cartas →
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-slab">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Colecionador</th>
                      <th className="px-4 py-3">Nível</th>
                      <th className="px-4 py-3 text-right">Compras</th>
                      <th className="px-4 py-3 text-right">Avaliação das lojas</th>
                      <th className="px-4 py-3 text-right">Pontuação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {buyers.map((b, i) => (
                      <tr key={`${b.display_name}-${i}`} className="hover:bg-muted/30">
                        <td className="num px-4 py-3 font-bold text-muted-foreground">#{i + 1}</td>
                        <td className="px-4 py-3 font-semibold">{b.display_name}</td>
                        <td className="px-4 py-3">
                          <BuyerTierBadge tier={b.tier} />
                        </td>
                        <td className="num px-4 py-3 text-right font-semibold">{b.completed_purchases}</td>
                        <td className="px-4 py-3 text-right">
                          {b.reviews > 0 ? (
                            <span className="inline-flex items-center justify-end gap-1.5">
                              <Stars value={b.rating} />
                              <span className="num font-semibold">{b.rating.toFixed(1)}</span>
                              <span className="text-xs text-muted-foreground">({b.reviews})</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem avaliações</span>
                          )}
                        </td>
                        <td className="num px-4 py-3 text-right font-bold text-primary">{b.score.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(["regular", "confiavel", "ouro", "vip"] as const).map((tier) => (
                <div key={tier} className="rounded-2xl border border-border bg-card p-4 shadow-slab">
                  <BuyerTierBadge tier={tier} />
                  <p className="mt-2 text-xs text-muted-foreground">{BUYER_TIER_META[tier].description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 3: MERCADO DE CARTAS (LIVE BRL) */}
        {tab === "cartas" && (
          <section className="space-y-8 pt-6">
            <div>
              <h2 className="font-display text-xl font-bold">Mercado de Cartas Pokémon TCG (R$)</h2>
              <p className="text-xs text-muted-foreground">
                Acompanhe as maiores altas, quedas e cartas mais valiosas do catálogo PokePlace com referência em Real brasileiro.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <CardRankingColumn
                title="Maiores Altas (30d)"
                icon={<TrendingUp className="h-4 w-4 text-up" />}
                items={cards.gainers}
                emptyText="Sem altas registradas no momento."
              />
              <CardRankingColumn
                title="Maiores Quedas (30d)"
                icon={<TrendingDown className="h-4 w-4 text-down" />}
                items={cards.losers}
                emptyText="Sem quedas registradas no momento."
              />
              <CardRankingColumn
                title="Mais Valiosas (R$)"
                icon={<Trophy className="h-4 w-4 text-chart-4" />}
                items={cards.valuable}
                emptyText="Catálogo indisponível."
              />
            </div>
          </section>
        )}
      </main>
    </PageShell>
  );
}

function HeroStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 p-4">
      <p className="text-xs opacity-60">{label}</p>
      <p className="num mt-1 truncate text-2xl font-extrabold">{value}</p>
      <p className="mt-0.5 truncate text-[11px] opacity-60">{sub}</p>
    </div>
  );
}

function CardRankingColumn({
  title,
  icon,
  items,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  items: RankedCard[];
  emptyText: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-slab">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        {icon}
        <h3 className="font-display text-base font-bold">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="mt-3 divide-y divide-border">
          {items.map((c, idx) => (
            <Link
              key={c.id}
              to="/carta/$cardId"
              params={{ cardId: c.id }}
              className="flex items-center gap-3 py-2.5 transition hover:bg-muted/40"
            >
              <span className="num w-5 text-xs font-bold text-muted-foreground">#{idx + 1}</span>
              {c.image_small && (
                <img
                  src={c.image_small}
                  alt={c.name}
                  loading="lazy"
                  className="h-12 w-auto shrink-0 rounded-sm shadow-sm"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {c.setName} · #{c.number}
                </p>
              </div>
              <div className="w-16 shrink-0">
                <Sparkline points={c.points} className="h-6 w-full" />
              </div>
              <div className="shrink-0 text-right">
                <p className="num text-sm font-bold">{money(c.priceBrl)}</p>
                <Change pct={c.changePct} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
