import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getTrends } from "@/lib/catalog.functions";
import { money } from "@/lib/format";
import { Change, HoloCard, Sparkline } from "./market";

type C = { id: string; name: string; number: string; rarity: string | null; image_small: string | null; card_sets?: { name: string } | null };
type Trend = { points: number[]; last: number; change: number | null; demo: boolean };

export function useTrends(ids: string[]) {
  return useQuery({ queryKey: ["trends", ids.join(",")], queryFn: () => getTrends({ data: { ids } }), enabled: ids.length > 0, staleTime: 5 * 60_000 }).data ?? {};
}

/** "Slab" tile: card in a graded-case frame with label strip, holo tilt and price trend. */
export function Slab({ to, image, title, sub, right, trend, priceLabel }: { to: { cardId: string }; image: string | null; title: string; sub: string; right?: React.ReactNode; trend?: Trend | undefined; priceLabel?: React.ReactNode }) {
  return (
    <Link to="/carta/$cardId" params={to} className="group block rounded-2xl border border-border bg-card p-2 shadow-slab transition duration-300 hover:-translate-y-1 hover:border-foreground/25">
      <div className="flex items-center justify-between gap-2 rounded-lg bg-ink px-2.5 py-1.5 text-ink-foreground">
        <div className="min-w-0"><p className="truncate text-xs font-semibold">{title}</p><p className="truncate text-[10px] opacity-60">{sub}</p></div>
        {right}
      </div>
      <div className="dots mt-2 rounded-lg bg-muted p-3">
        <HoloCard src={image} alt={title} className="mx-auto w-full shadow-slab" />
      </div>
      <div className="px-1 pb-1 pt-2">
        {priceLabel ?? (trend ? (
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Preço ref.</p>
              <p className="num text-sm font-bold">{money(trend.last)}</p>
            </div>
            <Change pct={trend.change} />
          </div>
        ) : <p className="text-xs text-muted-foreground">Sem preço ainda</p>)}
        {trend && <Sparkline points={trend.points} className="mt-1 h-7 w-full" />}
      </div>
    </Link>
  );
}

export function CardGrid({ cards, setName }: { cards: C[]; setName?: string | undefined }) {
  const trends = useTrends(cards.slice(0, 120).map((c) => c.id));
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
      {cards.map((c) => (
        <Slab key={c.id} to={{ cardId: c.id }} image={c.image_small} title={c.name} trend={trends[c.id]}
          sub={`${setName ?? c.card_sets?.name ?? ""} · ${c.rarity ?? "—"}`}
          right={<span className="num shrink-0 text-[11px] opacity-80">#{c.number}</span>} />
      ))}
    </div>
  );
}

export function DemoBadge() {
  return <span className="rounded-full border border-dashed border-chart-5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-chart-5">Dados demonstrativos</span>;
}
