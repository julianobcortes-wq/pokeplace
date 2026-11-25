import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Flag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { safeNotificationHref } from "@/lib/safe-url";
import { processPayout, requestSellerPayout, resolveDispute, reviewReport, setPlatformSetting } from "@/lib/guard.functions";

const f = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const box = "rounded-md bg-card p-5 shadow-sm";
const err = (e: { message: string } | null, ok?: string) => { if (e) { toast.error(e.message); return false; } if (ok) toast.success(ok); return true; };

export const DISPUTE_REASON: Record<string, string> = { not_received: "Não recebi", not_as_described: "Diferente do anúncio", damaged: "Chegou danificado", other: "Outro" };
export const DISPUTE_STATUS: Record<string, string> = { open: "Aguardando a loja", seller_responded: "Loja respondeu", escalated: "Em mediação PokePlace", resolved_refund: "Resolvido: reembolso total", resolved_partial: "Resolvido: reembolso parcial", resolved_seller: "Resolvido a favor da loja" };

/* ---------- Notificações ---------- */
export function NotificationBell({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({ queryKey: ["notifications", userId], refetchInterval: 60000, queryFn: async () => (await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [] });
  const unread = data.filter((n) => !n.read_at).length;
  const markAll = async () => { const ids = data.filter((n) => !n.read_at).map((n) => n.id); if (ids.length) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids); qc.invalidateQueries({ queryKey: ["notifications"] }); };
  return (
    <div className="relative">
      <Button variant="ghost" size="icon" aria-label="Notificações" onClick={() => { setOpen(!open); if (!open) void markAll(); }} className="relative rounded-full hover:bg-ink-foreground/10">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="num absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{unread}</span>}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-border bg-card p-2 text-foreground shadow-float">
          {data.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Nenhuma notificação.</p> : data.map((n) => (
            <a key={n.id} href={safeNotificationHref(n.link)} className="block rounded p-2 text-sm hover:bg-muted"><b>{n.title}</b>{n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}<p className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR")}</p></a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Denúncia ---------- */
export function ReportButton({ type, id }: { type: "listing" | "seller" | "question" | "review"; id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("misleading");
  const [details, setDetails] = useState("");
  const send = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Entre na sua conta para denunciar"); return; }
    const { error } = await supabase.from("reports").insert({ reporter_id: u.user.id, target_type: type, target_id: id, reason, details: details || null });
    if (error?.code === "23505") toast.info("Você já denunciou este item"); else if (err(error, "Denúncia enviada à moderação")) setOpen(false);
  };
  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"><Flag className="h-3 w-3" /> Denunciar</button>;
  return (
    <div className="mt-2 space-y-2 rounded border border-border p-2">
      <select value={reason} onChange={(e) => setReason(e.target.value)} className={f} aria-label="Motivo">
        <option value="misleading">Anúncio enganoso</option><option value="fake">Carta falsa</option><option value="prohibited">Item proibido</option><option value="off_platform">Pede pagamento por fora</option><option value="abuse">Ofensa ou abuso</option><option value="other">Outro</option>
      </select>
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} placeholder="Detalhes (opcional)" className={f} />
      <div className="flex gap-2"><Button size="sm" onClick={send}>Enviar</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button></div>
    </div>
  );
}

/* ---------- Perguntas públicas ---------- */
export function ListingQuestions({ cardId, listings }: { cardId: string; listings: { listing_id: string; store_name: string }[] }) {
  const qc = useQueryClient();
  const [listing, setListing] = useState("");
  const [q, setQ] = useState("");
  const { data = [] } = useQuery({ queryKey: ["questions", cardId], queryFn: async () => (await supabase.from("listing_questions").select("id,listing_id,question,answer,answered_at,created_at").eq("card_id", cardId).order("created_at", { ascending: false }).limit(50)).data ?? [] });
  const ask = async () => { const { error } = await supabase.rpc("ask_question", { _listing_id: listing || listings[0]!.listing_id, _question: q }); if (err(error, "Pergunta enviada à loja")) { setQ(""); qc.invalidateQueries({ queryKey: ["questions", cardId] }); } };
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-extrabold">Perguntas às lojas</h2>
      {listings.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 md:flex-row">
          <select value={listing} onChange={(e) => setListing(e.target.value)} className={`${f} md:w-56`} aria-label="Loja">{listings.map((l) => <option key={l.listing_id} value={l.listing_id}>{l.store_name}</option>)}</select>
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Escreva sua pergunta (sem telefone ou e-mail)" className={f} />
          <Button onClick={ask} disabled={q.trim().length < 5}>Perguntar</Button>
        </div>
      )}
      <div className="mt-4 divide-y divide-border">
        {data.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pergunta respondida ainda.</p>}
        {data.map((x) => (
          <div key={x.id} className="py-3 text-sm">
            <p><b>P:</b> {x.question}</p>
            {x.answer ? <p className="mt-1 text-muted-foreground"><b>R ({listings.find((l) => l.listing_id === x.listing_id)?.store_name ?? "loja"}):</b> {x.answer}</p> : <p className="mt-1 text-xs text-muted-foreground">Aguardando resposta da loja</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Comprador: ações no pedido ---------- */
type Item = { id: string; status: string; seller_id: string; delivered_at: string | null; cards?: { name: string } | null };

export function OrderBuyerActions({ order, items, sandbox }: { order: { id: string; status: string; expires_at: string | null }; items: Item[]; sandbox: boolean }) {
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["order"] });
  const paySandbox = async () => { if (err((await supabase.rpc("confirm_test_payment", { _order_id: order.id })).error, "Pagamento de teste confirmado")) refresh(); };
  const payMercadoPago = async () => {
    setPaying(true);
    try {
      const { startMercadoPagoCheckout } = await import("@/lib/payments/functions");
      const r = await startMercadoPagoCheckout({ data: { orderId: order.id } });
      window.location.href = r.checkoutUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o Mercado Pago");
      setPaying(false);
    }
  };
  const cancel = async () => { if (!confirm("Cancelar este pedido? As cartas voltam para as lojas.")) return; if (err((await supabase.rpc("cancel_order", { _order_id: order.id })).error, "Pedido cancelado")) refresh(); };
  const canCancel = ["awaiting_payment", "paid"].includes(order.status) && items.every((i) => i.status === "pending");
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {order.status === "awaiting_payment" && (
        <Button onClick={payMercadoPago} disabled={paying}>{paying ? "Abrindo Mercado Pago…" : "Pagar com Mercado Pago"}</Button>
      )}
      {order.status === "awaiting_payment" && sandbox && <Button variant="outline" onClick={paySandbox}>Pagar (simulação de teste)</Button>}
      {order.status === "awaiting_payment" && order.expires_at && <p className="text-xs text-muted-foreground">Cartas reservadas até {new Date(order.expires_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Sem pagamento, voltam para a vitrine.</p>}
      {canCancel && <Button variant="outline" onClick={cancel}>Cancelar pedido</Button>}
    </div>
  );
}

export function OrderChat({ orderId, sellerId, mine }: { orderId: string; sellerId: string; mine: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const key = ["order-chat", orderId, sellerId];
  const { data = [] } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("order_messages").select("*").eq("order_id", orderId).eq("seller_id", sellerId).order("created_at")).data ?? [] });
  const send = async () => { if (err((await supabase.rpc("send_order_message", { _order_id: orderId, _seller_id: sellerId, _body: body })).error)) { setBody(""); qc.invalidateQueries({ queryKey: key }); } };
  return (
    <details className="rounded border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Mensagens com {mine === "buyer" ? "a loja" : "o comprador"} ({data.length})</summary>
      <div className="mt-2 max-h-60 space-y-2 overflow-auto">{data.map((m) => <p key={m.id} className="rounded bg-muted p-2"><span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")}</span><br />{m.body}</p>)}</div>
      <div className="mt-2 flex gap-2"><input value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} className={f} placeholder="Mensagem (contatos externos são ocultados)" /><Button size="sm" onClick={send} disabled={!body.trim()}>Enviar</Button></div>
      <p className="mt-1 text-[11px] text-muted-foreground">Negocie sempre por aqui: pagamentos por fora não têm a proteção PokePlace.</p>
    </details>
  );
}

export function DisputeThread({ dispute, role }: { dispute: { id: string; status: string; reason: string; seller_deadline: string; resolution_note: string | null; resolution_amount: number | null }; role: "buyer" | "seller" | "admin" }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const { data = [] } = useQuery({ queryKey: ["dispute-msgs", dispute.id], queryFn: async () => (await supabase.from("dispute_messages").select("*").eq("dispute_id", dispute.id).order("created_at")).data ?? [] });
  const refresh = () => qc.invalidateQueries();
  const reply = async (escalate = false) => { if (err((await supabase.rpc("reply_dispute", { _dispute_id: dispute.id, _body: body || "Solicito mediação da PokePlace.", _escalate: escalate })).error, "Enviado")) { setBody(""); refresh(); } };
  const resolve = async (outcome: string) => {
    try {
      await resolveDispute({ data: { disputeId: dispute.id, outcome, amount: amount ? Number(amount) : 0, note: body || "Decisão da mediação" } });
      toast.success("Decisão registrada");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Acesso negado"); }
  };
  const done = dispute.status.startsWith("resolved");
  return (
    <div className="space-y-2 rounded border border-destructive/30 p-3 text-sm">
      <p><b>Problema:</b> {DISPUTE_REASON[dispute.reason]} · <b>{DISPUTE_STATUS[dispute.status]}</b></p>
      {dispute.status === "open" && <p className="text-xs text-muted-foreground">A loja tem até {new Date(dispute.seller_deadline).toLocaleString("pt-BR")} para responder.</p>}
      {done && <p className="text-xs">Decisão: {dispute.resolution_note} {Number(dispute.resolution_amount) > 0 && `· ${money(Number(dispute.resolution_amount))}`}</p>}
      <div className="max-h-56 space-y-1 overflow-auto">{data.map((m) => <p key={m.id} className="rounded bg-muted p-2"><span className="text-[11px] text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")}</span><br />{m.body}</p>)}</div>
      {!done && <>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} className={f} placeholder={role === "admin" ? "Justificativa da decisão" : "Sua mensagem"} />
        <div className="flex flex-wrap gap-2">
          {role !== "admin" && <Button size="sm" onClick={() => reply()} disabled={!body.trim()}>Responder</Button>}
          {role !== "admin" && dispute.status !== "escalated" && <Button size="sm" variant="outline" onClick={() => reply(true)}>Pedir mediação PokePlace</Button>}
          {role === "admin" && <>
            <Button size="sm" onClick={() => resolve("resolved_refund")}>Reembolso total</Button>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={0} step="0.01" placeholder="R$ parcial" className="w-28 rounded border border-input px-2 text-sm" />
            <Button size="sm" variant="outline" onClick={() => resolve("resolved_partial")} disabled={!amount}>Reembolso parcial</Button>
            <Button size="sm" variant="outline" onClick={() => resolve("resolved_seller")}>A favor da loja</Button>
            <Button size="sm" variant="ghost" onClick={() => reply()} disabled={!body.trim()}>Só comentar</Button>
          </>}
        </div>
      </>}
    </div>
  );
}

export function OpenDispute({ itemId, name }: { itemId: string; name: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("not_received");
  const [desc, setDesc] = useState("");
  const go = async () => { if (err((await supabase.rpc("open_dispute", { _item_id: itemId, _reason: reason, _description: desc })).error, "Problema aberto. A loja foi avisada.")) { setOpen(false); qc.invalidateQueries({ queryKey: ["order"] }); } };
  if (!open) return <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setOpen(true)}>Tive um problema com {name}</Button>;
  return (
    <div className="space-y-2 rounded border border-border p-3">
      <select value={reason} onChange={(e) => setReason(e.target.value)} className={f} aria-label="Motivo">{Object.entries(DISPUTE_REASON).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} minLength={10} maxLength={4000} className={f} placeholder="Descreva o que aconteceu (mínimo 10 caracteres)" />
      <div className="flex gap-2"><Button size="sm" onClick={go} disabled={desc.trim().length < 10}>Abrir problema</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button></div>
    </div>
  );
}

/* ---------- Vendedor ---------- */
export function ShippingEditor({ sellerId }: { sellerId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["shipping", sellerId], queryFn: async () => (await supabase.from("shipping_profiles").select("*").eq("seller_id", sellerId).maybeSingle()).data });
  const [v, setV] = useState<{ origin_zip: string; flat_fee: string; free_over: string; pickup: boolean; days: string } | null>(null);
  const cur = v ?? { origin_zip: data?.origin_zip ?? "", flat_fee: String(data?.flat_fee ?? 0), free_over: data?.free_over ? String(data.free_over) : "", pickup: data?.pickup_available ?? false, days: String(data?.handling_days ?? 2) };
  const save = async () => {
    const row = { seller_id: sellerId, origin_zip: cur.origin_zip || null, flat_fee: Number(cur.flat_fee) || 0, free_over: cur.free_over ? Number(cur.free_over) : null, pickup_available: cur.pickup, handling_days: Number(cur.days) || 0, updated_at: new Date().toISOString() };
    const { error } = data ? await supabase.from("shipping_profiles").update(row).eq("seller_id", sellerId) : await supabase.from("shipping_profiles").insert(row);
    if (err(error, "Frete salvo")) { setV(null); qc.invalidateQueries({ queryKey: ["shipping", sellerId] }); }
  };
  const set = (k: string, val: string | boolean) => setV({ ...cur, [k]: val });
  return (
    <section className={box}>
      <h2 className="text-lg font-semibold">Frete da loja</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <label className="text-sm">CEP de origem<input className={f} value={cur.origin_zip} onChange={(e) => set("origin_zip", e.target.value)} /></label>
        <label className="text-sm">Frete fixo (R$)<input type="number" min={0} step="0.01" className={f} value={cur.flat_fee} onChange={(e) => set("flat_fee", e.target.value)} /></label>
        <label className="text-sm">Grátis acima de (R$)<input type="number" min={0} step="0.01" className={f} value={cur.free_over} onChange={(e) => set("free_over", e.target.value)} /></label>
        <label className="text-sm">Prazo de postagem (dias úteis)<input type="number" min={0} max={30} className={f} value={cur.days} onChange={(e) => set("days", e.target.value)} /></label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={cur.pickup} onChange={(e) => set("pickup", e.target.checked)} /> Aceito retirada em mão</label>
      <Button className="mt-3" onClick={save}>Salvar frete</Button>
    </section>
  );
}

export function SellerFinance({ sellerId }: { sellerId: string }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [pix, setPix] = useState("");
  const { data } = useQuery({ queryKey: ["balance", sellerId], queryFn: async () => {
    const [b, p] = await Promise.all([supabase.rpc("get_seller_balance", { _seller_id: sellerId }), supabase.from("payout_requests").select("*").eq("seller_id", sellerId).order("created_at", { ascending: false })]);
    return { b: b.data?.[0], payouts: p.data ?? [] };
  } });
  const req = async () => {
    try {
      await requestSellerPayout({ data: { sellerId, amount: Number(amount), pixKey: pix } });
      toast.success("Saque solicitado");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["balance", sellerId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Acesso negado"); }
  };
  const b = data?.b;
  return (
    <section className={box}>
      <h2 className="text-lg font-semibold">Saldo e saques</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        {[["A liberar", b?.pending], ["Disponível", b?.available], ["Saque solicitado", b?.requested], ["Já recebido", b?.paid_out]].map(([k, v]) => <div key={String(k)} className="rounded bg-muted p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="num text-xl font-semibold">{money(Number(v ?? 0))}</p></div>)}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">O valor é liberado alguns dias após o comprador confirmar o recebimento, se não houver problema aberto. Só vendas com pagamento real contam.</p>
      <div className="mt-3 flex flex-col gap-2 md:flex-row">
        <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Valor" className={`${f} md:w-36`} />
        <input value={pix} onChange={(e) => setPix(e.target.value)} placeholder="Chave Pix para receber" className={f} />
        <Button onClick={req} disabled={!Number(amount) || pix.trim().length < 5}>Solicitar saque</Button>
      </div>
      {(data?.payouts ?? []).length > 0 && <div className="mt-3 divide-y divide-border text-sm">{data!.payouts.map((p) => <p key={p.id} className="flex justify-between py-2"><span>{new Date(p.created_at).toLocaleDateString("pt-BR")} · {{ requested: "Solicitado", paid: "Pago", rejected: "Recusado" }[p.status]}{p.admin_note ? ` · ${p.admin_note}` : ""}</span><span className="num">{money(Number(p.amount))}</span></p>)}</div>}
    </section>
  );
}

export function SellerInbox({ sellerId }: { sellerId: string }) {
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const { data } = useQuery({ queryKey: ["seller-inbox", sellerId], queryFn: async () => {
    const [q, d] = await Promise.all([
      supabase.from("listing_questions").select("id,question,answer,card_id,created_at").eq("seller_id", sellerId).is("answer", null).order("created_at"),
      supabase.from("disputes").select("*").eq("seller_id", sellerId).order("created_at", { ascending: false }),
    ]);
    return { questions: q.data ?? [], disputes: d.data ?? [] };
  } });
  const answer = async (id: string) => { if (err((await supabase.rpc("answer_question", { _question_id: id, _answer: answers[id] ?? "" })).error, "Resposta publicada")) qc.invalidateQueries({ queryKey: ["seller-inbox", sellerId] }); };
  return (
    <section className={box}>
      <h2 className="text-lg font-semibold">Perguntas e problemas</h2>
      {data?.questions.length === 0 && data?.disputes.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nada pendente.</p>}
      {data?.questions.map((q) => (
        <div key={q.id} className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <p><Link to="/carta/$cardId" params={{ cardId: q.card_id }} className="text-primary">Carta</Link> · {q.question}</p>
          <div className="flex gap-2"><input className={f} maxLength={1000} value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Resposta pública" /><Button size="sm" onClick={() => answer(q.id)} disabled={!answers[q.id]?.trim()}>Responder</Button></div>
        </div>
      ))}
      {data?.disputes.map((d) => <div key={d.id} className="mt-3"><p className="mb-1 text-xs text-muted-foreground">Pedido #{d.order_id.slice(0, 8)}</p><DisputeThread dispute={d} role="seller" /></div>)}
    </section>
  );
}

/* ---------- Administração ---------- */
export function AdminOps() {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { data } = useQuery({ queryKey: ["admin-ops"], queryFn: async () => {
    const [d, p, r, s] = await Promise.all([
      supabase.from("disputes").select("*").not("status", "like", "resolved%").order("created_at"),
      supabase.from("payout_requests").select("*, sellers(store_name)").eq("status", "requested").order("created_at"),
      supabase.from("reports").select("*").eq("status", "open").order("created_at"),
      supabase.from("platform_settings").select("key,value"),
    ]);
    return { disputes: d.data ?? [], payouts: p.data ?? [], reports: r.data ?? [], settings: Object.fromEntries((s.data ?? []).map((x) => [x.key, x.value])) as Record<string, unknown> };
  } });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-ops"] });
  const payout = async (id: string, status: string) => {
    try { await processPayout({ data: { payoutId: id, status: status === "rejected" ? "rejected" : "paid", note: notes[id] ?? "" } }); toast.success("Saque atualizado"); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Acesso negado"); }
  };
  const report = async (id: string, status: string) => {
    try { await reviewReport({ data: { reportId: id, status, note: notes[id] ?? "" } }); toast.success("Denúncia revisada"); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Acesso negado"); }
  };
  const setting = async (key: string, val: string) => {
    try { await setPlatformSetting({ data: { key, value: Number(val) } }); toast.success("Configuração salva"); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Acesso negado"); }
  };
  return (
    <>
      <section className={box}>
        <h2 className="text-lg font-semibold">Regras operacionais</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {[["payout_release_days", "Dias para liberar saldo após entrega"], ["dispute_window_days", "Dias para abrir problema após entrega"], ["new_seller_listing_limit", "Limite de anúncios de lojas novas"]].map(([k, l]) => (
            <label key={k} className="text-sm">{l}<input type="number" min={0} defaultValue={String(data?.settings[k!] ?? "")} key={String(data?.settings[k!])} onBlur={(e) => e.target.value !== String(data?.settings[k!]) && setting(k!, e.target.value)} className={f} /></label>
          ))}
        </div>
      </section>
      <section className={box}>
        <h2 className="text-lg font-semibold">Mediação de problemas ({data?.disputes.length ?? 0})</h2>
        {data?.disputes.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nenhum problema em aberto.</p>}
        <div className="mt-3 space-y-3">{data?.disputes.map((d) => <DisputeThread key={d.id} dispute={d} role="admin" />)}</div>
      </section>
      <section className={box}>
        <h2 className="text-lg font-semibold">Saques solicitados ({data?.payouts.length ?? 0})</h2>
        {data?.payouts.map((p) => (
          <div key={p.id} className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
            <span className="flex-1">{p.sellers?.store_name} · <b className="num">{money(Number(p.amount))}</b> · Pix: {p.pix_key}</span>
            <input placeholder="Observação" className="rounded border border-input px-2 py-1" value={notes[p.id] ?? ""} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} />
            <Button size="sm" onClick={() => payout(p.id, "paid")}>Marcar pago</Button><Button size="sm" variant="outline" onClick={() => payout(p.id, "rejected")}>Recusar</Button>
          </div>
        ))}
      </section>
      <section className={box}>
        <h2 className="text-lg font-semibold">Denúncias ({data?.reports.length ?? 0})</h2>
        {data?.reports.map((r) => (
          <div key={r.id} className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
            <span className="flex-1">{r.target_type} {r.target_id.slice(0, 8)} · {r.reason}{r.details ? ` · ${r.details}` : ""}</span>
            <input placeholder="Observação" className="rounded border border-input px-2 py-1" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
            <Button size="sm" onClick={() => report(r.id, "actioned")}>{r.target_type === "listing" ? "Remover anúncio" : "Procedente"}</Button><Button size="sm" variant="outline" onClick={() => report(r.id, "dismissed")}>Arquivar</Button>
          </div>
        ))}
      </section>
    </>
  );
}
