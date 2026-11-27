import { AdminOps } from "@/components/ops";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, CircleAlert, Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SupportInbox } from "@/components/SupportInbox";
import { PageShell } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { listAdminSellers, setPlatformSetting, setSellerStatus } from "@/lib/guard.functions";
import { getAdminReadiness, runAdminCatalogImport, runAdminPriceSync, runAdminSeedCatalog } from "@/lib/ops/ops.functions";
import { BRAND, SELLER_STATUS, money } from "@/lib/format";
import type { Database as Db } from "@/integrations/supabase/types";

type Status = Db["public"]["Enums"]["seller_status"];
type Seller = Db["public"]["Tables"]["sellers"]["Row"];
type Log = Db["public"]["Tables"]["seller_status_log"]["Row"];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: `Administração | ${BRAND.name}` },
      { name: "description", content: "Curadoria de vendedores e indicadores." },
      { property: "og:title", content: "Administração" },
      { property: "og:description", content: "Painel administrativo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("submitted");
  const { data } = useQuery({
    queryKey: ["admin", filter],
    enabled: isAdmin,
    queryFn: () => listAdminSellers({ data: filter ? { status: filter as Status } : {} }),
  });

  if (loading)
    return (
      <PageShell>
        <p className="p-8 text-muted-foreground">Carregando…</p>
      </PageShell>
    );
  if (!isAdmin)
    return (
      <PageShell>
        <p className="p-8 text-muted-foreground">Acesso restrito à administração.</p>
      </PageShell>
    );

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const totals = data?.financials;
  const sellers = (data?.sellers ?? []) as Seller[];
  const logs = (data?.logs ?? []) as Log[];

  return (
    <PageShell>
      <section className="grain bg-ink-glow text-ink-foreground">
        <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
          <p className="num text-[11px] uppercase tracking-[0.2em] text-holo">Operação · {BRAND.name}</p>
          <h1 className="mt-1.5 text-3xl font-extrabold md:text-4xl">Administração</h1>
          <p className="mt-1 text-sm opacity-75">Curadoria de lojas, prontidão de produção, repasses e mediação de pedidos.</p>
        </div>
      </section>
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-7">

        <div className="grid gap-3 md:grid-cols-4">
          {[
            ["Pedidos pagos", String(totals?.paid_orders ?? 0)],
            ["GMV real", money(Number(totals?.gmv ?? 0))],
            ["Comissões reais", money(Number(totals?.commission ?? 0))],
            ["Devido às lojas", money(Number(totals?.seller_total ?? 0))],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-border bg-card p-5 shadow-slab">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="num mt-1 text-2xl font-bold">{v}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{totals?.test_orders ?? 0} pedidos de teste ou sem pagamento confirmado, excluídos dos totais.</p>
        <LaunchReadinessPanel />
        <CommissionSetting current={data?.rate ?? 0} onDone={refresh} />

        <section className="rounded-2xl border border-border bg-card p-5 shadow-slab">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Curadoria de vendedores</h2>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-full border border-input bg-background px-3 py-1.5 text-sm">
              <option value="">Todos</option>
              {Object.entries(SELLER_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {sellers.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nenhum vendedor nesta situação.</p>}
          <div className="mt-3 divide-y divide-border">
            {sellers.map((s) => (
              <SellerRow key={s.id} s={s} logs={logs.filter((l) => l.seller_id === s.id)} onDone={refresh} />
            ))}
          </div>
        </section>
        <AdminOps />
        <SupportInbox admin />
      </main>
    </PageShell>
  );
}

const IMPORT_BATCHES: Array<{ label: string; sets: string[] }> = [
  { label: "Clássicos (Base 1–3)", sets: ["base1", "base2", "base3"] },
  { label: "Era SWSH (Evolving Skies / Crown Zenith)", sets: ["swsh7", "swsh12pt5"] },
  { label: "Era SV (Base / 151 / Surging Sparks / Prismatic)", sets: ["sv1", "sv3pt5", "sv8", "sv8pt5"] },
];

function LaunchReadinessPanel() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: r, isPending } = useQuery({
    queryKey: ["admin-readiness"],
    queryFn: () => getAdminReadiness(),
  });

  const runImport = async (sets: string[], label: string) => {
    setBusy(label);
    try {
      const res = await runAdminCatalogImport({ data: { setIds: sets } });
      toast.success(`Importado: ${res.importedSets.join(", ")} (${res.importedCards} cartas)`);
      await qc.invalidateQueries({ queryKey: ["admin-readiness"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao importar catálogo");
    } finally {
      setBusy(null);
    }
  };

  const runSeedFull = async () => {
    setBusy("seed-full");
    try {
      const res = await runAdminSeedCatalog();
      toast.success(`Catálogo completo importado: ${res.importedSets} coleções e ${res.importedCards} cartas`);
      await qc.invalidateQueries({ queryKey: ["admin-readiness"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao importar catálogo completo");
    } finally {
      setBusy(null);
    }
  };

  const runPrices = async () => {
    setBusy("prices");
    try {
      const res = await runAdminPriceSync({ data: { limit: 10 } });
      toast.success(`Sincronizadas ${res.inserted} cotações de ${res.checked} cartas`);
      await qc.invalidateQueries({ queryKey: ["admin-readiness"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao sincronizar preços");
    } finally {
      setBusy(null);
    }
  };

  const items = r
    ? [
        ["Supabase público (URL + chave)", r.checks.supabasePublic],
        ["Supabase Service Role", r.checks.supabaseAdmin],
        ["Schema aplicado (all-migrations.sql)", r.checks.schemaApplied],
        [`Catálogo importado (${r.counts.sets} sets · ${r.counts.cards} cartas)`, r.checks.catalogSeeded],
        [`Preços TCGdex (${r.counts.priceObservations} observações)`, r.checks.pricesSynced],
        ["Mercado Pago (MP_ACCESS_TOKEN)", r.checks.mercadoPago],
        ["Webhook HMAC (MP_WEBHOOK_SECRET)", r.checks.webhookSecret],
        ["URL pública (APP_PUBLIC_URL)", r.checks.publicUrl],
        ["Modo teste desativado", r.checks.sandboxDisabled],
        ["E-mail Resend (opcional)", r.checks.emailConfigured],
      ] as const
    : [];

  const coreReadyWithoutPayment = Boolean(
    r?.checks.supabasePublic && r?.checks.supabaseAdmin && r?.checks.schemaApplied && r?.checks.catalogSeeded,
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-slab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="num text-[11px] uppercase tracking-[0.2em] text-primary">Go-Live</p>
          <h2 className="text-lg font-bold">Prontidão para produção</h2>
        </div>
        {r && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              r.ready
                ? "bg-success/15 text-success"
                : coreReadyWithoutPayment
                  ? "bg-primary/15 text-primary"
                  : "bg-chart-4/20 text-foreground"
            }`}
          >
            {r.ready
              ? "Pronto para operar"
              : coreReadyWithoutPayment
                ? "Core pronto · pagamento pendente"
                : "Pendências externas"}
          </span>
        )}
      </div>

      {isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Verificando integrações…</p>
      ) : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {items.map(([label, ok]) => (
              <div
                key={label}
                className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${
                  ok ? "border-success/30 bg-success/5" : "border-border bg-muted/50"
                }`}
              >
                {ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className={ok ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button
              size="sm"
              disabled={busy !== null || !r?.checks.schemaApplied}
              onClick={runSeedFull}
            >
              <Database className="h-3.5 w-3.5" />
              {busy === "seed-full" ? "Importando 3.864 cartas…" : "Importar catálogo completo (22 coleções · 3.864 cartas)"}
            </Button>
            {IMPORT_BATCHES.map((b) => (
              <Button
                key={b.label}
                size="sm"
                variant="outline"
                disabled={busy !== null || !r?.checks.schemaApplied}
                onClick={() => runImport(b.sets, b.label)}
              >
                <Database className="h-3.5 w-3.5" />
                {busy === b.label ? "Importando…" : `Importar ${b.label}`}
              </Button>
            ))}
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null || !r?.checks.catalogSeeded}
              onClick={runPrices}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy === "prices" ? "animate-spin" : ""}`} />
              {busy === "prices" ? "Sincronizando…" : "Sincronizar preços TCGdex"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function CommissionSetting({ current, onDone }: { current: number; onDone: () => void }) {
  const [v, setV] = useState("");
  const save = async () => {
    const n = Number(v.replace(",", ".")) / 100;
    if (!(n >= 0 && n < 1)) {
      toast.error("Informe um percentual entre 0 e 99");
      return;
    }
    try {
      await setPlatformSetting({ data: { key: "commission_rate", value: n } });
      toast.success("Comissão atualizada");
      setV("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Acesso negado");
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm shadow-slab">
      <span>
        Comissão do marketplace: <b className="num">{(current * 100).toFixed(2)}%</b>
        {current === 0 && " (ainda não definida)"}
      </span>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="novo %" className="num w-24 rounded-lg border border-input bg-background px-2.5 py-1.5" />
      <Button size="sm" variant="secondary" onClick={save}>
        Salvar
      </Button>
      <span className="text-xs text-muted-foreground">Vale para novos pedidos.</span>
    </div>
  );
}

function SellerRow({ s, logs, onDone }: { s: Seller; logs: Log[]; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const act = async (status: Status, official?: boolean) => {
    try {
      await setSellerStatus({ data: { sellerId: s.id, status, note, ...(official === undefined ? {} : { official }) } });
      toast.success(`Vendedor: ${SELLER_STATUS[status]}`);
      setNote("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Acesso negado");
    }
  };
  return (
    <div className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">
            {s.store_name}
            {s.is_official && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">OFICIAL</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {s.person_type} {s.document} · {s.city}/{s.state} · {s.contact_email} · {SELLER_STATUS[s.status]}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>
          {open ? "Fechar" : "Analisar"}
        </Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3 rounded-2xl bg-muted p-4 text-sm">
          <p>
            <b>Operação:</b> {s.operation_type} · <b>Volume:</b> {s.monthly_volume || "—"} · <b>Categorias:</b> {s.categories.join(", ")}
          </p>
          <p>
            <b>Histórico informado:</b> {s.sales_history || "—"}
          </p>
          <p>
            <b>Telefone:</b> {s.phone || "—"} · <b>Termos aceitos em:</b> {new Date(s.terms_accepted_at).toLocaleString("pt-BR")}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Motivo / observação da decisão (fica registrado)"
            rows={2}
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => act("approved")}>
              Aprovar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => act("info_requested")}>
              Pedir documentação
            </Button>
            <Button size="sm" variant="outline" onClick={() => act("rejected")}>
              Rejeitar
            </Button>
            <Button size="sm" variant="outline" onClick={() => act("suspended")}>
              Suspender
            </Button>
            <Button size="sm" variant="destructive" onClick={() => act("blocked")}>
              Bloquear
            </Button>
            <Button size="sm" variant="outline" onClick={() => act(s.status, !s.is_official)}>
              {s.is_official ? "Remover selo oficial" : "Marcar como loja oficial"}
            </Button>
          </div>
          <div>
            <p className="font-semibold">Histórico de decisões</p>
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem decisões ainda.</p>
            ) : (
              logs.map((l) => (
                <p key={l.id} className="text-xs">
                  {new Date(l.created_at).toLocaleString("pt-BR")} — {l.from_status ? SELLER_STATUS[l.from_status] : "—"} → <b>{SELLER_STATUS[l.to_status]}</b>
                  {l.note ? `: ${l.note}` : ""}
                </p>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
