import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getTrends } from "@/lib/catalog.functions";
import { money } from "@/lib/format";
import type { TrendSummary } from "@/lib/pricing/series";
import { Change, HoloCard, Sparkline } from "./market";

type C = { id: string; name: string; number: string; rarity: string | null; image_small: string | null; card_sets?: { name: string } | null };

export function useTrendsQuery(ids: string[], initialData?: Record<string, TrendSummary>) {
  const hasInitial = Boolean(initialData && Object.keys(initialData).length > 0);
  return useQuery({
    queryKey: ["trends", ids.join(",")],
    queryFn: () => getTrends({ data: { ids } }),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    ...(hasInitial ? { initialData } : {}),
  });
}

export function useTrends(ids: string[], initialData?: Record<string, TrendSummary>) {
  return useTrendsQuery(ids, initialData).data ?? initialData ?? {};
}

/** "Slab" tile: card in a graded-case frame with label strip, holo tilt and price trend. */
export function Slab({
  to,
  image,
  title,
  sub,
  right,
  trend,
  priceLabel,
  loading = false,
}: {
  to: { cardId: string };
  image: string | null;
  title: string;
  sub: string;
  right?: React.ReactNode;
  trend?: TrendSummary | undefined;
  priceLabel?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Link
      to="/carta/$cardId"
      params={to}
      className="group block rounded-2xl border border-border bg-card p-2 shadow-slab transition duration-300 hover:-translate-y-1 hover:border-foreground/25"
    >
      <div className="flex items-center justify-between gap-2 rounded-lg bg-ink px-2.5 py-1.5 text-ink-foreground">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{title}</p>
          <p className="truncate text-[10px] opacity-60">{sub}</p>
        </div>
        {right}
      </div>
      <div className="dots mt-2 rounded-lg bg-muted p-3">
        <HoloCard src={image} alt={title} className="mx-auto w-full shadow-slab" />
      </div>
      <div className="px-1 pb-1 pt-2">
        {priceLabel ??
          (trend ? (
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Preço ref.</p>
                <p className="num text-sm font-bold">{money(trend.last, trend.currency)}</p>
              </div>
              <Change pct={trend.change} />
            </div>
          ) : loading ? (
            <div className="space-y-1.5 py-0.5">
              <div className="h-3 w-14 animate-pulse rounded bg-muted" />
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Ver detalhes</span>
              <span className="transition group-hover:translate-x-0.5 group-hover:text-primary">→</span>
            </div>
          ))}
        {trend && <Sparkline points={trend.points} className="mt-1 h-7 w-full" />}
      </div>
    </Link>
  );
}

export function CardGrid({
  cards,
  setName,
  initialTrends,
  columns = "default",
}: {
  cards: C[];
  setName?: string | undefined;
  initialTrends?: Record<string, TrendSummary> | undefined;
  columns?: "default" | "sidebar";
}) {
  const trendIds = cards.slice(0, 40).map((c) => c.id);
  const trendsQuery = useTrendsQuery(trendIds, initialTrends);
  const trends = trendsQuery.data ?? initialTrends ?? {};
  const isLoading = trendsQuery.isPending && !Object.keys(trends).length;
  const gridCls =
    columns === "sidebar"
      ? "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5"
      : "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6";
  return (
    <div className={gridCls}>
      {cards.map((c, idx) => (
        <Slab
          key={c.id}
          to={{ cardId: c.id }}
          image={c.image_small}
          title={c.name}
          trend={trends[c.id]}
          loading={isLoading && idx < 40}
          sub={`${setName ?? c.card_sets?.name ?? ""} · ${c.rarity ?? "Pokémon TCG"}`}
          right={<span className="num shrink-0 text-[11px] opacity-80">#{c.number}</span>}
        />
      ))}
    </div>
  );
}

export function DemoBadge({ label = "Referência pública" }: { label?: string }) {
  return (
    <span className="rounded-full border border-dashed border-chart-5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-chart-5">
      {label}
    </span>
  );
}
