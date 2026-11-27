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
import { BuyerReviewForm, StoreProfileEditor, StoreReviews } from "@/components/seller-tools";
import { BulkListingUpload } from "@/components/BulkListingUpload";
import { BulkListingEditor } from "@/components/BulkListingEditor";
import { ConditionGuide } from "@/components/ConditionGuide";
import { OffersInbox } from "@/components/OffersInbox";
import { SellerPromotions } from "@/components/SellerPromotions";
import { supabase } from "@/integrations/supabase/client";
import { searchCards } from "@/lib/catalog.functions";
import type { Database } from "@/integrations/supabase/types";
import { updateOwnListing } from "@/lib/guard.functions";
import { BRAND, CONDITIONS, FINISHES, LANGUAGES, SELLER_STATUS, money } from "@/lib/format";
import { photoSlotLabel, validateGrading } from "@/lib/marketplace/grading";
import { shippingSlaStatus } from "@/lib/marketplace/rules";

export const Route = createFileRoute("/_authenticated/minha-loja")({
  head: () => ({
    meta: [
      { title: `Minha loja | ${BRAND.name}` },
      { name: "description", content: "Gerencie anúncios, estoque e vendas." },
      { property: "og:title", content: "Minha loja" },
      { property: "og:description", content: "Painel do vendedor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyStore,
});

function MyStore() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const { data, isLoading } = useQuery({
    queryKey: ["store"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Entre para acessar sua loja");
      const { data: seller } = await supabase.from("sellers").select("*").eq("user_id", u.user.id).maybeSingle();
      if (!seller) return { seller: null, listings: [], sales: [], paid: [] };
      const [{ data: listings }, { data: sales }] = await Promise.all([
        supabase
          .from("listings")
          .select("*, cards(name, number, image_small, card_sets(name))")
          .eq("seller_id", seller.id)
          .neq("status", "removed")
          .order("created_at", { ascending: false }),
        supabase
          .from("order_items")
          .select("*, cards(name, number), orders(created_at, ship_name, ship_address, ship_city, ship_state, ship_zip)")
          .eq("seller_id", seller.id)
          .order("id", { ascending: false }),
      ]);
      const { data: paid } = await supabase.rpc("get_seller_sales");
      return { seller, listings: listings ?? [], sales: sales ?? [], paid: paid ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["store"] });

  if (isLoading)
    return (
      <PageShell>
        <p className="p-8 text-muted-foreground">Carregando…</p>
      </PageShell>
    );
  if (!data?.seller)
    return (
      <PageShell>
        <main className="mx-auto max-w-3xl p-8">
          Você ainda não tem loja.{" "}
          <Link to="/vender" className="font-semibold text-primary underline">
            Inscreva-se
          </Link>
          .
        </main>
      </PageShell>
    );

  const { seller, listings, sales } = data;
  const approved = seller.status === "approved";
  const liveSales = sales.filter((s) => data.paid?.some((p) => p.item_id === s.id && p.is_live_paid));
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Acesso negado");
    }
  };

  return (
    <PageShell>
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-card p-6 shadow-slab">
          <div>
            <p className="num text-[11px] uppercase tracking-[0.2em] text-primary">Painel do vendedor</p>
            <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">{seller.store_name}</h1>
            <p className="text-sm text-muted-foreground">
              Situação: <b className="text-foreground">{SELLER_STATUS[seller.status]}</b>
              {seller.is_official ? " · Loja oficial" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Anúncios ativos</p>
              <p className="num text-2xl font-bold">{listings.filter((l) => l.status === "active").length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Itens vendidos</p>
              <p className="num text-2xl font-bold">{liveSales.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">A receber</p>
              <p className="num text-2xl font-bold text-success">{money(revenue)}</p>
            </div>
          </div>
        </div>

        <SellerTrustPanel sellerId={seller.id} approved={approved} />
        <StoreProfileEditor seller={seller} onDone={refresh} />
        <StoreReviews sellerId={seller.id} />
        <SellerInbox sellerId={seller.id} />
        <OffersInbox mode="seller" sellerId={seller.id} />
        <SellerPromotions sellerId={seller.id} />
        <ShippingEditor sellerId={seller.id} />
        <SellerFinance sellerId={seller.id} />

        {approved ? (
          <>
            <NewListing sellerId={seller.id} onDone={refresh} />
            <BulkListingUpload sellerId={seller.id} onDone={refresh} />
          </>
        ) : (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm shadow-slab">
            Sua loja está com situação “{SELLER_STATUS[seller.status]}”. Novos anúncios só podem ser publicados por lojas aprovadas.
          </p>
        )}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-slab">
          <h2 className="text-lg font-bold">Meus anúncios ({listings.length})</h2>
          {listings.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nenhum anúncio ainda.</p>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos os anúncios"
                    checked={selected.length === listings.length}
                    onChange={(e) => setSelected(e.target.checked ? listings.map((l) => l.id) : [])}
                  />
                  Selecionar todos
                </label>
              </div>
              {selected.length > 0 && (
                <BulkListingEditor
                  sellerId={seller.id}
                  selectedIds={selected}
                  approved={approved}
                  onClear={() => setSelected([])}
                  onDone={refresh}
                />
              )}
              <div className="mt-3 divide-y divide-border">
                {listings.map((l) => (
                  <ListingRow
                    key={l.id}
                    l={l}
                    canActivate={approved}
                    onSave={updateListing}
                    selected={selected.includes(l.id)}
                    onToggle={() => setSelected((cur) => (cur.includes(l.id) ? cur.filter((x) => x !== l.id) : [...cur, l.id]))}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-slab">
          <h2 className="text-lg font-bold">Vendas</h2>
          <p className="mt-1 text-xs text-muted-foreground">Pedidos de teste não entram nos valores a receber.</p>
          {sales.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nenhuma venda ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-3 w-full min-w-[850px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th>Carta</th>
                    <th>Qtd</th>
                    <th>Total</th>
                    <th>Comissão</th>
                    <th>Você recebe</th>
                    <th>Entrega</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sales.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 font-medium">
                        {s.cards?.name} #{s.cards?.number}
                      </td>
                      <td className="num">{s.quantity}</td>
                      <td className="num">{money(Number(s.unit_price) * s.quantity)}</td>
                      <td className="num">{money(Number(s.commission_amount))}</td>
                      <td className="num font-semibold">{money(Number(s.seller_amount))}</td>
                      <td className="text-xs">
                        {s.orders?.ship_name}
                        <br />
                        {s.orders?.ship_address}, {s.orders?.ship_city}/{s.orders?.ship_state} {s.orders?.ship_zip}
                      </td>
                      <td className="py-2">
                        {s.status === "pending" && (() => {
                          const sla = shippingSlaStatus((s as unknown as { ship_by?: string | null }).ship_by);
                          if (!sla) return null;
                          return (
                            <p
                              className={`mb-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                sla.overdue
                                  ? "bg-destructive/15 text-destructive"
                                  : sla.urgent
                                    ? "bg-chart-4/20 text-chart-4"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              SLA: {sla.label}
                            </p>
                          );
                        })()}
                        <ShipmentControl item={s} onDone={refresh} />
                        {s.status === "delivered" && (
                          <div className="mt-2">
                            <BuyerReviewForm orderId={s.order_id} sellerId={seller.id} buyerLabel={s.orders?.ship_name ?? undefined} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <SupportInbox />
      </main>
    </PageShell>
  );
}

type ListingPatch = Database["public"]["Tables"]["listings"]["Update"];
type L = {
  id: string;
  price: number;
  quantity: number;
  status: string;
  condition: string;
  language: string;
  cards: { name: string; number: string; image_small: string | null; card_sets: { name: string } | null } | null;
};

function ListingRow({
  l,
  canActivate,
  onSave,
  selected,
  onToggle,
}: {
  l: L;
  canActivate: boolean;
  onSave: (id: string, p: ListingPatch) => void;
  selected: boolean;
  onToggle: () => void;
}) {
  const [price, setPrice] = useState(String(l.price));
  const [qty, setQty] = useState(String(l.quantity));
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <input type="checkbox" aria-label={`Selecionar ${l.cards?.name ?? "anúncio"}`} checked={selected} onChange={onToggle} />
      {l.cards?.image_small && <img src={l.cards.image_small} alt="" className="h-14 w-auto rounded-md shadow-slab" />}
      <div className="min-w-48 flex-1">
        <p className="font-semibold">
          {l.cards?.name} #{l.cards?.number}
        </p>
        <p className="text-xs text-muted-foreground">
          {l.cards?.card_sets?.name} · {l.condition} · {LANGUAGES[l.language] ?? l.language} · {l.status}
        </p>
      </div>
      <label className="text-xs">
        Preço R$
        <input value={price} onChange={(e) => setPrice(e.target.value)} className="num ml-1 w-24 rounded-lg border border-input bg-background px-2 py-1 text-sm" />
      </label>
      <label className="text-xs">
        Estoque
        <input value={qty} onChange={(e) => setQty(e.target.value)} className="num ml-1 w-16 rounded-lg border border-input bg-background px-2 py-1 text-sm" />
      </label>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          const q = parseInt(qty, 10) || 0;
          onSave(l.id, {
            price: Number(price.replace(",", ".")),
            quantity: q,
            status: q === 0 ? "sold_out" : l.status === "sold_out" ? "active" : l.status,
          });
        }}
      >
        Salvar
      </Button>
      {l.status === "active" ? (
        <Button size="sm" variant="outline" onClick={() => onSave(l.id, { status: "paused" })}>
          Pausar
        </Button>
      ) : (
        canActivate &&
        l.quantity > 0 && (
          <Button size="sm" variant="outline" onClick={() => onSave(l.id, { status: "active" })}>
            Ativar
          </Button>
        )
      )}
      <Button size="sm" variant="ghost" onClick={() => onSave(l.id, { status: "removed" })} className="text-destructive hover:text-destructive">
        Remover
      </Button>
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
  const [f, setF] = useState({
    condition: "NM",
    language: "en",
    finish: "normal",
    graded: false,
    grade_company: "",
    grade: "",
    price: "",
    quantity: "1",
    notes: "",
  });

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => setHits(await searchCards({ data: { q, limit: 10 } })), 250);
    return () => clearTimeout(t);
  }, [q]);

  const i = "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!card) return;
    if (!(Number(f.price.replace(",", ".")) > 0)) {
      toast.error("Informe o preço");
      return;
    }
    const grading = validateGrading(f.graded, f.grade_company, f.grade);
    if (!grading.ok) {
      toast.error(grading.error);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("listings").insert({
      seller_id: sellerId,
      card_id: card.id,
      condition: f.condition,
      language: f.language,
      finish: f.finish,
      graded: f.graded,
      grade_company: grading.company,
      grade: grading.grade,
      price: Number(f.price.replace(",", ".")),
      quantity: parseInt(f.quantity, 10),
      notes: f.notes || null,
      photo_paths: photos,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Anúncio publicado!");
    setPhotos([]);
    setCard(null);
    setQ("");
    setF({ ...f, price: "", quantity: "1", notes: "" });
    onDone();
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-slab">
      <h2 className="text-lg font-bold">Novo anúncio</h2>
      {!card ? (
        <div className="mt-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procure a carta no catálogo (nome, número ou código)" className={i} />
          <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-5">
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setCard(h)}
                className="rounded-xl border border-border bg-background p-2.5 text-left text-xs transition hover:-translate-y-0.5 hover:border-primary"
              >
                {h.image_small && <img src={h.image_small} alt="" className="mx-auto h-28 w-auto" />}
                <p className="mt-1.5 truncate font-semibold">
                  {h.name} #{h.number}
                </p>
                <p className="truncate text-muted-foreground">{h.card_sets?.name}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 grid gap-4 md:grid-cols-[120px_1fr]">
          {card.image_small && <img src={card.image_small} alt="" className="w-full rounded-lg shadow-slab" />}
          <div className="grid gap-3 md:grid-cols-3">
            <p className="flex items-center gap-2 md:col-span-3">
              <b>
                {card.name} #{card.number}
              </b>{" "}
              · {card.card_sets?.name}
              <Button type="button" variant="link" size="sm" onClick={() => setCard(null)} className="h-auto p-0">
                trocar
              </Button>
            </p>
            <label className="text-sm">
              <span className="flex items-center justify-between gap-2">
                Condição
                <ConditionGuide compact label="Guia visual" />
              </span>
              <select className={i} value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })}>
                {Object.entries(CONDITIONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Idioma
              <select className={i} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>
                {Object.entries(LANGUAGES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Acabamento
              <select className={i} value={f.finish} onChange={(e) => setF({ ...f, finish: e.target.value })}>
                {Object.entries(FINISHES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.graded} onChange={(e) => setF({ ...f, graded: e.target.checked })} />
              Carta graduada
            </label>
            {f.graded && (
              <>
                <label className="text-sm">
                  Empresa
                  <select className={i} value={f.grade_company} onChange={(e) => setF({ ...f, grade_company: e.target.value })}>
                    <option value="">—</option>
                    {["PSA", "BGS", "CGC", "TAG", "Outra"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Nota
                  <input className={i} value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} />
                </label>
              </>
            )}
            <label className="text-sm">
              Preço (R$)
              <input required inputMode="decimal" className={i} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
            </label>
            <label className="text-sm">
              Quantidade
              <input required type="number" min={1} className={i} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
            </label>
            <label className="text-sm md:col-span-3">
              Observações
              <input className={i} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </label>
            <div className="space-y-1.5 md:col-span-3">
              <p className="text-xs font-medium text-muted-foreground">
                Fotos reais da unidade (recomendado: frente e verso sob boa luz)
              </p>
              <div className="flex flex-wrap gap-3">
                {photos.map((path, idx) => (
                  <div key={`${path}-${idx}`} className="space-y-1">
                    <p className="text-[11px] font-semibold text-muted-foreground">{photoSlotLabel(idx)}</p>
                    <MediaUpload
                      sellerId={sellerId}
                      value={path}
                      onChange={(next) => setPhotos(photos.map((p, i) => (i === idx ? next : p)))}
                      label={`Trocar ${photoSlotLabel(idx).toLowerCase()}`}
                    />
                  </div>
                ))}
                {photos.length < 4 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-muted-foreground">{photoSlotLabel(photos.length)}</p>
                    <MediaUpload
                      sellerId={sellerId}
                      onChange={(path) => setPhotos([...photos, path])}
                      label={`Adicionar ${photoSlotLabel(photos.length).toLowerCase()}`}
                    />
                  </div>
                )}
              </div>
            </div>
            <Button disabled={busy} className="rounded-full md:col-span-3">
              {busy ? "Publicando…" : "Publicar anúncio"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function ShipmentControl({
  item,
  onDone,
}: {
  item: { id: string; status: string; tracking_code: string | null; shipping_carrier: string | null };
  onDone: () => void;
}) {
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("mark_item_shipped", { _item_id: item.id, _carrier: carrier, _tracking: tracking });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Envio registrado");
      onDone();
    }
  };
  if (item.status !== "pending")
    return (
      <span className="text-xs">
        {item.status === "delivered" ? "Recebimento confirmado" : item.status === "cancelled" ? "Cancelado" : "Enviado"}
        <br />
        {item.shipping_carrier} {item.tracking_code}
      </span>
    );
  return (
    <div className="min-w-40 space-y-1">
      <input
        aria-label="Transportadora"
        placeholder="Transportadora"
        value={carrier}
        onChange={(e) => setCarrier(e.target.value)}
        className="w-full rounded border border-input bg-card px-2 py-1 text-xs"
      />
      <input
        aria-label="Código de rastreio"
        placeholder="Código de rastreio"
        value={tracking}
        onChange={(e) => setTracking(e.target.value)}
        className="w-full rounded border border-input bg-card px-2 py-1 text-xs"
      />
      <Button size="sm" disabled={busy || !carrier.trim() || !tracking.trim()} onClick={send}>
        Registrar envio
      </Button>
    </div>
  );
}
