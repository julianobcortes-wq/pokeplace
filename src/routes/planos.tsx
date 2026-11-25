import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/SiteHeader";
import { BRAND } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/planos")({
  head: () => ({
    meta: [
      { title: `Planos Premium — Collector Pro e Seller Pro | ${BRAND.name}` },
      { name: "description", content: "Histórico completo de preços, alertas avançados e ferramentas para vendedores." },
      { property: "og:title", content: `Planos | ${BRAND.name}` },
      { property: "og:description", content: "Compare os planos Free, Collector Pro e Seller Pro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Plans,
});

const PLANS = [
  { name: "Free", tag: "Para qualquer colecionador", items: ["Busca e catálogo completo", "Comprar de lojas aprovadas", "Histórico dos últimos 3 meses", "Comparação de ofertas", "Coleção e watchlist básicas"] },
  { name: "Collector Pro", tag: "Para colecionadores", items: ["Tudo do Free", "Histórico completo disponível", "Comparação entre mercados", "Alertas avançados", "Rankings completos", "Relatórios da coleção"] },
  { name: "Seller Pro", tag: "Para lojas aprovadas", items: ["Inteligência competitiva de preços", "Monitoramento de concorrentes", "Sugestões de precificação", "Relatórios de margem e faturamento", "Exportação de relatórios"] },
];

function Plans() {
  return (
    <PageShell>
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Planos</h1>
        <p className="mt-2 text-muted-foreground">Comprar e vender não exige assinatura. Planos pagos ainda não estão disponíveis; ferramentas avançadas abaixo são previstas, não contratáveis nesta versão.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <div key={p.name} className={`rounded-md bg-card p-6 shadow-sm ${i === 1 ? "ring-2 ring-primary" : ""}`}>
              <p className="text-xs uppercase text-muted-foreground">{p.tag}</p>
              <h2 className="mt-1 text-2xl font-semibold">{p.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{i === 0 ? "Grátis" : "Valores em breve"}</p>
              <ul className="mt-4 space-y-2 text-sm">{p.items.map((x) => <li key={x}>✓ {x}</li>)}</ul>
              {i > 0 && <Button disabled className="mt-6 w-full rounded-md bg-secondary py-2.5 text-sm font-semibold text-secondary-foreground opacity-70">Em breve</Button>}
            </div>
          ))}
        </div>
      </main>
    </PageShell>
  );
}
