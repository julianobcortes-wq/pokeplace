import { DisputeThread, OpenDispute, OrderBuyerActions, OrderChat } from "@/components/ops";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { PageShell } from "@/components/SiteHeader";
import { SupportInbox } from "@/components/SupportInbox";
import { ReviewForm } from "@/components/seller-tools";
import { SellerLine } from "@/components/market";
import { supabase } from "@/integrations/supabase/client";
import { BRAND, ORDER_STATUS, money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pedidos/$orderId")({
  head: () => ({ meta: [{ title: `Pedido | ${BRAND.name}` }, { name: "description", content: "Detalhes do pedido." }, { property: "og:title", content: "Pedido" }, { property: "og:description", content: "Detalhes do pedido." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: OrderPage,
});

const ITEM_STATUS: Record<string, string> = { pending: "Aguardando envio", shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado" };

function OrderPage() {
  const qc = useQueryClient();
  const confirm = async (id: string) => { const { error } = await supabase.rpc("confirm_item_received", { _item_id: id }); if (error) toast.error(error.message); else { toast.success("Recebimento confirmado"); await qc.invalidateQueries({ queryKey: ["order"] }); } };
  const { orderId } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const [{ data: order }, { data: items }, { data: pay }] = await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId).maybeSingle(),
        supabase.from("order_items").select("*, cards(name, number, image_small)").eq("order_id", orderId),
        supabase.from("payments").select("*").eq("order_id", orderId),
      ]);
      const [{ data: disputes }, { data: ships }, { data: u }] = await Promise.all([supabase.from("disputes").select("*").eq("order_id", orderId), supabase.from("order_shipments").select("*").eq("order_id", orderId), supabase.auth.getUser()]);
      const ids = [...new Set((items ?? []).map((i) => i.seller_id))];
      const { data: stores } = ids.length ? await supabase.rpc("list_public_sellers", { _limit: 500 }) : { data: [] };
      return { me: u.user?.id ?? "", disputes: disputes ?? [], ships: ships ?? [], order, items: items ?? [], pay: pay ?? [], stores: (stores ?? []).filter((s) => ids.includes(s.id)) };
    },
  });
  if (!data) return <PageShell><p className="p-8">Carregando…</p></PageShell>;
  if (!data.order) return <PageShell><p className="p-8">Pedido não encontrado.</p></PageShell>;
  const o = data.order;
  const realPaid = data.pay.some(p => p.environment === "live" && ["paid", "succeeded", "completed"].includes(p.status));
  return (
    <PageShell>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-md bg-card p-6 shadow-sm">
          <p className="flex items-center gap-2 text-success"><CheckCircle2 className="h-5 w-5" /> Pedido recebido</p>
          <h1 className="mt-1 text-2xl font-semibold">Pedido #{o.id.slice(0, 8)}</h1>
          <p className="text-sm text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")} · {ORDER_STATUS[o.status]}</p>
          <div className="mt-4 divide-y divide-border">
            {data.items.map((i) => (
              <div key={i.id} className="flex items-center gap-3 py-3">
                {i.cards?.image_small && <img src={i.cards.image_small} alt="" className="h-14 w-auto" />}
                <div className="flex-1"><p>{i.cards?.name} #{i.cards?.number}</p><p className="text-xs text-muted-foreground">{i.quantity} × {money(Number(i.unit_price))} · {ITEM_STATUS[i.status]}</p>{i.tracking_code && <p className="mt-1 break-words text-xs">{i.shipping_carrier} · Rastreio: <b>{i.tracking_code}</b></p>}</div>
                <p>{money(Number(i.unit_price) * i.quantity)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-lg"><span>Total</span><span className="font-semibold">{money(Number(o.subtotal) + Number(o.shipping_total ?? 0))}</span></div>
          {Number(o.shipping_total) > 0 && <p className="text-right text-xs text-muted-foreground">inclui frete de {money(Number(o.shipping_total))}</p>}
          {o.buyer_id === data.me && <OrderBuyerActions order={o} items={data.items} sandbox={data.pay.some((p) => p.environment === "sandbox")} />}
          {[...new Set(data.items.map((i) => i.seller_id))].map((sid) => {
            const its = data.items.filter((i) => i.seller_id === sid);
            const st = data.stores.find((x) => x.id === sid);
            return (
              <div key={sid} className="mt-4 space-y-3 rounded-2xl border border-border p-4">
                {st && <SellerLine s={st} />}
                {data.ships.find((s) => s.seller_id === sid) && <p className="text-xs text-muted-foreground">Frete desta loja: {money(Number(data.ships.find((s) => s.seller_id === sid)!.amount))}</p>}
                {its.map((i) => { const d = data.disputes.find((x) => x.order_item_id === i.id); return d ? <DisputeThread key={i.id} dispute={d} role={o.buyer_id === data.me ? "buyer" : "seller"} /> : (o.buyer_id === data.me && ["paid", "shipped", "delivered"].includes(o.status) && i.status !== "cancelled" && <OpenDispute key={i.id} itemId={i.id} name={i.cards?.name ?? "o item"} />); })}
                {o.status !== "cancelled" && <OrderChat orderId={o.id} sellerId={sid} mine={o.buyer_id === data.me ? "buyer" : "seller"} />}
                {its.filter(i => i.status === "shipped").map(i => <Button key={i.id} variant="outline" onClick={() => confirm(i.id)}>Confirmar recebimento de {i.cards?.name}</Button>)}
                {!realPaid && <p className="text-xs text-muted-foreground">Pedido de teste ou sem pagamento confirmado: não gera avaliação nem reputação.</p>}
                {realPaid && its.some((i) => i.status === "delivered") && <ReviewForm orderId={o.id} sellerId={sid} storeName={st?.store_name ?? "a loja"} />}
              </div>
            );
          })}
          {data.pay.map((p) => (
            <p key={p.id} className="mt-3 rounded bg-muted p-3 text-xs text-muted-foreground">
              Pagamento: {p.environment === "sandbox" ? "ambiente de teste (nenhum valor cobrado)" : p.provider} · status {p.status}
            </p>
          ))}
          <SupportInbox orderId={o.id} />
          <Link to="/pedidos" className="mt-4 inline-block text-sm text-primary">Ver todos os pedidos</Link>
        </div>
      </main>
    </PageShell>
  );
}
