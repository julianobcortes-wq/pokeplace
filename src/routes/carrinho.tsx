import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck, ShoppingBag, Tag, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { SellerLine } from "@/components/market";
import { PageShell } from "@/components/SiteHeader";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/lib/runtime-config";
import { DEMO_COUPON_CODE, isDemoMode } from "@/lib/demo-mode";
import {
  createDemoOrder,
  getDemoCartMetadata,
  validateDemoCoupon,
} from "@/lib/demo-data";
import { supabase } from "@/integrations/supabase/client";
import { dbRpc, dbTable } from "@/lib/supabase-ext";
import { getPaymentOptions } from "@/lib/payments/functions";
import { BRAND, money } from "@/lib/format";
import {
  calculateStorePromotions,
  normalizeCouponCode,
  type VolumeDiscountTier,
} from "@/lib/marketplace/promotions";
import { calculateStoreShipping, type ShippingProfileLike } from "@/lib/marketplace/shipping";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/carrinho")({
  head: () => ({
    meta: [
      { title: `Carrinho | ${BRAND.name}` },
      {
        name: "description",
        content: "Revise suas cartas, separadas por loja, e finalize o pedido.",
      },
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

type AppliedCoupon = { code: string; discount: number };

function CartPage() {
  const { items, setQty, remove, clear } = useCart();
  const { user } = useAuth();
  const demo = isDemoMode() && !isSupabaseConfigured();
  const nav = useNavigate();
  const [ship, setShip] = useState({ name: "", address: "", city: "", state: "", zip: "" });
  const [busy, setBusy] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [couponInput, setCouponInput] = useState<Record<string, string>>({});
  const [appliedCoupons, setAppliedCoupons] = useState<Record<string, AppliedCoupon>>({});

  const demoMeta = demo ? getDemoCartMetadata(items.map((i) => i.listingId)) : null;

  const { data: payOpts } = useQuery({
    queryKey: ["payment-options"],
    queryFn: () => getPaymentOptions(),
    staleTime: 60_000,
    enabled: !!user && !demo,
  });

  const { data: remoteSellers = [] } = useQuery({
    queryKey: ["cart-sellers", items.map((i) => i.listingId)],
    enabled: items.length > 0 && isSupabaseConfigured(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_listing_sellers", {
        _ids: items.map((i) => i.listingId),
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const sellers = demo ? (demoMeta?.sellers ?? []) : remoteSellers;

  const bySeller = items.reduce<Record<string, typeof items>>((a, i) => {
    const key = sellers.find((s) => s.listing_id === i.listingId)?.seller_id ?? i.storeName;
    (a[key] ??= []).push(i);
    return a;
  }, {});

  const sellerIds = [...new Set(sellers.map((s) => s.seller_id).filter(Boolean))] as string[];

  const { data: remoteProfiles = [] } = useQuery({
    queryKey: ["ship-profiles", sellerIds],
    enabled: sellerIds.length > 0 && isSupabaseConfigured(),
    queryFn: async () =>
      (await supabase.from("shipping_profiles").select("*").in("seller_id", sellerIds)).data ?? [],
  });
  const profiles = demo ? (demoMeta?.profiles ?? []) : remoteProfiles;

  const { data: remoteVolumeTiers = [] } = useQuery({
    queryKey: ["cart-volume-tiers", sellerIds],
    enabled: sellerIds.length > 0 && isSupabaseConfigured(),
    queryFn: async () => {
      const { data, error } = await dbTable("store_volume_discounts")
        .select("*")
        .in("seller_id", sellerIds)
        .eq("active", true);
      if (error) return [] as (VolumeDiscountTier & { seller_id: string })[];
      return (data ?? []) as (VolumeDiscountTier & { seller_id: string })[];
    },
  });
  const volumeTiers = demo ? (demoMeta?.volumeTiers ?? []) : remoteVolumeTiers;

  const storeSummaries = Object.entries(bySeller).map(([sellerKey, list]) => {
    const sub = list.reduce((a, i) => a + i.price * i.qty, 0);
    const qty = list.reduce((a, i) => a + i.qty, 0);
    const tiers = volumeTiers.filter((t) => t.seller_id === sellerKey);
    const promo = calculateStorePromotions({ subtotal: sub, totalQty: qty, volumeTiers: tiers });
    const coupon = appliedCoupons[sellerKey];
    const couponDiscount = coupon
      ? Math.min(Math.max(0, promo.netSubtotal - 0.01), coupon.discount)
      : 0;
    const storeNet = Math.max(0, Math.round((promo.netSubtotal - couponDiscount) * 100) / 100);
    const profile = profiles.find((x) => x.seller_id === sellerKey) as
      ShippingProfileLike | undefined;
    const shipQuote = calculateStoreShipping(profile, storeNet, ship.state);
    return {
      sellerKey,
      list,
      sub,
      qty,
      promo,
      coupon,
      couponDiscount,
      storeDiscount: Math.round((promo.volumeDiscount + couponDiscount) * 100) / 100,
      storeNet,
      shipQuote,
    };
  });

  const totalGross = storeSummaries.reduce((s, x) => s + x.sub, 0);
  const totalDiscount = storeSummaries.reduce((s, x) => s + x.storeDiscount, 0);
  const totalNet = Math.max(0, Math.round((totalGross - totalDiscount) * 100) / 100);
  const shipping = storeSummaries.reduce((s, x) => s + x.shipQuote.fee, 0);

  const applyCoupon = async (sellerKey: string, netBeforeCoupon: number) => {
    const code = normalizeCouponCode(couponInput[sellerKey] ?? "");
    if (!code) {
      toast.error("Digite o código do cupom");
      return;
    }
    if (!user) {
      toast.error("Entre na sua conta para aplicar cupons");
      return;
    }
    if (demo) {
      const row = validateDemoCoupon(code, netBeforeCoupon);
      if (!row.valid) {
        toast.error(row.reason ?? "Cupom inválido");
        return;
      }
      setAppliedCoupons((cur) => ({
        ...cur,
        [sellerKey]: { code: row.code, discount: row.discount },
      }));
      toast.success(`Cupom ${row.code} aplicado (-${money(row.discount)})`);
      return;
    }
    const { data, error } = await dbRpc<
      { valid: boolean; reason: string | null; discount: number; code: string }[]
    >("validate_store_coupon", {
      _seller_id: sellerKey,
      _code: code,
      _subtotal: netBeforeCoupon,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : null;
    if (!row || !row.valid) {
      toast.error(row?.reason ?? "Cupom inválido nesta loja");
      return;
    }
    setAppliedCoupons((cur) => ({
      ...cur,
      [sellerKey]: { code: row.code, discount: Number(row.discount) },
    }));
    toast.success(`Cupom ${row.code} aplicado (-${money(Number(row.discount))})`);
  };

  const lookupCep = async (rawCep: string) => {
    const clean = rawCep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
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
    if (demo) {
      const demoOrder = createDemoOrder({
        items,
        ship,
        subtotal: totalGross,
        discount_total: totalDiscount,
        shipping_total: shipping,
      });
      clear();
      toast.success("Pedido simulado criado!", {
        description: "Modo demonstração — nenhuma cobrança real foi efetuada.",
      });
      nav({ to: "/pedidos/$orderId", params: { orderId: demoOrder.id } });
      return;
    }
    setBusy(true);
    const couponMap = Object.fromEntries(
      Object.entries(appliedCoupons).map(([sid, c]) => [sid, c.code]),
    );
    const payload = items.map((i) => ({ listing_id: i.listingId, quantity: i.qty }));
    let res = await dbRpc<string>("place_order_v2", {
      _items: payload,
      _ship: ship,
      _coupons: couponMap,
    });
    if (res.error && /place_order_v2/i.test(res.error.message)) {
      const fallback = await supabase.rpc("place_order", { _items: payload, _ship: ship });
      res = { data: (fallback.data as string | null) ?? null, error: fallback.error };
    }
    setBusy(false);
    if (res.error || !res.data) {
      toast.error(res.error?.message ?? "Não foi possível fechar o pedido");
      return;
    }
    clear();
    nav({ to: "/pedidos/$orderId", params: { orderId: res.data } });
  };

  const f =
    "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
  const formReady = Boolean(
    items.length &&
    ship.name.trim() &&
    ship.address.trim() &&
    ship.city.trim() &&
    ship.state.trim().length === 2 &&
    ship.zip.replace(/\D/g, "").length === 8,
  );

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
              <p className="mt-1 text-sm text-muted-foreground">
                Explore as coleções, compare preços e adicione cartas de lojas verificadas.
              </p>
              <Link
                to="/colecoes"
                className="mt-5 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Explorar coleções
              </Link>
            </div>
          ) : (
            storeSummaries.map(({ sellerKey, list, promo, coupon, couponDiscount, shipQuote }) => {
              const storeMeta = sellers.find((s) => s.listing_id === list[0]?.listingId);
              const isUuidSeller = Boolean(storeMeta?.seller_id);
              return (
                <div
                  key={sellerKey}
                  className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-slab"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                    {storeMeta ? (
                      <SellerLine s={storeMeta} />
                    ) : (
                      <p className="text-sm font-semibold">{list[0]?.storeName}</p>
                    )}
                    <span className="num inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Truck className="h-3.5 w-3.5" />
                      Frete{shipQuote.appliedUf ? ` (${shipQuote.appliedUf})` : ""}:{" "}
                      <b className="text-foreground">
                        {shipQuote.isFree ? "Grátis" : money(shipQuote.fee)}
                      </b>
                    </span>
                  </div>

                  {shipQuote.freeRemaining != null && shipQuote.freeRemaining > 0 && (
                    <div className="border-b border-border bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
                      Faltam <b className="num text-foreground">{money(shipQuote.freeRemaining)}</b>{" "}
                      nesta loja para ganhar <b className="text-success">frete grátis</b>.
                    </div>
                  )}

                  <div className="divide-y divide-border">
                    {list.map((i) => (
                      <div key={i.listingId} className="flex items-center gap-4 px-4 py-3">
                        {i.image && (
                          <img
                            src={i.image}
                            alt={i.cardName}
                            className="h-16 w-auto rounded-md shadow-slab"
                          />
                        )}
                        <Link
                          to="/carta/$cardId"
                          params={{ cardId: i.cardId }}
                          className="min-w-0 flex-1 hover:text-primary"
                        >
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
                        <p className="num w-28 text-right font-semibold">
                          {money(i.price * i.qty)}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(i.listingId)}
                          aria-label="Remover"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-2.5 text-xs">
                    <div className="space-y-0.5">
                      {promo.volumeTier && promo.volumeDiscount > 0 && (
                        <p className="font-medium text-success">
                          Desconto por volume ({promo.volumeTier.min_qty}+ cartas ·{" "}
                          {promo.volumeTier.discount_pct}%): -
                          <span className="num">{money(promo.volumeDiscount)}</span>
                        </p>
                      )}
                      {coupon && couponDiscount > 0 && (
                        <p className="font-medium text-success">
                          Cupom <span className="num">{coupon.code}</span>: -
                          <span className="num">{money(couponDiscount)}</span>{" "}
                          <button
                            type="button"
                            className="ml-1 text-muted-foreground underline"
                            onClick={() =>
                              setAppliedCoupons((cur) => {
                                const next = { ...cur };
                                delete next[sellerKey];
                                return next;
                              })
                            }
                          >
                            remover
                          </button>
                        </p>
                      )}
                    </div>

                    {isUuidSeller && !coupon && (
                      <div className="flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          aria-label="Cupom da loja"
                          placeholder={demo ? `Cupom (ex: ${DEMO_COUPON_CODE})` : "Cupom da loja"}
                          value={couponInput[sellerKey] ?? ""}
                          onChange={(e) =>
                            setCouponInput((cur) => ({
                              ...cur,
                              [sellerKey]: e.target.value.toUpperCase(),
                            }))
                          }
                          className="w-32 rounded-lg border border-input bg-background px-2 py-1 text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void applyCoupon(sellerKey, promo.netSubtotal)}
                        >
                          Aplicar
                        </Button>
                      </div>
                    )}
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
          {cepLoading && (
            <p className="text-xs text-muted-foreground">Buscando endereço pelo CEP…</p>
          )}
          <input
            className={f}
            placeholder="Nome completo de quem recebe"
            value={ship.name}
            onChange={(e) => setShip({ ...ship, name: e.target.value })}
          />
          <input
            className={f}
            placeholder="Rua, número e complemento"
            value={ship.address}
            onChange={(e) => setShip({ ...ship, address: e.target.value })}
          />
          <div className="grid grid-cols-[1fr_78px] gap-2">
            <input
              className={f}
              placeholder="Cidade"
              value={ship.city}
              onChange={(e) => setShip({ ...ship, city: e.target.value })}
            />
            <input
              className={f}
              placeholder="UF"
              maxLength={2}
              value={ship.state}
              onChange={(e) => setShip({ ...ship, state: e.target.value.toUpperCase() })}
            />
          </div>

          <div className="space-y-1.5 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cartas</span>
              <span className="num">{money(totalGross)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-success">
                <span>Descontos (volume/cupons)</span>
                <span className="num">-{money(totalDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Frete{ship.state.length === 2 ? ` para ${ship.state}` : " (por loja)"}
              </span>
              <span className="num">{shipping === 0 ? "Grátis" : money(shipping)}</span>
            </div>
            <div className="flex justify-between pt-2 text-lg font-bold">
              <span>Total</span>
              <span className="num">{money(totalNet + shipping)}</span>
            </div>
          </div>

          <Button
            disabled={!formReady || busy}
            onClick={checkout}
            className="w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? "Reservando cartas…"
              : demo
                ? "Simular pedido (modo demo)"
                : user
                  ? "Reservar e ir para pagamento"
                  : "Entrar para finalizar"}
          </Button>

          <div className="rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-success" /> Compra Garantida PokePlace
            </p>
            <p className="mt-1">
              {payOpts === undefined
                ? "Cartas reservadas por 15 minutos após fechar o pedido. O pagamento é feito na etapa seguinte, com proteção antifraude."
                : payOpts.mercadoPago
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
