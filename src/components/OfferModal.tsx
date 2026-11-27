import { useState } from "react";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { money } from "@/lib/format";
import {
  minAllowedOffer,
  OFFER_TTL_HOURS,
  validateOfferSubmission,
} from "@/lib/marketplace/offers";
import { dbRpc } from "@/lib/supabase-ext";

type Props = {
  listingId: string;
  cardName: string;
  storeName: string;
  sellerUserId?: string;
  listingPrice: number;
  maxQty: number;
  currency?: string;
};

export function OfferModal({
  listingId,
  cardName,
  storeName,
  sellerUserId = "",
  listingPrice,
  maxQty,
  currency = "BRL",
}: Props) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const floor = minAllowedOffer(listingPrice);

  const openModal = () => {
    if (!user) {
      void nav({ to: "/auth", search: { next: window.location.pathname } });
      return;
    }
    setPrice(
      String(Math.max(floor, Math.round(listingPrice * 0.85 * 100) / 100).toFixed(2)).replace(
        ".",
        ",",
      ),
    );
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const offeredPrice = Number(price.replace(",", "."));
    const quantity = parseInt(qty, 10) || 1;
    const err = validateOfferSubmission({
      listingPrice,
      offeredPrice,
      quantity,
      availableStock: maxQty,
      buyerUserId: user.id,
      sellerUserId,
      message,
    });
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    const { error } = await dbRpc("submit_listing_offer", {
      _listing_id: listingId,
      _offered_price: offeredPrice,
      _quantity: quantity,
      _message: message.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Proposta enviada!", {
      description: `A loja ${storeName} tem ${OFFER_TTL_HOURS}h para aceitar ou fazer contra-oferta.`,
    });
    setOpen(false);
    setMessage("");
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={openModal}
        className="gap-1.5 rounded-full text-xs"
      >
        <HandCoins className="h-3.5 w-3.5" />
        Fazer oferta
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fazer proposta · {storeName}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            <b>{cardName}</b> anunciado por{" "}
            <b className="num text-foreground">{money(listingPrice, currency)}</b>. Mínimo
            permitido: <b className="num">{money(floor, currency)}</b>. Propostas expiram
            automaticamente em {OFFER_TTL_HOURS}h.
          </p>

          <form onSubmit={submit} className="mt-2 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium">
                Sua oferta por unidade (R$)
                <input
                  required
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="num mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium">
                Quantidade (máx. {maxQty})
                <input
                  required
                  type="number"
                  min={1}
                  max={maxQty}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="num mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block text-xs font-medium">
              Mensagem opcional para a loja
              <textarea
                rows={2}
                maxLength={300}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex.: Fecho pagamento hoje via Pix se conseguir esse valor."
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Enviando…" : "Enviar proposta"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
