import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { MediaUpload } from "./MediaUpload";
import { Stars } from "./market";

/** Buyer review form for one seller within a delivered order. Rules enforced by submit_review in the DB. */
export function ReviewForm({ orderId, sellerId, storeName }: { orderId: string; sellerId: string; storeName: string }) {
  const qc = useQueryClient();
  const { data: existing } = useQuery({
    queryKey: ["my-review", orderId, sellerId],
    queryFn: async () => (await supabase.from("seller_reviews").select("id").eq("order_id", orderId).eq("seller_id", sellerId).maybeSingle()).data,
  });
  const [r, setR] = useState({ s: 5, p: 5, e: 5 });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  if (existing) return <p className="rounded-xl bg-success/10 p-3 text-sm text-success">Obrigado! Você já avaliou {storeName}.</p>;
  const send = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("submit_review", { _order_id: orderId, _seller_id: sellerId, _service: r.s, _packaging: r.p, _shipping: r.e, _comment: comment });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Avaliação enviada"); qc.invalidateQueries({ queryKey: ["my-review", orderId, sellerId] }); }
  };
  return (
    <div className="rounded-2xl border border-border bg-muted/50 p-4">
      <p className="font-semibold">Avalie {storeName}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {([["s", "Atendimento"], ["p", "Embalagem"], ["e", "Prazo"]] as const).map(([k, l]) => (
          <div key={k}><p className="text-xs text-muted-foreground">{l}</p>
            <div className="flex">{[1, 2, 3, 4, 5].map((n) => (
              <Button key={n} type="button" variant="ghost" size="icon" aria-label={`${l} ${n}`} onClick={() => setR({ ...r, [k]: n })} className="h-8 w-8 p-0 hover:bg-transparent">
                <Star className={`h-6 w-6 ${n <= r[k] ? "text-chart-4" : "text-border"}`} fill="currentColor" strokeWidth={0} />
              </Button>
            ))}</div>
          </div>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={3} placeholder="Conte como foi (opcional)" className="mt-3 w-full rounded-xl border border-input bg-card p-3 text-sm" />
      <Button disabled={busy} onClick={send} className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Enviar avaliação</Button>
    </div>
  );
}

/** Seller-side: rate the buyer after a live-paid delivered order (enforced by submit_buyer_review RPC). */
export function BuyerReviewForm({
  orderId,
  sellerId,
  buyerLabel,
}: {
  orderId: string;
  sellerId: string;
  buyerLabel?: string | undefined;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: existing } = useQuery({
    queryKey: ["buyer-review", orderId, sellerId],
    queryFn: async () => {
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (k: string, v: string) => {
              eq: (k: string, v: string) => {
                maybeSingle: () => Promise<{ data: { id: string; rating: number } | null }>;
              };
            };
          };
        };
      })
        .from("buyer_reviews")
        .select("id,rating")
        .eq("order_id", orderId)
        .eq("seller_id", sellerId)
        .maybeSingle();
      return data ?? null;
    },
  });

  if (existing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
        Comprador avaliado ({existing.rating}/5)
      </span>
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={() => setOpen(true)}>
        Avaliar comprador
      </Button>
    );
  }

  const send = async () => {
    setBusy(true);
    const { error } = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    }).rpc("submit_buyer_review", {
      _order_id: orderId,
      _seller_id: sellerId,
      _rating: rating,
      _comment: comment,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Avaliação do comprador enviada");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["buyer-review", orderId, sellerId] });
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-border bg-muted/40 p-2.5 text-left">
      <p className="text-xs font-semibold">Avaliar {buyerLabel || "comprador"}</p>
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((n) => (
          <Button
            key={n}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Nota comprador ${n}`}
            onClick={() => setRating(n)}
            className="h-7 w-7 p-0 hover:bg-transparent"
          >
            <Star className={`h-5 w-5 ${n <= rating ? "text-chart-4" : "text-border"}`} fill="currentColor" strokeWidth={0} />
          </Button>
        ))}
      </div>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        placeholder="Comentário opcional"
        className="w-full rounded-lg border border-input bg-card px-2.5 py-1 text-xs"
      />
      <div className="flex gap-1.5">
        <Button size="sm" className="h-7 rounded-full text-xs" disabled={busy} onClick={send}>
          Enviar
        </Button>
        <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** Seller-side: edit public profile fields. */
export function StoreProfileEditor({ seller, onDone }: { seller: { id: string; slug: string; logo_url: string | null; cover_url: string | null; bio: string | null; shipping_policy: string | null; return_policy: string | null }; onDone: () => void }) {
  const [f, setF] = useState({ logo_url: seller.logo_url ?? "", cover_url: seller.cover_url ?? "", bio: seller.bio ?? "", shipping_policy: seller.shipping_policy ?? "", return_policy: seller.return_policy ?? "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const patch = { ...f, logo_url: f.logo_url || null, cover_url: f.cover_url || null };
      const { error } = await supabase.from("sellers").update(patch).eq("id", seller.id);
      if (error) throw error;
      toast.success("Perfil da loja atualizado"); onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const area = "mt-1 w-full rounded-xl border border-input bg-card p-3 text-sm";
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-slab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Perfil público da loja</h2>
        <Link to="/loja/$slug" params={{ slug: seller.slug }} className="text-sm font-semibold text-primary">Ver minha página →</Link>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="space-y-2"><MediaUpload sellerId={seller.id} value={f.logo_url} onChange={path => setF({ ...f, logo_url: path })} label="Enviar logo" /><label className="text-sm">Ou link da logo<input type="url" value={f.logo_url.startsWith("https://") ? f.logo_url : ""} onChange={(e) => setF({ ...f, logo_url: e.target.value })} placeholder="https://…" className="mt-1 w-full rounded-full border border-input bg-card px-4 py-2 text-sm" /></label></div>
        <div className="space-y-2"><MediaUpload sellerId={seller.id} value={f.cover_url} onChange={path => setF({ ...f, cover_url: path })} label="Enviar capa" /><label className="text-sm">Ou link da capa<input type="url" value={f.cover_url.startsWith("https://") ? f.cover_url : ""} onChange={(e) => setF({ ...f, cover_url: e.target.value })} placeholder="https://…" className="mt-1 w-full rounded-full border border-input bg-card px-4 py-2 text-sm" /></label></div>
        <label className="text-sm md:col-span-2">Sobre a loja<textarea rows={3} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} className={area} /></label>
        <label className="text-sm">Política de envio<textarea rows={3} value={f.shipping_policy} onChange={(e) => setF({ ...f, shipping_policy: e.target.value })} className={area} /></label>
        <label className="text-sm">Trocas e devoluções<textarea rows={3} value={f.return_policy} onChange={(e) => setF({ ...f, return_policy: e.target.value })} className={area} /></label>
      </div>
      <Button disabled={busy} onClick={save} className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Salvar perfil</Button>
    </section>
  );
}

/** Seller-side: received reviews with one public reply each. */
export function StoreReviews({ sellerId }: { sellerId: string }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["store-reviews", sellerId],
    queryFn: async () => (await supabase.from("seller_reviews").select("id,rating_service,rating_packaging,rating_shipping,comment,reply,replied_at,created_at").eq("seller_id", sellerId).order("created_at", { ascending: false })).data ?? [],
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const reply = async (id: string) => {
    const { error } = await supabase.rpc("reply_review", { _review_id: id, _reply: drafts[id] ?? "" });
    if (error) toast.error(error.message); else { toast.success("Resposta publicada"); qc.invalidateQueries({ queryKey: ["store-reviews", sellerId] }); }
  };
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-slab">
      <h2 className="text-lg font-semibold">Avaliações recebidas ({data.length})</h2>
      {data.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhuma avaliação ainda. Elas aparecem quando compradores recebem pedidos.</p> : (
        <div className="mt-3 space-y-3">
          {data.map((r) => (
            <div key={r.id} className="rounded-xl border border-border p-4">
              <div className="flex justify-between"><Stars value={(r.rating_service + r.rating_packaging + r.rating_shipping) / 3} /><span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</span></div>
              {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
              {r.reply ? <p className="mt-2 rounded-lg bg-muted p-2 text-sm"><b>Sua resposta:</b> {r.reply}</p> : (
                <div className="mt-2 flex gap-2">
                  <input value={drafts[r.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })} maxLength={1000} placeholder="Responder publicamente (uma vez)" className="flex-1 rounded-full border border-input bg-card px-4 py-2 text-sm" />
                  <Button onClick={() => reply(r.id)} className="rounded-full bg-secondary px-4 text-sm font-semibold">Responder</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
