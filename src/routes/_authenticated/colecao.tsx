import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bell,
  Copy,
  Download,
  FolderKanban,
  Globe,
  Heart,
  Layers,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/SiteHeader";
import { useTrends } from "@/components/CardGrid";
import { Change, Sparkline } from "@/components/market";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dbRpc, dbTable } from "@/lib/supabase-ext";
import { useAuth } from "@/hooks/useAuth";
import { BRAND, CONDITIONS, money } from "@/lib/format";
import {
  conditionAdjustedPrice,
  exportCollectionCsv,
  summarizePortfolio,
  validateShareSlug,
  type PortfolioEntry,
} from "@/lib/marketplace/portfolio";

export const Route = createFileRoute("/_authenticated/colecao")({
  head: () => ({
    meta: [
      { title: `Minha coleção e portfólio | ${BRAND.name}` },
      { name: "description", content: "Portfólio Pokémon estilo Collectr: valor estimado, custo, lucro/prejuízo, alertas de preço e lista de desejos." },
      { property: "og:title", content: `Minha coleção | ${BRAND.name}` },
      { property: "og:description", content: "Cartas, portfólio e desejos pessoais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Collection,
});

type RawEntry = {
  id: string;
  card_id: string;
  kind: string;
  quantity: number;
  target_price: number | null;
  purchase_price?: number | null;
  condition?: string | null;
  cards?: { name: string; number: string; image_small: string | null; card_sets?: { name: string } | null } | null;
};

type WishlistMatch = {
  card_id: string;
  card_name: string;
  target_price: number;
  lowest_price: number;
  listing_count: number;
};

type PriceAlertRow = {
  id: string;
  card_id: string;
  direction: "below" | "above";
  target_brl: number;
  active: boolean;
  last_triggered_at: string | null;
  cards?: { name: string; number: string; image_small: string | null } | null;
};

function Collection() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"owned" | "wanted" | "alerts">("owned");
  const [groupBySet, setGroupBySet] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [slugInput, setSlugInput] = useState<string | null>(null);
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
      return (data ?? []) as unknown as RawEntry[];
    },
  });

  const { data: shareProfile } = useQuery({
    queryKey: ["collection-share-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await dbTable("profiles")
        .select("display_name,collection_public_opt_in,collection_share_slug")
        .eq("id", user!.id)
        .maybeSingle();
      return data as {
        display_name: string | null;
        collection_public_opt_in?: boolean;
        collection_share_slug?: string | null;
      } | null;
    },
  });

  const { data: wishlistMatches = [] } = useQuery({
    queryKey: ["wishlist-matches", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await dbRpc<WishlistMatch[]>("get_wishlist_matches");
      if (error) return [];
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["price-alerts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await dbTable("price_alerts")
        .select("id,card_id,direction,target_brl,active,last_triggered_at,cards(name,number,image_small)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data ?? []) as PriceAlertRow[];
    },
  });

  const owned = useMemo(() => data.filter((r) => r.kind === "owned"), [data]);
  const wanted = useMemo(() => data.filter((r) => r.kind === "wanted"), [data]);
  const cardIds = useMemo(() => [...new Set(data.map((r) => r.card_id))], [data]);
  const trends = useTrends(cardIds);

  const marketBrlMap = useMemo(() => {
    const out: Record<string, number> = {};
    for (const id of cardIds) {
      const t = trends[id];
      if (t?.last != null && t.last > 0) out[id] = t.last;
    }
    return out;
  }, [cardIds, trends]);

  const portfolioEntries: PortfolioEntry[] = useMemo(
    () =>
      data.map((r) => ({
        id: r.id,
        card_id: r.card_id,
        kind: r.kind,
        quantity: r.quantity || 1,
        condition: r.condition ?? "NM",
        purchase_price: r.purchase_price ?? null,
        target_price: r.target_price ?? null,
        card_name: r.cards?.name ?? null,
        card_number: r.cards?.number ?? null,
        set_name: r.cards?.card_sets?.name ?? null,
      })),
    [data],
  );

  const summary = useMemo(
    () => summarizePortfolio(portfolioEntries, marketBrlMap),
    [portfolioEntries, marketBrlMap],
  );

  const remove = async (id: string) => {
    const { error } = await supabase.from("collection_entries").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ["collection"] });
      qc.invalidateQueries({ queryKey: ["wishlist-matches"] });
    }
  };

  const toggleAlert = async (alert: PriceAlertRow) => {
    const { error } = await dbTable("price_alerts")
      .update({ active: !alert.active })
      .eq("id", alert.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["price-alerts"] });
  };

  const deleteAlert = async (id: string) => {
    const { error } = await dbTable("price_alerts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Alerta removido");
      qc.invalidateQueries({ queryKey: ["price-alerts"] });
    }
  };

  const exportCsv = () => {
    const csv = exportCollectionCsv(portfolioEntries, marketBrlMap);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pokeplace-colecao-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV da coleção exportado");
  };

  const currentSlug = slugInput ?? shareProfile?.collection_share_slug ?? "";
  const isPublic = Boolean(shareProfile?.collection_public_opt_in);

  const saveShareSettings = async (nextPublic: boolean) => {
    if (!user) return;
    const cleanSlug = currentSlug.trim().toLowerCase();
    if (nextPublic) {
      const check = validateShareSlug(cleanSlug);
      if (check) {
        toast.error(check);
        return;
      }
    }
    const { error } = await dbTable("profiles")
      .update({
        collection_public_opt_in: nextPublic,
        ...(cleanSlug ? { collection_share_slug: cleanSlug } : {}),
      })
      .eq("id", user.id);
    if (error) {
      toast.error(error.message.includes("unique") ? "Este endereço já está em uso. Tente outro." : error.message);
      return;
    }
    toast.success(nextPublic ? "Link público do seu acervo ativado!" : "Acervo voltou a ser privado.");
    qc.invalidateQueries({ queryKey: ["collection-share-profile"] });
  };

  const shareUrl =
    typeof window !== "undefined" && shareProfile?.collection_share_slug
      ? `${window.location.origin}/acervo/${shareProfile.collection_share_slug}`
      : "";

  const visible = useMemo(
    () =>
      data.filter(
        (r) =>
          (tab === "owned" || tab === "wanted") &&
          r.kind === tab &&
          (!q ||
            `${r.cards?.name ?? ""} ${r.cards?.number ?? ""} ${r.cards?.card_sets?.name ?? ""}`
              .toLowerCase()
              .includes(q.toLowerCase())),
      ),
    [data, tab, q],
  );

  const groupedVisible = useMemo(() => {
    if (!groupBySet) return null;
    const map = new Map<string, RawEntry[]>();
    for (const r of visible) {
      const s = r.cards?.card_sets?.name ?? "Outras coleções";
      const list = map.get(s) ?? [];
      list.push(r);
      map.set(s, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [visible, groupBySet]);

  return (
    <PageShell>
      <section className="grain relative overflow-hidden bg-ink-glow text-ink-foreground">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-holo opacity-15 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-8 md:py-12">
          <p className="num text-[11px] uppercase tracking-[0.2em] text-holo">Portfólio estilo Collectr</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl font-extrabold md:text-5xl">Minha coleção</h1>
              <p className="mt-2 max-w-xl text-sm opacity-75">
                Acompanhe valorização ajustada por condição, custo investido, lucro/prejuízo, metas de desejo e alertas de preço.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 px-4 py-3">
                <p className="text-[11px] opacity-60">Cartas na coleção</p>
                <p className="num mt-0.5 text-2xl font-bold">{summary.ownedCards}</p>
                <p className="text-[11px] opacity-55">
                  {summary.totalCopies} {summary.totalCopies === 1 ? "cópia" : "cópias"}
                </p>
              </div>
              <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 px-4 py-3">
                <p className="flex items-center gap-1 text-[11px] opacity-60">
                  <TrendingUp className="h-3.5 w-3.5 text-holo" /> Valor estimado
                </p>
                <p className="num mt-0.5 text-xl font-bold text-holo">
                  {summary.pricedCards > 0 ? money(summary.totalValueBrl) : "—"}
                </p>
                <p className="text-[10px] opacity-55">{summary.pricedCards} cartas cotadas</p>
              </div>
              <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 px-4 py-3">
                <p className="text-[11px] opacity-60">Custo investido</p>
                <p className="num mt-0.5 text-xl font-bold">
                  {summary.costedCards > 0 ? money(summary.totalCostBrl) : "—"}
                </p>
                <p className="text-[10px] opacity-55">{summary.costedCards} com custo</p>
              </div>
              <div className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 px-4 py-3">
                <p className="flex items-center gap-1 text-[11px] opacity-60">
                  {summary.pnlBrl >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                  )}
                  Lucro / Prejuízo
                </p>
                <p
                  className={`num mt-0.5 text-xl font-bold ${
                    summary.costedCards === 0
                      ? "opacity-70"
                      : summary.pnlBrl >= 0
                        ? "text-success"
                        : "text-destructive"
                  }`}
                >
                  {summary.costedCards > 0 ? `${summary.pnlBrl >= 0 ? "+" : ""}${money(summary.pnlBrl)}` : "—"}
                </p>
                <p className="num text-[10px] opacity-65">
                  {summary.pnlPct != null ? `${summary.pnlPct >= 0 ? "+" : ""}${summary.pnlPct.toFixed(1)}%` : "informe o custo"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        {wishlistMatches.length > 0 && (
          <section className="rounded-2xl border border-success/40 bg-success/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 text-success" />
              <h2 className="text-sm font-bold">
                {wishlistMatches.length} {wishlistMatches.length === 1 ? "carta da sua lista de desejos atingiu" : "cartas da sua lista de desejos atingiram"} sua meta de preço!
              </h2>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {wishlistMatches.map((m) => (
                <Link
                  key={m.card_id}
                  to="/carta/$cardId"
                  params={{ cardId: m.card_id }}
                  className="flex items-center justify-between gap-2 rounded-xl border border-success/30 bg-card px-3 py-2 text-xs transition hover:border-primary"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{m.card_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Meta {money(Number(m.target_price))} · {m.listing_count} {m.listing_count === 1 ? "oferta" : "ofertas"}
                    </p>
                  </div>
                  <span className="num shrink-0 rounded-full bg-success/15 px-2.5 py-1 font-bold text-success">
                    {money(Number(m.lowest_price))}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={tab === "owned" ? "default" : "outline"} onClick={() => setTab("owned")} className="rounded-full">
              <Layers className="h-4 w-4" /> Tenho ({owned.length})
            </Button>
            <Button variant={tab === "wanted" ? "default" : "outline"} onClick={() => setTab("wanted")} className="rounded-full">
              <Heart className="h-4 w-4" /> Quero ({wanted.length})
            </Button>
            <Button variant={tab === "alerts" ? "default" : "outline"} onClick={() => setTab("alerts")} className="rounded-full">
              <Bell className="h-4 w-4" /> Alertas ({alerts.length})
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tab !== "alerts" && (
              <>
                <Button
                  variant={groupBySet ? "default" : "outline"}
                  size="sm"
                  onClick={() => setGroupBySet((v) => !v)}
                  className="rounded-full"
                >
                  <FolderKanban className="h-3.5 w-3.5" /> Por coleção
                </Button>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={data.length === 0} className="rounded-full">
                  <Download className="h-3.5 w-3.5" /> Exportar CSV
                </Button>
              </>
            )}
            <Button
              variant={isPublic ? "default" : "outline"}
              size="sm"
              onClick={() => setShareOpen((v) => !v)}
              className="rounded-full"
            >
              <Globe className="h-3.5 w-3.5" /> {isPublic ? "Acervo público ativo" : "Compartilhar acervo"}
            </Button>
          </div>
        </div>

        {shareOpen && (
          <section className="rounded-2xl border border-border bg-card p-4 text-sm shadow-slab">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Compartilhamento público da coleção (opt-in LGPD)</h2>
                <p className="text-xs text-muted-foreground">
                  Exibe apenas suas cartas marcadas como “Tenho”, quantidades e condições. Nunca expõe seu custo de aquisição, e-mail ou lista de desejos.
                </p>
              </div>
              {isPublic && shareUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(shareUrl);
                    toast.success("Link copiado!");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar link
                </Button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">/acervo/</span>
              <input
                value={currentSlug}
                onChange={(e) => setSlugInput(e.target.value)}
                placeholder="seu-apelido"
                className="w-52 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
              />
              <Button size="sm" onClick={() => saveShareSettings(true)}>
                {isPublic ? "Atualizar link público" : "Ativar link público"}
              </Button>
              {isPublic && (
                <Button size="sm" variant="ghost" onClick={() => saveShareSettings(false)}>
                  Tornar privado
                </Button>
              )}
            </div>
          </section>
        )}

        {tab === "owned" && summary.bySet.length > 1 && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resumo por coleção</h2>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {summary.bySet.slice(0, 8).map((s) => (
                <div key={s.setName} className="rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-xs">
                  <span className="font-semibold">{s.setName}</span>{" "}
                  <span className="text-muted-foreground">({s.copies}×)</span>
                  {s.valueBrl > 0 && <span className="num ml-1.5 font-bold text-primary">{money(s.valueBrl)}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "alerts" ? (
          <section className="space-y-3">
            {alerts.length === 0 ? (
              <div className="dots rounded-3xl border border-dashed border-border py-14 text-center">
                <p className="font-display text-lg font-bold">Nenhum alerta de preço criado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Abra qualquer carta no catálogo e clique em “Alerta de preço” para ser notificado por e-mail e no site.
                </p>
                <Link to="/colecoes" className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
                  Explorar cartas
                </Link>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {alerts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-slab">
                    <Link to="/carta/$cardId" params={{ cardId: a.card_id }} className="flex min-w-0 items-center gap-3">
                      {a.cards?.image_small && (
                        <img src={a.cards.image_small} alt={a.cards.name} className="h-14 w-auto rounded" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {a.cards?.name ?? a.card_id}{" "}
                          {a.cards?.number && <span className="num text-xs text-muted-foreground">#{a.cards.number}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Avisar quando ficar {a.direction === "below" ? "abaixo de" : "acima de"}{" "}
                          <b className="num text-foreground">{money(Number(a.target_brl))}</b>
                        </p>
                        {a.last_triggered_at && (
                          <p className="text-[11px] text-success">
                            Disparado em {new Date(a.last_triggered_at).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button size="sm" variant={a.active ? "outline" : "secondary"} onClick={() => toggleAlert(a)}>
                        {a.active ? "Ativo" : "Pausado"}
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Remover alerta" onClick={() => deleteAlert(a.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="flex min-w-[220px] items-center gap-2 rounded-full border border-input bg-card px-3.5 py-2 text-sm sm:max-w-xs">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                aria-label="Buscar na coleção"
                placeholder="Filtrar na coleção…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full bg-transparent outline-none"
              />
            </div>

            {isPending ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-80 animate-pulse rounded-2xl border border-border bg-card" />
                ))}
              </div>
            ) : isError ? (
              <p className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive">
                Não foi possível carregar sua coleção.
              </p>
            ) : visible.length === 0 ? (
              <div className="dots rounded-3xl border border-dashed border-border py-14 text-center">
                <p className="font-display text-lg font-bold">Nenhuma carta por aqui ainda</p>
                <p className="mt-1 text-sm text-muted-foreground">Abra qualquer carta no catálogo e marque “Tenho” ou “Quero”.</p>
                <Link to="/colecoes" className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
                  Explorar cartas
                </Link>
              </div>
            ) : groupedVisible ? (
              <div className="space-y-6">
                {groupedVisible.map(([setName, items]) => (
                  <div key={setName} className="space-y-3">
                    <h2 className="font-display text-lg font-bold">
                      {setName} <span className="num text-xs font-normal text-muted-foreground">({items.length})</span>
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {items.map((r) => (
                        <CollectionCard key={r.id} row={r} trend={trends[r.card_id]} onRemove={remove} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {visible.map((r) => (
                  <CollectionCard key={r.id} row={r} trend={trends[r.card_id]} onRemove={remove} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </PageShell>
  );
}

function CollectionCard({
  row: r,
  trend: t,
  onRemove,
}: {
  row: RawEntry;
  trend: { last: number | null; change: number | null; currency: string; points: number[] } | undefined;
  onRemove: (id: string) => void;
}) {
  const adjPrice = conditionAdjustedPrice(t?.last ?? null, r.condition);
  const qty = r.quantity || 1;
  const pnl =
    r.kind === "owned" && adjPrice != null && r.purchase_price != null
      ? Math.round((adjPrice - Number(r.purchase_price)) * qty * 100) / 100
      : null;

  return (
    <article className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-slab">
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

      {adjPrice != null && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-2.5 py-1.5">
          <div>
            <p className="num text-xs font-bold">
              {money(adjPrice, t?.currency || "BRL")}{" "}
              {r.kind === "owned" && r.condition && (
                <span className="font-normal text-muted-foreground">({r.condition})</span>
              )}
            </p>
            {pnl != null ? (
              <p className={`num text-[11px] font-semibold ${pnl >= 0 ? "text-success" : "text-destructive"}`}>
                P&L {pnl >= 0 ? "+" : ""}
                {money(pnl)}
              </p>
            ) : (
              <Change pct={t?.change ?? null} />
            )}
          </div>
          {t && t.points.length > 1 && <Sparkline points={t.points} className="h-6 w-14" />}
        </div>
      )}

      <div className="mt-3 flex items-end justify-between gap-2 border-t border-border pt-3">
        <EntryEditor row={r} />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remover carta"
          onClick={() => onRemove(r.id)}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}

function EntryEditor({ row }: { row: RawEntry }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState(String(row.quantity || 1));
  const [cond, setCond] = useState(row.condition ?? "NM");
  const [cost, setCost] = useState(row.purchase_price == null ? "" : String(row.purchase_price));
  const [target, setTarget] = useState(row.target_price == null ? "" : String(row.target_price));

  const save = async () => {
    if (row.kind === "owned") {
      const qNum = Number(qty);
      if (!Number.isInteger(qNum) || qNum < 1) {
        toast.error("Quantidade deve ser inteiro ≥ 1");
        return;
      }
      const cNum = cost.trim() ? Number(cost.replace(",", ".")) : null;
      if (cNum != null && (!Number.isFinite(cNum) || cNum < 0)) {
        toast.error("Custo de aquisição inválido");
        return;
      }
      let res = await dbTable("collection_entries")
        .update({ quantity: qNum, condition: cond, purchase_price: cNum })
        .eq("id", row.id);
      if (res.error && /column|purchase_price|condition/i.test(res.error.message)) {
        res = await supabase.from("collection_entries").update({ quantity: qNum }).eq("id", row.id);
      }
      if (res.error) toast.error(res.error.message);
      else {
        toast.success("Carta atualizada");
        qc.invalidateQueries({ queryKey: ["collection"] });
      }
      return;
    }

    const tNum = target.trim() ? Number(target.replace(",", ".")) : null;
    if (tNum != null && (!Number.isFinite(tNum) || tNum <= 0)) {
      toast.error("Informe um preço-alvo positivo");
      return;
    }
    const { error } = await supabase.from("collection_entries").update({ target_price: tNum }).eq("id", row.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Meta salva");
      qc.invalidateQueries({ queryKey: ["collection"] });
      qc.invalidateQueries({ queryKey: ["wishlist-matches"] });
    }
  };

  if (row.kind === "wanted") {
    return (
      <div className="flex-1">
        <label className="block text-[11px] font-medium text-muted-foreground">Preço desejado (R$)</label>
        <div className="mt-1 flex gap-1.5">
          <input
            aria-label="Preço desejado"
            type="number"
            min={0.5}
            step="0.50"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="num w-24 rounded-lg border border-input bg-background px-2 py-1 text-xs"
          />
          <Button variant="outline" size="sm" onClick={save}>
            Salvar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <label className="block text-[10px] text-muted-foreground">
          Qtd
          <input
            aria-label="Quantidade"
            type="number"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="num mt-0.5 w-full rounded border border-input bg-background px-1.5 py-1 text-xs"
          />
        </label>
        <label className="block text-[10px] text-muted-foreground">
          Condição
          <select
            aria-label="Condição"
            value={cond}
            onChange={(e) => setCond(e.target.value)}
            className="mt-0.5 w-full rounded border border-input bg-background px-1 py-1 text-xs"
          >
            {Object.keys(CONDITIONS).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-end gap-1.5">
        <label className="block flex-1 text-[10px] text-muted-foreground">
          Custo pago (R$)
          <input
            aria-label="Custo pago"
            type="number"
            min={0}
            step="0.50"
            placeholder="0,00"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="num mt-0.5 w-full rounded border border-input bg-background px-1.5 py-1 text-xs"
          />
        </label>
        <Button variant="outline" size="sm" onClick={save} className="h-7 px-2.5 text-xs">
          Salvar
        </Button>
      </div>
    </div>
  );
}
