import { DisputeThread, OpenDispute, OrderBuyerActions, OrderChat } from "@/components/ops";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { PageShell } from "@/components/SiteHeader";
import { SupportInbox } from "@/components/SupportInbox";
import { ReviewForm } from "@/components/seller-tools";
import { SellerLine } from "@/components/market";
import { supabase } from "@/integrations/supabase/client";
import { isSupabaseConfigured } from "@/lib/runtime-config";
import { DEMO_USER, isDemoMode } from "@/lib/demo-mode";
import { DEMO_STORES, loadDemoOrders } from "@/lib/demo-data";
import { BRAND, ORDER_STATUS, money } from "@/lib/format";
import { getCarrierTrackingUrl } from "@/lib/marketplace/shipping";

type OrderSearch = { status?: string | undefined; collection_status?: string | undefined };

export const Route = createFileRoute("/_authenticated/pedidos/$orderId")({
  validateSearch: (s: Record<string, unknown>): OrderSearch => ({
    status: typeof s["status"] === "string" ? s["status"] : undefined,
    collection_status: typeof s["collection_status"] === "string" ? s["collection_status"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: `Pedido | ${BRAND.name}` },
      { name: "description", content: "Detalhes do pedido." },
      { property: "og:title", content: "Pedido" },
      { property: "og:description", content: "Detalhes do pedido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderPage,
});

const ITEM_STATUS: Record<string, string> = { pending: "Aguardando envio", shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado" };
const STEPS = ["Criado", "Pago", "Enviado", "Entregue"] as const;

function stepIndex(status: string): number {
  if (status === "delivered") return 3;
  if (status === "shipped") return 2;
  if (status === "paid") return 1;
  return 0;
}

function OrderPage() {
  const qc = useQueryClient();
  const { orderId } = Route.useParams();
  const search = Route.useSearch();
  const returnStatus = search.collection_status ?? search.status;
  const demo = isDemoMode() && !isSupabaseConfigured();

  const confirm = async (id: string) => {
    if (demo) {
      toast.success("Recebimento confirmado (modo demonstração)");
      return;
    }
    const { error } = await supabase.rpc("confirm_item_received", { _item_id: id });
    if (error) toast.error(error.message);
    else {
      toast.success("Recebimento confirmado");
      await qc.invalidateQueries({ queryKey: ["order", orderId] });
    }
  };

  const { data } = useQuery({
    queryKey: ["order", orderId, demo],
    queryFn: async () => {
      if (demo) {
        const found = loadDemoOrders().find((o) => o.id === orderId) ?? null;
        if (!found) {
          return {
            me: DEMO_USER.id,
            disputes: [],
            ships: [],
            order: null,
            items: [],
            pay: [],
            stores: [],
          };
        }
        const items = found.items.map((it, idx) => ({
          id: `${found.id}-item-${idx}`,
          order_id: found.id,
          seller_id: DEMO_STORES.find((s) => s.store_name === it.storeName)?.id ?? DEMO_STORES[0]!.id,
          quantity: it.qty,
          unit_price: it.price,
          status: "pending",
          delivered_at: null,
          tracking_code: null,
          shipping_carrier: null,
          cards: { name: it.cardName, number: "", image_small: it.image },
        }));
        const sellerIds = [...new Set(items.map((i) => i.seller_id))];
        return {
          me: DEMO_USER.id,
          disputes: [],
          ships: [],
          order: {
            id: found.id,
            buyer_id: DEMO_USER.id,
            status: found.status,
            subtotal: found.subtotal,
            shipping_total: found.shipping_total,
            discount_total: found.discount_total,
            created_at: found.created_at,
            expires_at: null,
          },
          items,
          pay: [
            {
              id: `${found.id}-pay`,
              environment: "sandbox",
              provider: "demo",
              status: "simulated",
            },
          ],
          stores: DEMO_STORES.filter((s) => sellerIds.includes(s.id)),
        };
      }
      const [{ data: order }, { data: items }, { data: pay }] = await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId).maybeSingle(),
        supabase.from("order_items").select("*, cards(name, number, image_small)").eq("order_id", orderId),
        supabase.from("payments").select("*").eq("order_id", orderId),
      ]);
      const [{ data: disputes }, { data: ships }, { data: u }] = await Promise.all([
        supabase.from("disputes").select("*").eq("order_id", orderId),
        supabase.from("order_shipments").select("*").eq("order_id", orderId),
        supabase.auth.getUser(),
      ]);
      const ids = [...new Set((items ?? []).map((i) => i.seller_id))];
      const { data: stores } = ids.length ? await supabase.rpc("list_public_sellers", { _limit: 500 }) : { data: [] };
      return {
        me: u.user?.id ?? "",
        disputes: disputes ?? [],
        ships: ships ?? [],
        order,
        items: items ?? [],
        pay: pay ?? [],
        stores: (stores ?? []).filter((s) => ids.includes(s.id)),
      };
    },
  });

  // When returning from Mercado Pago with approved/pending while webhook is still processing, poll briefly.
  useEffect(() => {
    if (!data?.order) return;
    if (data.order.status !== "awaiting_payment") return;
    if (returnStatus !== "approved" && returnStatus !== "pending") return;
    const t = setInterval(() => {
      void qc.invalidateQueries({ queryKey: ["order", orderId] });
    }, 3500);
    return () => clearInterval(t);
  }, [data?.order, orderId, qc, returnStatus]);

  if (!data)
    return (
      <PageShell>
        <p className="p-8 text-muted-foreground">Carregando…</p>
      </PageShell>
    );
  if (!data.order)
    return (
      <PageShell>
        <p className="p-8 text-muted-foreground">Pedido não encontrado.</p>
      </PageShell>
    );

  const o = data.order;
  const realPaid = data.pay.some((p) => p.environment === "live" && ["paid", "succeeded", "completed"].includes(p.status));
  const currentStep = stepIndex(o.status);

  return (
    <PageShell>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-slab md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-success">
                <CheckCircle2 className="h-4 w-4" /> {ORDER_STATUS[o.status] ?? o.status}
              </p>
              <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Pedido #{o.id.slice(0, 8)}</h1>
              <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</p>
            </div>
            <Link to="/pedidos" className="text-xs font-semibold text-primary hover:underline">
              ← Todos os pedidos
            </Link>
          </div>

          {returnStatus === "approved" && o.status === "awaiting_payment" && (
            <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-success/30 bg-success/10 p-3.5 text-sm text-success">
              <Clock className="h-4 w-4 shrink-0" />
              Pagamento aprovado no Mercado Pago! Aguardando confirmação final do webhook (atualizando automaticamente)…
            </div>
          )}
          {returnStatus === "pending" && o.status === "awaiting_payment" && (
            <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-chart-4/30 bg-chart-4/10 p-3.5 text-sm">
              <Clock className="h-4 w-4 shrink-0" />
              Pagamento pendente de compensação (Pix/boleto). Assim que compensar, o pedido muda para Pago automaticamente.
            </div>
          )}
          {(returnStatus === "failure" || returnStatus === "rejected") && o.status === "awaiting_payment" && (
            <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              O pagamento não foi concluído no Mercado Pago. Você pode tentar novamente abaixo enquanto a reserva estiver ativa.
            </div>
          )}

          {o.status !== "cancelled" && (
            <ol className="mt-6 grid grid-cols-4 gap-2">
              {STEPS.map((label, idx) => {
                const done = idx <= currentStep;
                return (
                  <li key={label} className="space-y-1.5">
                    <div className={`h-1.5 rounded-full transition ${done ? "bg-success" : "bg-muted"}`} />
                    <p className={`text-[11px] font-semibold ${done ? "text-foreground" : "text-muted-foreground"}`}>{label}</p>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-6 divide-y divide-border border-t border-border">
            {data.items.map((i) => (
              <div key={i.id} className="flex items-center gap-3 py-3.5">
                {i.cards?.image_small && <img src={i.cards.image_small} alt="" className="h-16 w-auto rounded-md shadow-slab" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {i.cards?.name} #{i.cards?.number}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {i.quantity} × {money(Number(i.unit_price))} · {ITEM_STATUS[i.status] ?? i.status}
                  </p>
                  {i.tracking_code && (() => {
                    const trackUrl = getCarrierTrackingUrl(i.shipping_carrier, i.tracking_code);
                    return (
                      <p className="mt-1 break-words text-xs">
                        {i.shipping_carrier} · Rastreio:{" "}
                        {trackUrl ? (
                          <a href={trackUrl} target="_blank" rel="noopener noreferrer" className="num font-semibold text-primary hover:underline">
                            {i.tracking_code} ↗
                          </a>
                        ) : (
                          <b className="num">{i.tracking_code}</b>
                        )}
                      </p>
                    );
                  })()}
                </div>
                <p className="num font-semibold">{money(Number(i.unit_price) * i.quantity)}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-between border-t border-border pt-3 text-lg">
            <span>Total</span>
            <span className="num font-bold">
              {money(Math.max(0, Number(o.subtotal) + Number(o.shipping_total ?? 0) - Number((o as unknown as { discount_total?: number }).discount_total ?? 0)))}
            </span>
          </div>
          {Number((o as unknown as { discount_total?: number }).discount_total ?? 0) > 0 && (
            <p className="text-right text-xs text-success">
              Desconto aplicado: −{money(Number((o as unknown as { discount_total?: number }).discount_total ?? 0))}
            </p>
          )}
          {Number(o.shipping_total) > 0 && (
            <p className="text-right text-xs text-muted-foreground">inclui frete de {money(Number(o.shipping_total))}</p>
          )}

          {o.buyer_id === data.me && !demo && (
            <OrderBuyerActions order={o} items={data.items} sandbox={data.pay.some((p) => p.environment === "sandbox")} />
          )}
          {demo && (
            <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs text-foreground">
              <b>Pedido simulado (modo demonstração).</b> Salvo apenas no seu navegador para você testar o fluxo completo de compra. Nenhuma cobrança foi realizada.
            </div>
          )}

          {[...new Set(data.items.map((i) => i.seller_id))].map((sid) => {
            const its = data.items.filter((i) => i.seller_id === sid);
            const st = data.stores.find((x) => x.id === sid);
            return (
              <div key={sid} className="mt-5 space-y-3 rounded-2xl border border-border p-4">
                {st && <SellerLine s={st} />}
                {data.ships.find((s) => s.seller_id === sid) && (
                  <p className="text-xs text-muted-foreground">
                    Frete desta loja: {money(Number(data.ships.find((s) => s.seller_id === sid)!.amount))}
                  </p>
                )}
                {its.map((i) => {
                  const d = data.disputes.find((x) => x.order_item_id === i.id);
                  return d ? (
                    <DisputeThread key={i.id} dispute={d} role={o.buyer_id === data.me ? "buyer" : "seller"} />
                  ) : (
                    o.buyer_id === data.me &&
                    ["paid", "shipped", "delivered"].includes(o.status) &&
                    i.status !== "cancelled" && <OpenDispute key={i.id} itemId={i.id} name={i.cards?.name ?? "o item"} />
                  );
                })}
                {o.status !== "cancelled" && !demo && <OrderChat orderId={o.id} sellerId={sid} mine={o.buyer_id === data.me ? "buyer" : "seller"} />}
                {its
                  .filter((i) => i.status === "shipped")
                  .map((i) => (
                    <Button key={i.id} variant="outline" onClick={() => confirm(i.id)}>
                      Confirmar recebimento de {i.cards?.name}
                    </Button>
                  ))}
                {!realPaid && (
                  <p className="text-xs text-muted-foreground">
                    Avaliação e reputação da loja são liberadas após pagamento confirmado e entrega.
                  </p>
                )}
                {realPaid && its.some((i) => i.status === "delivered") && (
                  <ReviewForm orderId={o.id} sellerId={sid} storeName={st?.store_name ?? "a loja"} />
                )}
              </div>
            );
          })}

          {data.pay.map((p) => (
            <p key={p.id} className="mt-3 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              Pagamento: {p.environment === "sandbox" ? "ambiente de teste (nenhum valor cobrado)" : p.provider} · status {p.status}
            </p>
          ))}
          <SupportInbox orderId={o.id} />
        </div>
      </main>
    </PageShell>
  );
}
