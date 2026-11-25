import { AdminOps } from "@/components/ops";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SupportInbox } from "@/components/SupportInbox";
import { PageShell } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { setPlatformSetting, setSellerStatus } from "@/lib/guard.functions";
import { BRAND, SELLER_STATUS, money } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["seller_status"];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: `Administração | ${BRAND.name}` }, { name: "description", content: "Curadoria de vendedores e indicadores." }, { property: "og:title", content: "Administração" }, { property: "og:description", content: "Painel administrativo." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Admin,
});

function Admin() {
  const { isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("submitted");
  const { data } = useQuery({
    queryKey: ["admin", filter],
    enabled: isAdmin,
    queryFn: async () => {
      let q = supabase.from("sellers").select("*").order("created_at", { ascending: false });
      if (filter) q = q.eq("status", filter as Status);
      const [{ data: sellers }, { data: logs }, { data: orders }, { data: rate }] = await Promise.all([
        q, supabase.from("seller_status_log").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.rpc("get_marketplace_financials"),
        supabase.from("platform_settings").select("value").eq("key", "commission_rate").maybeSingle(),
      ]);
      return { sellers: sellers ?? [], logs: logs ?? [], financials: orders?.[0], rate: Number(rate?.value ?? 0) };
    },
  });
  if (loading) return <PageShell><p className="p-8">Carregando…</p></PageShell>;
  if (!isAdmin) return <PageShell><p className="p-8">Acesso restrito à administração.</p></PageShell>;
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const totals = data?.financials;


  return (
    <PageShell>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Administração</h1>
        <div className="grid gap-3 md:grid-cols-4">
          {[["Pedidos pagos", String(totals?.paid_orders ?? 0)], ["GMV real", money(Number(totals?.gmv ?? 0))], ["Comissões reais", money(Number(totals?.commission ?? 0))], ["Devido às lojas", money(Number(totals?.seller_total ?? 0))]].map(([k, v]) => (
            <div key={k} className="rounded-md bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">{k}</p><p className="text-xl font-semibold">{v}</p></div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{totals?.test_orders ?? 0} pedidos de teste ou sem pagamento confirmado, excluídos dos totais.</p>
        <CommissionSetting current={data?.rate ?? 0} onDone={refresh} />

        <section className="rounded-md bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Curadoria de vendedores</h2>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded border border-input px-2 py-1 text-sm">
              <option value="">Todos</option>{Object.entries(SELLER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {(data?.sellers ?? []).length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nenhum vendedor nesta situação.</p>}
          <div className="mt-3 divide-y divide-border">
            {(data?.sellers ?? []).map((s) => <SellerRow key={s.id} s={s} logs={(data?.logs ?? []).filter((l) => l.seller_id === s.id)} onDone={refresh} />)}
          </div>
        </section>
        <AdminOps />
        <SupportInbox admin />
      </main>
    </PageShell>
  );
}

function CommissionSetting({ current, onDone }: { current: number; onDone: () => void }) {
  const [v, setV] = useState("");
  const save = async () => {
    const n = Number(v.replace(",", ".")) / 100;
    if (!(n >= 0 && n < 1)) { toast.error("Informe um percentual entre 0 e 99"); return; }
    try {
      await setPlatformSetting({ data: { key: "commission_rate", value: n } });
      toast.success("Comissão atualizada");
      setV("");
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Acesso negado"); }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-card p-4 text-sm shadow-sm">
      <span>Comissão do marketplace: <b>{(current * 100).toFixed(2)}%</b>{current === 0 && " (ainda não definida)"}</span>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="novo %" className="w-24 rounded border border-input px-2 py-1" />
      <Button onClick={save} className="rounded bg-secondary px-3 py-1 font-semibold text-secondary-foreground">Salvar</Button>
      <span className="text-xs text-muted-foreground">Vale para novos pedidos.</span>
    </div>
  );
}

type Seller = Database["public"]["Tables"]["sellers"]["Row"];
type Log = Database["public"]["Tables"]["seller_status_log"]["Row"];

function SellerRow({ s, logs, onDone }: { s: Seller; logs: Log[]; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const act = async (status: Status, official?: boolean) => {
    try {
      await setSellerStatus({ data: { sellerId: s.id, status, note, ...(official === undefined ? {} : { official }) } });
      toast.success(`Vendedor: ${SELLER_STATUS[status]}`);
      setNote("");
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Acesso negado"); }
  };
  return (
    <div className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{s.store_name} {s.is_official && <span className="ml-1 rounded bg-primary px-1.5 text-[10px] text-primary-foreground">OFICIAL</span>}</p>
          <p className="text-xs text-muted-foreground">{s.person_type} {s.document} · {s.city}/{s.state} · {s.contact_email} · {SELLER_STATUS[s.status]}</p>
        </div>
        <Button onClick={() => setOpen(!open)} className="text-sm text-primary">{open ? "Fechar" : "Analisar"}</Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3 rounded bg-muted p-4 text-sm">
          <p><b>Operação:</b> {s.operation_type} · <b>Volume:</b> {s.monthly_volume || "—"} · <b>Categorias:</b> {s.categories.join(", ")}</p>
          <p><b>Histórico informado:</b> {s.sales_history || "—"}</p>
          <p><b>Telefone:</b> {s.phone || "—"} · <b>Termos aceitos em:</b> {new Date(s.terms_accepted_at).toLocaleString("pt-BR")}</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo / observação da decisão (fica registrado)" rows={2} className="w-full rounded border border-input bg-card px-2 py-1" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => act("approved")} className="rounded bg-primary px-3 py-1.5 font-semibold text-primary-foreground">Aprovar</Button>
            <Button onClick={() => act("info_requested")} className="rounded bg-secondary px-3 py-1.5 font-semibold text-secondary-foreground">Pedir documentação</Button>
            <Button onClick={() => act("rejected")} className="rounded bg-card px-3 py-1.5 font-semibold">Rejeitar</Button>
            <Button onClick={() => act("suspended")} className="rounded bg-card px-3 py-1.5 font-semibold">Suspender</Button>
            <Button onClick={() => act("blocked")} className="rounded bg-destructive px-3 py-1.5 font-semibold text-destructive-foreground">Bloquear</Button>
            <Button onClick={() => act(s.status, !s.is_official)} className="rounded bg-card px-3 py-1.5">{s.is_official ? "Remover selo oficial" : "Marcar como loja oficial"}</Button>
          </div>
          <div>
            <p className="font-semibold">Histórico de decisões</p>
            {logs.length === 0 ? <p className="text-xs text-muted-foreground">Sem decisões ainda.</p> : logs.map((l) => (
              <p key={l.id} className="text-xs">{new Date(l.created_at).toLocaleString("pt-BR")} — {l.from_status ? SELLER_STATUS[l.from_status] : "—"} → <b>{SELLER_STATUS[l.to_status]}</b>{l.note ? `: ${l.note}` : ""}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
