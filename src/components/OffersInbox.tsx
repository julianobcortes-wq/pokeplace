import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import {
  formatOfferRemaining,
  OFFER_STATUS_LABELS,
  validateCounterOffer,
  type OfferStatus,
} from "@/lib/marketplace/offers";
import { dbRpc, dbTable } from "@/lib/supabase-ext";
import { isSupabaseConfigured } from "@/lib/runtime-config";

type OfferRow = {
  id: string;
  listing_id: string;
  card_id: string;
  seller_id: string;
  buyer_id: string;
  quantity: number;
  listing_price: number;
  offered_price: number;
  counter_price: number | null;
  status: OfferStatus;
  message: string | null;
  order_id: string | null;
  expires_at: string;
  created_at: string;
  cards?: { name: string; number: string; image_small: string | null } | null;
  sellers?: { store_name: string; slug: string } | null;
};

export function OffersInbox({
  mode,
  sellerId,
  userId,
}: {
  mode: "seller" | "buyer";
  sellerId?: string;
  userId?: string;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [counterDraft, setCounterDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const key = mode === "seller" ? ["seller-offers", sellerId] : ["buyer-offers", userId];
  const { data: offers = [] } = useQuery({
    queryKey: key,
    enabled: isSupabaseConfigured() && (mode === "seller" ? !!sellerId : !!userId),
    queryFn: async () => {
      const base = dbTable("listing_offers").select(
        "*, cards(name,number,image_small), sellers(store_name,slug)",
      );
      const q = mode === "seller" ? base.eq("seller_id", sellerId) : base.eq("buyer_id", userId);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
      if (error) return [] as OfferRow[];
      return (data ?? []) as OfferRow[];
    },
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: key });
    await qc.invalidateQueries({ queryKey: ["my-listings"] });
    await qc.invalidateQueries({ queryKey: ["my-orders"] });
  };

  const respond = async (offer: OfferRow, decision: "accept" | "decline" | "counter") => {
    let counterPrice: number | null = null;
    if (decision === "counter") {
      counterPrice = Number((counterDraft[offer.id] ?? "").replace(",", "."));
      const err = validateCounterOffer({
        listingPrice: Number(offer.listing_price),
        offeredPrice: Number(offer.offered_price),
        counterPrice,
      });
      if (err) {
        toast.error(err);
        return;
      }
    }
    setBusyId(offer.id);
    const { error } = await dbRpc("respond_listing_offer", {
      _offer_id: offer.id,
      _decision: decision,
      _counter_price: counterPrice,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      decision === "accept"
        ? "Proposta aceita! Estoque reservado e pedido criado."
        : decision === "counter"
          ? "Contra-oferta enviada (válida por 48h)"
          : "Proposta recusada",
    );
    await refresh();
  };

  const acceptCounter = async (offer: OfferRow) => {
    setBusyId(offer.id);
    const { data, error } = await dbRpc<string>("buyer_accept_counter_offer", {
      _offer_id: offer.id,
      _ship: {},
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contra-oferta aceita! Estoque reservado por 24h.");
    await refresh();
    if (data) {
      void nav({ to: "/pedidos/$orderId", params: { orderId: data } });
    }
  };

  const cancelOffer = async (offerId: string) => {
    setBusyId(offerId);
    const { error } = await dbRpc("cancel_listing_offer", { _offer_id: offerId });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Proposta cancelada");
    await refresh();
  };

  const pendingCount = offers.filter(
    (o) => o.status === "pending" || o.status === "countered",
  ).length;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-slab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HandCoins className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">
            {mode === "seller" ? "Propostas recebidas" : "Minhas propostas"} ({offers.length})
          </h2>
        </div>
        {pendingCount > 0 && (
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {pendingCount} ativa{pendingCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {offers.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "seller"
            ? "Nenhuma proposta de comprador no momento."
            : "Você ainda não enviou propostas. Use o botão “Fazer oferta” na página de qualquer carta."}
        </p>
      ) : (
        <div className="mt-3 divide-y divide-border">
          {offers.map((o) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                {o.cards?.image_small && (
                  <img
                    src={o.cards.image_small}
                    alt=""
                    className="h-14 w-auto rounded shadow-slab"
                  />
                )}
                <div className="min-w-0">
                  <Link
                    to="/carta/$cardId"
                    params={{ cardId: o.card_id }}
                    className="font-semibold hover:text-primary"
                  >
                    {o.cards?.name ?? o.card_id} {o.cards?.number ? `#${o.cards.number}` : ""}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {mode === "buyer" && o.sellers?.store_name ? `${o.sellers.store_name} · ` : ""}
                    {o.quantity}x · Anunciado{" "}
                    <span className="num">{money(Number(o.listing_price))}</span> · Proposta{" "}
                    <b className="num text-foreground">{money(Number(o.offered_price))}</b>
                    {o.counter_price != null && (
                      <>
                        {" "}
                        · Contra-oferta{" "}
                        <b className="num text-primary">{money(Number(o.counter_price))}</b>
                      </>
                    )}
                  </p>
                  {o.message && (
                    <p className="mt-1 text-xs italic text-muted-foreground">“{o.message}”</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Status: <b>{OFFER_STATUS_LABELS[o.status] ?? o.status}</b>
                    {(o.status === "pending" || o.status === "countered") &&
                      ` · ${formatOfferRemaining(o.expires_at)}`}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {o.order_id && (
                  <Link
                    to="/pedidos/$orderId"
                    params={{ orderId: o.order_id }}
                    className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    Ver pedido #{o.order_id.slice(0, 8)}
                  </Link>
                )}

                {mode === "seller" && o.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      disabled={busyId === o.id}
                      onClick={() => void respond(o, "accept")}
                    >
                      Aceitar
                    </Button>
                    <div className="flex items-center gap-1">
                      <input
                        aria-label="Valor da contra-oferta"
                        inputMode="decimal"
                        placeholder="Contra R$"
                        value={counterDraft[o.id] ?? ""}
                        onChange={(e) =>
                          setCounterDraft((cur) => ({ ...cur, [o.id]: e.target.value }))
                        }
                        className="num w-24 rounded-lg border border-input bg-background px-2 py-1 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === o.id || !(counterDraft[o.id] ?? "").trim()}
                        onClick={() => void respond(o, "counter")}
                      >
                        Contra-ofertar
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busyId === o.id}
                      onClick={() => void respond(o, "decline")}
                    >
                      Recusar
                    </Button>
                  </>
                )}

                {mode === "buyer" && o.status === "countered" && (
                  <Button
                    size="sm"
                    disabled={busyId === o.id}
                    onClick={() => void acceptCounter(o)}
                  >
                    Aceitar {money(Number(o.counter_price ?? 0))}
                  </Button>
                )}

                {mode === "buyer" && (o.status === "pending" || o.status === "countered") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === o.id}
                    onClick={() => void cancelOffer(o.id)}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
