import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Package, Percent, Receipt, TrendingUp } from "lucide-react";
import { money } from "@/lib/format";
import {
  computeSellerAnalytics,
  type AnalyticsPeriod,
  type SellerInventoryItem,
  type SellerSaleItem,
} from "@/lib/marketplace/analytics";

const PERIODS: Array<{ id: AnalyticsPeriod; label: string }> = [
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
  { id: "all", label: "Tudo" },
];

export function SellerAnalytics({
  sales,
  inventory,
}: {
  sales: SellerSaleItem[];
  inventory: SellerInventoryItem[];
}) {
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");

  const stats = useMemo(
    () => computeSellerAnalytics({ items: sales, inventory, period }),
    [sales, inventory, period],
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-slab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <BarChart3 className="h-5 w-5 text-primary" /> Analytics da loja
          </h2>
          <p className="text-xs text-muted-foreground">
            Desempenho de vendas reais, margens líquidas, giro e valor do estoque ativo.
          </p>
        </div>
        <div className="flex rounded-full bg-muted p-1 text-xs">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                period === p.id
                  ? "bg-ink text-ink-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          label="Receita bruta"
          value={money(stats.grossRevenue)}
          sub={`${stats.ordersCount} pedidos · ${stats.unitsSold} un.`}
        />
        <KpiCard
          icon={<Receipt className="h-4 w-4 text-success" />}
          label="Receita líquida"
          value={money(stats.netRevenue)}
          sub={`Comissões: ${money(stats.totalCommission)}`}
          highlight
        />
        <KpiCard
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
          label="Ticket médio"
          value={money(stats.averageTicket)}
          sub="por pedido real"
        />
        <KpiCard
          icon={<Package className="h-4 w-4 text-muted-foreground" />}
          label="Estoque ativo"
          value={money(stats.inventoryValueBrl)}
          sub={`${stats.activeListingsCount} anúncios · ${stats.totalInventoryUnits} un.`}
        />
        <KpiCard
          icon={<Percent className="h-4 w-4 text-holo" />}
          label="Giro (sell-through)"
          value={`${stats.sellThroughPct.toFixed(1)}%`}
          sub="vendido vs estoque"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-muted/30 p-4 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Evolução de receita ({PERIODS.find((p) => p.id === period)?.label})
          </p>
          {stats.dailySeries.length === 0 ? (
            <p className="mt-8 text-center text-xs text-muted-foreground">
              Sem vendas reais registradas neste período ainda.
            </p>
          ) : (
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.dailySeries}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                  <XAxis
                    dataKey="date"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(d: string) => d.slice(5).split("-").reverse().join("/")}
                  />
                  <YAxis
                    fontSize={11}
                    width={64}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `R$${v}`}
                  />
                  <Tooltip
                    formatter={(v) => [money(Number(v)), "Receita líquida"]}
                    labelFormatter={(d) => `Dia ${String(d).split("-").reverse().join("/")}`}
                  />
                  <Bar dataKey="net" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cartas mais vendidas
          </p>
          {stats.topCards.length === 0 ? (
            <p className="mt-8 text-center text-xs text-muted-foreground">
              Sem itens vendidos no período.
            </p>
          ) : (
            <ol className="mt-3 space-y-2.5 text-xs">
              {stats.topCards.map((c, idx) => (
                <li
                  key={c.cardId}
                  className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      <span className="num mr-1.5 text-muted-foreground">#{idx + 1}</span>
                      {c.cardName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{c.unitsSold} un. vendidas</p>
                  </div>
                  <span className="num shrink-0 font-bold">{money(c.grossRevenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon} {label}
      </p>
      <p className={`num mt-1 text-xl font-bold ${highlight ? "text-success" : ""}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
