import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { OffersInbox } from "@/components/OffersInbox";
import { PageShell } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BRAND, ORDER_STATUS, money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pedidos/")({
  head: () => ({
    meta: [
      { title: `Meus pedidos | ${BRAND.name}` },
      { name: "description", content: "Acompanhe seus pedidos." },
      { property: "og:title", content: "Meus pedidos" },
      { property: "og:description", content: "Acompanhe seus pedidos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Orders,
});

const STATUS_STYLE: Record<string, string> = {
  awaiting_payment: "bg-chart-4/15 text-foreground",
  paid: "bg-success/15 text-success",
  shipped: "bg-secondary/15 text-secondary",
  delivered: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
  disputed: "bg-destructive/15 text-destructive",
};

function Orders() {
  const { user } = useAuth();
  const { data = [], isPending } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Entre para consultar seus pedidos");
      const { data } = await supabase.from("orders").select("*").eq("buyer_id", u.user.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <PageShell>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p className="num text-[11px] uppercase tracking-[0.2em] text-primary">Compras</p>
        <h1 className="mt-1 text-3xl font-extrabold">Meus pedidos</h1>

        {isPending ? (
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-20 animate-pulse rounded-2xl border border-border bg-card" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="dots mt-6 rounded-3xl border border-dashed border-border p-12 text-center">
            <Package className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-display text-lg font-bold">Você ainda não fez pedidos</p>
            <p className="mt-1 text-sm text-muted-foreground">Quando comprar de uma loja aprovada, todos os envios e rastreios aparecem aqui.</p>
            <Link to="/colecoes" className="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
              Explorar coleções
            </Link>
          </div>
        ) : (
          <div className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-slab">
            {data.map((o) => {
              const total = Number(o.subtotal) + Number(o.shipping_total ?? 0);
              return (
                <Link
                  key={o.id}
                  to="/pedidos/$orderId"
                  params={{ orderId: o.id }}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-muted/60"
                >
                  <div>
                    <p className="num text-xs font-bold">Pedido #{o.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[o.status] ?? "bg-muted text-muted-foreground"}`}>
                    {ORDER_STATUS[o.status] ?? o.status}
                  </span>
                  <div className="text-right">
                    <p className="num font-bold">{money(total)}</p>
                    {Number(o.shipping_total ?? 0) > 0 && (
                      <p className="text-[11px] text-muted-foreground">inclui frete {money(Number(o.shipping_total))}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {user && (
          <div className="mt-8">
            <OffersInbox mode="buyer" userId={user.id} />
          </div>
        )}
      </main>
    </PageShell>
  );
}
