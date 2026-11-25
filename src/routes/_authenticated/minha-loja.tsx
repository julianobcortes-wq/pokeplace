import { SellerFinance, SellerInbox, ShippingEditor } from "@/components/ops";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MediaUpload } from "@/components/MediaUpload";
import { SupportInbox } from "@/components/SupportInbox";
import { PageShell } from "@/components/SiteHeader";
import { SellerTrustPanel } from "@/components/market";
import { StoreProfileEditor, StoreReviews } from "@/components/seller-tools";
import { supabase } from "@/integrations/supabase/client";
import { searchCards } from "@/lib/catalog.functions";
import type { Database } from "@/integrations/supabase/types";
import { updateOwnListing } from "@/lib/guard.functions";
import { BRAND, CONDITIONS, FINISHES, LANGUAGES, SELLER_STATUS, money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/minha-loja")({
  head: () => ({ meta: [{ title: `Minha loja | ${BRAND.name}` }, { name: "description", content: "Gerencie anúncios, estoque e vendas." }, { property: "og:title", content: "Minha loja" }, { property: "og:description", content: "Painel do vendedor." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: MyStore,
});

function MyStore() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["store"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Entre para acessar sua loja");
      const { data: seller } = await supabase.from("sellers").select("*").eq("user_id", u.user.id).maybeSingle();
      if (!seller) return { seller: null, listings: [], sales: [] };
      const [{ data: listings }, { data: sales }] = await Promise.all([
        supabase.from("listings").select("*, cards(name, number, image_small, card_sets(name))").eq("seller_id", seller.id).neq("status", "removed").order("created_at", { ascending: false }),
        supabase.from("order_items").select("*, cards(name, number), orders(created_at, ship_name, ship_address, ship_city, ship_state, ship_zip)").eq("seller_id", seller.id).order("id", { ascending: false }),
      ]);
      const { data: paid } = await supabase.rpc("get_seller_sales");
      return { seller, listings: listings ?? [], sales: sales ?? [], paid: paid ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["store"] });

  if (isLoading) return <PageShell><p className="p-8">Carregando…</p></PageShell>;
  if (!data?.seller) return <PageShell><main className="mx-auto max-w-3xl p-8">Você ainda não tem loja. <Link to="/vender" className="text-primary underline">Inscreva-se</Link>.</main></PageShell>;
  const { seller, listings, sales } = data;
  const approved = seller.status === "approved";
  const liveSales = sales.filter(s => data.paid?.some(p => p.item_id === s.id && p.is_live_paid));
  const revenue = liveSales.filter((s) => s.status !== "cancelled").reduce((a, s) => a + Number(s.seller_amount), 0);

  const updateListing = async (id: string, patch: ListingPatch) => {
    const next: { price?: number; quantity?: number; status?: "active" | "paused" | "sold_out" | "removed" } = {};
    if (patch.price != null) next.price = Number(patch.price);
    if (patch.quantity != null) next.quantity = Number(patch.quantity);
    if (patch.status === "active" || patch.status === "paused" || patch.status === "sold_out" || patch.status === "removed") next.status = patch.status;
    try {
      await updateOwnListing({ data: { listingId: id, patch: next } });
      toast.success("Anúncio atualizado");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Acesso negado"); }
  };


  return (
    <PageShell>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-card p-5 shadow-sm">
          <div><h1 className="text-2xl font-semibold">{seller.store_name}</h1><p className="text-sm text-muted-foreground">Situação: <b>{SELLER_STATUS[seller.status]}</b>{seller.is_official ? " · Loja oficial" : ""}</p></div>
          <div className="flex gap-6 text-sm">
            <div><p className="text-muted-foreground">Anúncios ativos</p><p className="text-xl font-semibold">{listings.filter((l) => l.status === "active").length}</p></div>
            <div><p className="text-muted-foreground">Itens vendidos</p><p className="text-xl font-semibold">{liveSales.length}</p></div>
            <div><p className="text-muted-foreground">A receber</p><p className="text-xl font-semibold">{money(revenue)}</p></div>
          </div>
        </div>

        <SellerTrustPanel sellerId={seller.id} approved={approved} />
        <StoreProfileEditor seller={seller} onDone={refresh} />
        <StoreReviews sellerId={seller.id} />
        <SellerInbox sellerId={seller.id} />
        <ShippingEditor sellerId={seller.id} />
        <SellerFinance sellerId={seller.id} />

        {approved ? <NewListing sellerId={seller.id} onDone={refresh} /> : (
          <p className="rounded-md bg-card p-5 text-sm shadow-sm">Sua loja está com situação “{SELLER_STATUS[seller.status]}”. Novos anúncios só podem ser publicados por lojas aprovadas.</p>
        )}

        <section className="rounded-md bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Meus anúncios</h2>
          {listings.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhum anúncio ainda.</p> : (
            <div className="mt-3 divide-y divide-border">
              {listings.map((l) => <ListingRow key={l.id} l={l} canActivate={approved} onSave={updateListing} />)}
            </div>
          )}
        </section>

        <section className="rounded-md bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Vendas</h2><p className="mt-1 text-xs text-muted-foreground">Pedidos de teste não entram nos valores a receber.</p>
          {sales.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhuma venda ainda.</p> : (
            <div className="overflow-x-auto"><table className="mt-3 w-full min-w-[850px] text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th>Carta</th><th>Qtd</th><th>Total</th><th>Comissão</th><th>Você recebe</th><th>Entrega</th><th>Status</th></tr></thead>
              <tbody className="divide-y divide-border">
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2">{s.cards?.name} #{s.cards?.number}</td><td>{s.quantity}</td>
                    <td>{money(Number(s.unit_price) * s.quantity)}</td><td>{money(Number(s.commission_amount))}</td><td>{money(Number(s.seller_amount))}</td>
                    <td className="text-xs">{s.orders?.ship_name}<br />{s.orders?.ship_address}, {s.orders?.ship_city}/{s.orders?.ship_state} {s.orders?.ship_zip}</td>
                    <td><ShipmentControl item={s} onDone={refresh} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
        <SupportInbox />
      </main>
    </PageShell>
  );
}

type ListingPatch = Database["public"]["Tables"]["listings"]["Update"];
type L = { id: string; price: number; quantity: number; status: string; condition: string; language: string; cards: { name: string; number: string; image_small: string | null; card_sets: { name: string } | null } | null };

function ListingRow({ l, canActivate, onSave }: { l: L; canActivate: boolean; onSave: (id: string, p: ListingPatch) => void }) {
  const [price, setPrice] = useState(String(l.price));
  const [qty, setQty] = useState(String(l.quantity));
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      {l.cards?.image_small && <img src={l.cards.image_small} alt="" className="h-14 w-auto" />}
      <div className="min-w-48 flex-1"><p className="font-semibold">{l.cards?.name} #{l.cards?.number}</p><p className="text-xs text-muted-foreground">{l.cards?.card_sets?.name} · {l.condition} · {LANGUAGES[l.language] ?? l.language} · {l.status}</p></div>
      <label className="text-xs">Preço R$<input value={price} onChange={(e) => setPrice(e.target.value)} className="ml-1 w-24 rounded border border-input px-2 py-1 text-sm" /></label>
      <label className="text-xs">Estoque<input value={qty} onChange={(e) => setQty(e.target.value)} className="ml-1 w-16 rounded border border-input px-2 py-1 text-sm" /></label>
      <Button onClick={() => { const q = parseInt(qty) || 0; onSave(l.id, { price: Number(price.replace(",", ".")), quantity: q, status: q === 0 ? "sold_out" : l.status === "sold_out" ? "active" : l.status }); }} className="rounded bg-secondary px-3 py-1.5 text-sm font-semibold text-secondary-foreground">Salvar</Button>
      {l.status === "active"
        ? <Button onClick={() => onSave(l.id, { status: "paused" })} className="text-sm text-muted-foreground">Pausar</Button>
        : canActivate && l.quantity > 0 && <Button onClick={() => onSave(l.id, { status: "active" })} className="text-sm text-primary">Ativar</Button>}
      <Button onClick={() => onSave(l.id, { status: "removed" })} className="text-sm text-destructive">Remover</Button>
    </div>
  );
}

type Hit = Awaited<ReturnType<typeof searchCards>>[number];

function NewListing({ sellerId, onDone }: { sellerId: string; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [card, setCard] = useState<Hit | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ condition: "NM", language: "en", finish: "normal", graded: false, grade_company: "", grade: "", price: "", quantity: "1", notes: "" });
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => setHits(await searchCards({ data: { q, limit: 10 } })), 250);
    return () => clearTimeout(t);
  }, [q]);
  const i = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!card) return;
    if (!(Number(f.price.replace(",", ".")) > 0)) { toast.error("Informe o preço"); return; }
    setBusy(true);
    const { error } = await supabase.from("listings").insert({
      seller_id: sellerId, card_id: card.id, condition: f.condition, language: f.language, finish: f.finish,
      graded: f.graded, grade_company: f.graded ? f.grade_company : null, grade: f.graded ? f.grade : null,
      price: Number(f.price.replace(",", ".")), quantity: parseInt(f.quantity), notes: f.notes || null, photo_paths: photos,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Anúncio publicado!");
    setPhotos([]); setCard(null); setQ(""); setF({ ...f, price: "", quantity: "1", notes: "" }); onDone();
  };
  return (
    <section className="rounded-md bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Novo anúncio</h2>
      {!card ? (
        <div className="mt-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procure a carta no catálogo (nome, número ou código)" className={i} />
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
            {hits.map((h) => (
              <Button key={h.id} onClick={() => setCard(h)} className="rounded border border-border p-2 text-left text-xs hover:border-primary">
                {h.image_small && <img src={h.image_small} alt="" className="mx-auto h-28 w-auto" />}
                <p className="mt-1 font-semibold">{h.name} #{h.number}</p><p className="text-muted-foreground">{h.card_sets?.name}</p>
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 grid gap-4 md:grid-cols-[120px_1fr]">
          {card.image_small && <img src={card.image_small} alt="" className="w-full" />}
          <div className="grid gap-3 md:grid-cols-3">
            <p className="md:col-span-3"><b>{card.name} #{card.number}</b> · {card.card_sets?.name} <Button type="button" onClick={() => setCard(null)} className="ml-2 text-sm text-primary">trocar</Button></p>
            <label className="text-sm">Condição<select className={i} value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })}>{Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="text-sm">Idioma<select className={i} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>{Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="text-sm">Acabamento<select className={i} value={f.finish} onChange={(e) => setF({ ...f, finish: e.target.value })}>{Object.entries(FINISHES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.graded} onChange={(e) => setF({ ...f, graded: e.target.checked })} />Carta graduada</label>
            {f.graded && <>
              <label className="text-sm">Empresa<select className={i} value={f.grade_company} onChange={(e) => setF({ ...f, grade_company: e.target.value })}><option value="">—</option>{["PSA", "BGS", "CGC", "TAG", "Outra"].map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="text-sm">Nota<input className={i} value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} /></label>
            </>}
            <label className="text-sm">Preço (R$)<input required inputMode="decimal" className={i} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
            <label className="text-sm">Quantidade<input required type="number" min={1} className={i} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></label>
            <label className="text-sm md:col-span-3">Observações<input className={i} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
            <div className="md:col-span-3 flex flex-wrap gap-3">{photos.map(path => <MediaUpload key={path} sellerId={sellerId} value={path} onChange={next => setPhotos(photos.map(p => p === path ? next : p))} label="Trocar foto" />)}{photos.length < 4 && <MediaUpload sellerId={sellerId} onChange={path => setPhotos([...photos, path])} label="Adicionar foto real" />}</div>
            <Button disabled={busy} className="md:col-span-3">{busy ? "Publicando…" : "Publicar anúncio"}</Button>
          </div>
        </form>
      )}
    </section>
  );
}

function ShipmentControl({ item, onDone }: { item: { id: string; status: string; tracking_code: string | null; shipping_carrier: string | null }; onDone: () => void }) {
  const [carrier, setCarrier] = useState(''); const [tracking, setTracking] = useState(''); const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true); const { error } = await supabase.rpc('mark_item_shipped', { _item_id: item.id, _carrier: carrier, _tracking: tracking }); setBusy(false); if (error) toast.error(error.message); else { toast.success('Envio registrado'); onDone(); } };
  if (item.status !== 'pending') return <span className="text-xs">{item.status === 'delivered' ? 'Recebimento confirmado' : item.status === 'cancelled' ? 'Cancelado' : 'Enviado'}<br />{item.shipping_carrier} {item.tracking_code}</span>;
  return <div className="min-w-40 space-y-1"><input aria-label="Transportadora" placeholder="Transportadora" value={carrier} onChange={e => setCarrier(e.target.value)} className="w-full rounded border border-input bg-card px-2 py-1 text-xs" /><input aria-label="Código de rastreio" placeholder="Código de rastreio" value={tracking} onChange={e => setTracking(e.target.value)} className="w-full rounded border border-input bg-card px-2 py-1 text-xs" /><Button size="sm" disabled={busy || !carrier.trim() || !tracking.trim()} onClick={send}>Registrar envio</Button></div>;
}
