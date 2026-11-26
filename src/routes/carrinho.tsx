import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SellerLine } from "@/components/market";
import { PageShell } from "@/components/SiteHeader";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentOptions } from "@/lib/payments/functions";
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

function formatCep(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function CartPage() {
  const { items, setQty, remove, clear } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [ship, setShip] = useState({ name: "", address: "", city: "", state: "", zip: "" });
  const [busy, setBusy] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  const { data: payOpts } = useQuery({
    queryKey: ["payment-options"],
    queryFn: () => getPaymentOptions(),
    staleTime: 60_000,
  });

  const { data: sellers = [] } = useQuery({
    queryKey: ["cart-sellers", items.map((i) => i.listingId)],
    enabled: items.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_listing_sellers", { _ids: items.map((i) => i.listingId) });
      if (error) throw error;
      return data ?? [];
    },
  });

  const bySeller = items.reduce<Record<string, typeof items>>((a, i) => {
    const key = sellers.find((s) => s.listing_id === i.listingId)?.seller_id ?? i.storeName;
    (a[key] ??= []).push(i);
    return a;
  }, {});

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const sellerIds = [...new Set(sellers.map((s) => s.seller_id).filter(Boolean))] as string[];
  const { data: profiles = [] } = useQuery({
    queryKey: ["ship-profiles", sellerIds],
    enabled: sellerIds.length > 0,
    queryFn: async () => (await supabase.from("shipping_profiles").select("*").in("seller_id", sellerIds)).data ?? [],
  });

  const shipFor = (sid: string, sub: number) => {
    const p = profiles.find((x) => x.seller_id === sid);
    if (!p) return 0;
    return p.free_over && sub >= Number(p.free_over) ? 0 : Number(p.flat_fee);
  };
  const shipping = Object.entries(bySeller).reduce(
    (s, [sid, list]) => s + shipFor(sid, list.reduce((a, i) => a + i.price * i.qty, 0)),
    0,
  );

  const lookupCep = async (rawCep: string) => {
    const clean = rawCep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      if (!res.ok) return;
      const data = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) return;
      setShip((prev) => ({
        ...prev,
        address: prev.address || [data.logradouro, data.bairro].filter(Boolean).join(" — "),
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
      }));
    } catch {
      /* preenchimento manual continua funcionando */
    } finally {
      setCepLoading(false);
    }
  };

  const checkout = async () => {
    if (!user) return nav({ to: "/auth", search: { next: "/carrinho" } });
    setBusy(true);
    const { data, error } = await supabase.rpc("place_order", {
      _items: items.map((i) => ({ listing_id: i.listingId, quantity: i.qty })),
      _ship: ship,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    clear();
    nav({ to: "/pedidos/$orderId", params: { orderId: data as string } });
  };

  const f = "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
  const formReady = Boolean(items.length && ship.name.trim() && ship.address.trim() && ship.city.trim() && ship.state.trim().length === 2 && ship.zip.replace(/\D/g, "").length === 8);

  return (
    <PageShell>
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[1fr_380px]">
        <div>
          <p className="num text-[11px] uppercase tracking-[0.2em] text-primary">Checkout</p>
          <h1 className="mt-1 text-3xl font-extrabold">Seu carrinho</h1>

          {items.length === 0 ? (
            <div className="dots mt-6 rounded-3xl border border-dashed border-border p-12 text-center">
              <ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-display text-xl font-bold">Seu carrinho está vazio</p>
              <p className="mt-1 text-sm text-muted-foreground">Explore as coleções, compare preços e adicione cartas de lojas verificadas.</p>
              <Link to="/colecoes" className="mt-5 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">
                Explorar coleções
              </Link>
            </div>
          ) : (
            Object.entries(bySeller).map(([sellerKey, list]) => {
              const storeMeta = sellers.find((s) => s.listing_id === list[0]?.listingId);
              const sub = list.reduce((a, i) => a + i.price * i.qty, 0);
              const storeShip = shipFor(sellerKey, sub);
              return (
                <div key={sellerKey} className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-slab">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                    {storeMeta ? (
                      <SellerLine s={storeMeta} />
                    ) : (
                      <p className="text-sm font-semibold">{list[0]?.storeName}</p>
                    )}
                    <span className="num text-xs text-muted-foreground">
                      Frete da loja: <b className="text-foreground">{storeShip === 0 ? "Grátis" : money(storeShip)}</b>
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {list.map((i) => (
                      <div key={i.listingId} className="flex items-center gap-4 px-4 py-3">
                        {i.image && <img src={i.image} alt={i.cardName} className="h-16 w-auto rounded-md shadow-slab" />}
                        <Link to="/carta/$cardId" params={{ cardId: i.cardId }} className="min-w-0 flex-1 hover:text-primary">
                          <p className="truncate font-semibold">{i.cardName}</p>
                          <p className="text-xs text-muted-foreground">
                            {i.condition} · {i.language}
                          </p>
                        </Link>
                        <input
                          type="number"
                          min={1}
                          max={i.max}
                          value={i.qty}
                          onChange={(e) => setQty(i.listingId, +e.target.value)}
                          className="num w-16 rounded-xl border border-input bg-background px-2 py-1.5 text-center text-sm"
                          aria-label="Quantidade"
                        />
                        <p className="num w-28 text-right font-semibold">{money(i.price * i.qty)}</p>
                        <Button variant="ghost" size="icon" onClick={() => remove(i.listingId)} aria-label="Remover" className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <aside className="h-fit space-y-3 rounded-3xl border border-border bg-card p-6 shadow-slab">
          <h2 className="font-display text-xl font-bold">Endereço de entrega</h2>
          <input
            className={f}
            placeholder="CEP (00000-000)"
            value={ship.zip}
            onChange={(e) => {
              const formatted = formatCep(e.target.value);
              setShip({ ...ship, zip: formatted });
              if (formatted.replace(/\D/g, "").length === 8) void lookupCep(formatted);
            }}
          />
          {cepLoading && <p className="text-xs text-muted-foreground">Buscando endereço pelo CEP…</p>}
          <input className={f} placeholder="Nome completo de quem recebe" value={ship.name} onChange={(e) => setShip({ ...ship, name: e.target.value })} />
          <input className={f} placeholder="Rua, número e complemento" value={ship.address} onChange={(e) => setShip({ ...ship, address: e.target.value })} />
          <div className="grid grid-cols-[1fr_78px] gap-2">
            <input className={f} placeholder="Cidade" value={ship.city} onChange={(e) => setShip({ ...ship, city: e.target.value })} />
            <input className={f} placeholder="UF" maxLength={2} value={ship.state} onChange={(e) => setShip({ ...ship, state: e.target.value.toUpperCase() })} />
          </div>

          <div className="space-y-1.5 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cartas</span>
              <span className="num">{money(total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Frete (por loja)</span>
              <span className="num">{shipping === 0 ? "Grátis" : money(shipping)}</span>
            </div>
            <div className="flex justify-between pt-2 text-lg font-bold">
              <span>Total</span>
              <span className="num">{money(total + shipping)}</span>
            </div>
          </div>

          <Button
            disabled={!formReady || busy}
            onClick={checkout}
            className="w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Reservando cartas…" : user ? "Reservar e ir para pagamento" : "Entrar para finalizar"}
          </Button>

          <div className="rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-success" /> Compra Garantida PokePlace
            </p>
            <p className="mt-1">
              {payOpts?.mercadoPago
                ? "Pagamento via Mercado Pago (Pix, cartão e boleto) com proteção antifraude. Cartas reservadas por 15 minutos."
                : "Cartas reservadas por 15 minutos após fechar o pedido. Pagamento online via Mercado Pago será habilitado assim que as chaves da loja estiverem ativas."}{" "}
              <Link to="/compra-garantida" className="text-primary underline">
                Saiba mais
              </Link>
            </p>
          </div>
        </aside>
      </main>
    </PageShell>
  );
}
