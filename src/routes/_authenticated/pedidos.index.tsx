import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { BRAND, ORDER_STATUS, money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pedidos/")({
  head: () => ({ meta: [{ title: `Meus pedidos | ${BRAND.name}` }, { name: "description", content: "Acompanhe seus pedidos." }, { property: "og:title", content: "Meus pedidos" }, { property: "og:description", content: "Acompanhe seus pedidos." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Orders,
});

function Orders() {
  const { data = [] } = useQuery({
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
        <h1 className="text-2xl font-semibold">Meus pedidos</h1>
        <div className="mt-4 divide-y divide-border rounded-md bg-card shadow-sm">
          {data.length === 0 && <p className="p-6 text-muted-foreground">Você ainda não fez pedidos.</p>}
          {data.map((o) => (
            <Link key={o.id} to="/pedidos/$orderId" params={{ orderId: o.id }} className="flex items-center justify-between p-4 hover:bg-muted">
              <div><p className="font-mono text-xs">#{o.id.slice(0, 8)}</p><p className="text-sm text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</p></div>
              <span className="text-sm">{ORDER_STATUS[o.status]}</span>
              <span className="font-semibold">{money(Number(o.subtotal))}</span>
            </Link>
          ))}
        </div>
      </main>
    </PageShell>
  );
}
