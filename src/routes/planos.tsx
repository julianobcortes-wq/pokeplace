import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Sparkles } from "lucide-react";
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
  {
    name: "Free",
    tag: "Para qualquer colecionador",
    price: "Grátis",
    active: true,
    items: [
      "Busca e catálogo completo",
      "Comprar de lojas aprovadas",
      "Histórico de 7D, 30D e 3M (TCGplayer & Cardmarket)",
      "Comparação de ofertas por condição e idioma",
      "Minha coleção e lista de desejos",
    ],
  },
  {
    name: "Collector Pro",
    tag: "Para colecionadores",
    price: "Em breve",
    featured: true,
    items: [
      "Tudo do plano Free",
      "Histórico estendido (6M, 1A e Tudo)",
      "Alertas de preço por e-mail quando atingir sua meta",
      "Comparação avançada entre mercados e acabamentos",
      "Relatórios de evolução do portfólio",
    ],
  },
  {
    name: "Seller Pro",
    tag: "Para lojas aprovadas",
    price: "Em breve",
    items: [
      "Inteligência competitiva de preços",
      "Monitoramento de piso e liquidez por carta",
      "Sugestões automáticas de precificação",
      "Relatórios de margem, comissão e giro",
      "Exportação de inventário e relatórios",
    ],
  },
];

function Plans() {
  return (
    <PageShell>
      <section className="grain relative overflow-hidden bg-ink-glow text-ink-foreground">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-holo opacity-15 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-10 md:py-14">
          <p className="num text-[11px] uppercase tracking-[0.2em] text-holo">Inteligência de mercado</p>
          <h1 className="mt-2 text-4xl font-extrabold md:text-5xl">Planos {BRAND.name}</h1>
          <p className="mt-3 max-w-2xl text-sm opacity-75 md:text-base">
            Comprar e vender nunca exige assinatura. Os planos Pro destravarão histórico estendido e automações avançadas na próxima fase.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-5 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`flex flex-col rounded-3xl border bg-card p-6 shadow-slab ${
                p.featured ? "border-primary ring-2 ring-primary/20" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="num text-[11px] uppercase tracking-wider text-muted-foreground">{p.tag}</p>
                {p.featured && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                    <Sparkles className="h-3 w-3" /> Destaque
                  </span>
                )}
              </div>
              <h2 className="mt-2 font-display text-2xl font-extrabold">{p.name}</h2>
              <p className="num mt-1 text-lg font-bold text-primary">{p.price}</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {p.items.map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
              {p.active ? (
                <Link
                  to="/colecoes"
                  className="mt-6 block rounded-full bg-ink py-2.5 text-center text-sm font-semibold text-ink-foreground transition hover:opacity-90"
                >
                  Usar agora grátis
                </Link>
              ) : (
                <Button disabled variant="secondary" className="mt-6 w-full rounded-full opacity-75">
                  Disponível em breve
                </Button>
              )}
            </div>
          ))}
        </div>
      </main>
    </PageShell>
  );
}
