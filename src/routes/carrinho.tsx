import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SellerLine } from "@/components/market";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/SiteHeader";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BRAND, money } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/carrinho")({
  head: () => ({
    meta: [
      { title: `Carrinho | ${BRAND.name}` },
      { name: "description", content: "Revise suas cartas, separadas por loja, e finalize o pedido." },
      { property: "og:title", content: `Carrinho | ${BRAND.name}` },
      { property: "og:description", content: "Seu carrinho de cartas Pokémon." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { items, setQty, remove, clear } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [ship, setShip] = useState({ name: "", address: "", city: "", state: "", zip: "" });
  const [busy, setBusy] = useState(false);
  const { data: sellers = [] } = useQuery({ queryKey: ["cart-sellers", items.map(i => i.listingId)], enabled: items.length > 0,
    queryFn: async () => { const { data, error } = await supabase.rpc("get_listing_sellers", { _ids: items.map(i => i.listingId) }); if (error) throw error; return data ?? []; },
  });
  const bySeller = items.reduce<Record<string, typeof items>>((a, i) => ((a[sellers.find(s => s.listing_id === i.listingId)?.seller_id ?? i.storeName] ??= []).push(i), a), {});
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const sellerIds = [...new Set(sellers.map((s) => s.seller_id).filter(Boolean))] as string[];
  const { data: profiles = [] } = useQuery({ queryKey: ["ship-profiles", sellerIds], enabled: sellerIds.length > 0, queryFn: async () => (await supabase.from("shipping_profiles").select("*").in("seller_id", sellerIds)).data ?? [] });
  const shipFor = (sid: string, sub: number) => { const p = profiles.find((x) => x.seller_id === sid); if (!p) return 0; return p.free_over && sub >= Number(p.free_over) ? 0 : Number(p.flat_fee); };
  const shipping = Object.entries(bySeller).reduce((s, [sid, list]) => s + shipFor(sid, list.reduce((a, i) => a + i.price * i.qty, 0)), 0);

  const checkout = async () => {
    if (!user) return nav({ to: "/auth", search: { next: "/carrinho" } });
    setBusy(true);
    const { data, error } = await supabase.rpc("place_order", {
      _items: items.map((i) => ({ listing_id: i.listingId, quantity: i.qty })),
      _ship: ship,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    clear();
    nav({ to: "/pedidos/$orderId", params: { orderId: data as string } });
  };
  const f = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";

  return (
    <PageShell>
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[1fr_360px]">
        <div>
          <h1 className="text-2xl font-semibold">Carrinho</h1>
          {items.length === 0 && <p className="mt-4 rounded-md bg-card p-8 text-muted-foreground">Seu carrinho está vazio. <Link to="/colecoes" className="text-primary underline">Explorar cartas</Link></p>}
          {Object.entries(bySeller).map(([seller, list]) => (
            <div key={seller} className="mt-4 rounded-md bg-card shadow-sm">
              <div className="border-b border-border px-4 py-3">{sellers.find(s => s.listing_id === list[0]?.listingId) ? <SellerLine s={sellers.find(s => s.listing_id === list[0]?.listingId) ?? { store_name: list[0]?.storeName ?? "Loja" }} /> : <p className="text-sm">{list[0]?.storeName} · reputação indisponível</p>}</div>
              {list.map((i) => (
                <div key={i.listingId} className="flex items-center gap-4 px-4 py-3">
                  {i.image && <img src={i.image} alt="" className="h-16 w-auto" />}
                  <Link to="/carta/$cardId" params={{ cardId: i.cardId }} className="flex-1 hover:text-primary">
                    {i.cardName}<br /><span className="text-xs text-muted-foreground">{i.condition} · {i.language}</span>
                  </Link>
                  <input type="number" min={1} max={i.max} value={i.qty} onChange={(e) => setQty(i.listingId, +e.target.value)} className="w-16 rounded-md border border-input px-2 py-1 text-sm" aria-label="Quantidade" />
                  <p className="w-28 text-right">{money(i.price * i.qty)}</p>
                  <Button variant="ghost" size="icon" onClick={() => remove(i.listingId)} aria-label="Remover" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <aside className="h-fit space-y-3 rounded-md bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Entrega</h2>
          <input className={f} placeholder="Nome completo" value={ship.name} onChange={(e) => setShip({ ...ship, name: e.target.value })} />
          <input className={f} placeholder="Endereço" value={ship.address} onChange={(e) => setShip({ ...ship, address: e.target.value })} />
          <div className="grid grid-cols-[1fr_70px] gap-2">
            <input className={f} placeholder="Cidade" value={ship.city} onChange={(e) => setShip({ ...ship, city: e.target.value })} />
            <input className={f} placeholder="UF" maxLength={2} value={ship.state} onChange={(e) => setShip({ ...ship, state: e.target.value.toUpperCase() })} />
          </div>
          <input className={f} placeholder="CEP" value={ship.zip} onChange={(e) => setShip({ ...ship, zip: e.target.value })} />
          <div className="flex justify-between border-t border-border pt-3 text-sm"><span className="text-muted-foreground">Frete (por loja)</span><span>{shipping === 0 ? "Grátis" : money(shipping)}</span></div>
          <div className="flex justify-between text-lg"><span>Total</span><span className="font-semibold">{money(total + shipping)}</span></div>
          <p className="text-xs text-muted-foreground">Cartas reservadas por 15 minutos após finalizar. Protegido pela <Link to="/compra-garantida" className="text-primary">Compra Garantida</Link>.</p>
          <Button disabled={!items.length || busy || !ship.name || !ship.address || !ship.city || !ship.state || !ship.zip} onClick={checkout}
            className="w-full rounded-md bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50">
            {user ? "Finalizar pedido (modo teste)" : "Entrar para finalizar"}
          </Button>
          <p className="text-xs text-muted-foreground">Pagamento online ainda em ambiente de teste: nenhum valor é cobrado.</p>
        </aside>
      </main>
    </PageShell>
  );
}
