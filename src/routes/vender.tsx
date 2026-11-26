import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, ShieldCheck, Store } from "lucide-react";
import { PageShell } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/lib/runtime-config";
import { supabase } from "@/integrations/supabase/client";
import { BRAND, SELLER_STATUS } from "@/lib/format";

export const Route = createFileRoute("/vender")({
  head: () => ({
    meta: [
      { title: `Venda cartas Pokémon | ${BRAND.name}` },
      { name: "description", content: "Cadastre sua loja, passe pela curadoria e venda para colecionadores de todo o Brasil." },
      { property: "og:title", content: `Venda no ${BRAND.name}` },
      { property: "og:description", content: "Qualquer vendedor brasileiro pode se inscrever. Todos passam por curadoria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Sell,
});

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

function Sell() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const { data: seller, isLoading } = useQuery({
    queryKey: ["my-seller", user?.id],
    enabled: !!user && isSupabaseConfigured(),
    queryFn: async () => (await supabase.from("sellers").select("*").eq("user_id", user!.id).maybeSingle()).data,
  });

  return (
    <PageShell>
      <section className="grain relative overflow-hidden bg-ink-glow text-ink-foreground">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-holo opacity-15 blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-4 py-8 md:py-10">
          <p className="num text-[11px] uppercase tracking-[0.2em] text-holo">Parceiros & Colecionadores</p>
          <h1 className="mt-2 text-4xl font-extrabold md:text-5xl">Venda suas cartas no {BRAND.name}</h1>
          <p className="mt-3 max-w-2xl text-sm opacity-75 md:text-base">
            Qualquer vendedor brasileiro (CPF ou CNPJ) pode se inscrever. Toda loja passa pela curadoria para proteger os compradores. Vender não exige assinatura mensal.
          </p>
          <div className="mt-7 grid gap-3 md:grid-cols-3">
            {[
              [ClipboardCheck, "1. Inscrição", "Envie seus dados e o perfil da sua operação."],
              [CheckCircle2, "2. Curadoria", "Verificamos identificação, origem e capacidade de envio."],
              [Store, "3. Anuncie", "Escolha a carta no catálogo, informe condição, preço e estoque."],
            ].map(([I, t, d]) => {
              const Icon = I as typeof Store;
              return (
                <div key={t as string} className="rounded-2xl border border-ink-foreground/10 bg-ink-foreground/5 p-4 backdrop-blur">
                  <Icon className="h-5 w-5 text-holo" />
                  <p className="mt-2 font-display font-bold">{t as string}</p>
                  <p className="mt-1 text-xs opacity-75">{d as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-slab md:p-8">
          {loading || (user && isLoading) ? (
            <p className="text-muted-foreground">Carregando…</p>
          ) : !user ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-display text-xl font-bold">Crie sua conta para se inscrever</p>
                <p className="mt-1 text-sm text-muted-foreground">Você poderá acompanhar o andamento da curadoria e gerenciar seus anúncios no mesmo painel.</p>
              </div>
              <Link to="/auth" search={{ next: "/vender" }} className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground">
                Entrar / Criar conta
              </Link>
            </div>
          ) : seller ? (
            <div>
              <p className="num text-[11px] uppercase tracking-[0.2em] text-primary">Sua loja</p>
              <p className="mt-1 font-display text-2xl font-bold">{seller.store_name}</p>
              <p className="mt-2 text-sm">
                Situação: <b>{SELLER_STATUS[seller.status]}</b>
              </p>
              {seller.status === "approved" && (
                <Link to="/minha-loja" className="mt-4 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">
                  Ir para minha loja
                </Link>
              )}
              {seller.status === "submitted" && (
                <p className="mt-2 text-sm text-muted-foreground">Recebemos sua inscrição. Você será avisado quando a curadoria concluir a análise.</p>
              )}
            </div>
          ) : (
            <ApplyForm userId={user.id} email={user.email ?? ""} onDone={() => qc.invalidateQueries({ queryKey: ["my-seller"] })} />
          )}
        </div>
      </main>
    </PageShell>
  );
}

function ApplyForm({ userId, email, onDone }: { userId: string; email: string; onDone: () => void }) {
  const [f, setF] = useState({
    store_name: "",
    person_type: "PF",
    document: "",
    contact_email: email,
    phone: "",
    city: "",
    state: "SP",
    operation_type: "Pessoa física / colecionador",
    categories: ["Cartas avulsas"],
    monthly_volume: "",
    sales_history: "",
    terms: false,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const i = "mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.terms) {
      toast.error("Aceite os termos para continuar.");
      return;
    }
    setBusy(true);
    const slug =
      f.store_name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      userId.slice(0, 4);
    const { terms: _t, ...rest } = f;
    const { error } = await supabase
      .from("sellers")
      .insert({ ...rest, user_id: userId, slug, status: "submitted", terms_accepted_at: new Date().toISOString() });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Inscrição enviada para a curadoria!");
    onDone();
  };

  const cats = ["Cartas avulsas", "Cartas graduadas", "Produtos lacrados", "Acessórios"];

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <h2 className="font-display text-2xl font-bold">Inscrição de vendedor</h2>
        <p className="mt-1 text-xs text-muted-foreground">Dados usados exclusivamente na análise de curadoria e repasse financeiro.</p>
      </div>
      <label className="text-sm font-medium">
        Nome da loja
        <input required className={i} value={f.store_name} onChange={(e) => set("store_name", e.target.value)} />
      </label>
      <label className="text-sm font-medium">
        Tipo
        <select className={i} value={f.person_type} onChange={(e) => set("person_type", e.target.value)}>
          <option value="PF">Pessoa física (CPF)</option>
          <option value="PJ">Pessoa jurídica (CNPJ)</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        {f.person_type === "PF" ? "CPF" : "CNPJ"}
        <input required className={i} value={f.document} onChange={(e) => set("document", e.target.value.replace(/[^\d./-]/g, ""))} />
      </label>
      <label className="text-sm font-medium">
        E-mail de contato
        <input required type="email" className={i} value={f.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
      </label>
      <label className="text-sm font-medium">
        Telefone / WhatsApp
        <input className={i} value={f.phone} onChange={(e) => set("phone", e.target.value)} />
      </label>
      <div className="grid grid-cols-[1fr_92px] gap-2">
        <label className="text-sm font-medium">
          Cidade
          <input required className={i} value={f.city} onChange={(e) => set("city", e.target.value)} />
        </label>
        <label className="text-sm font-medium">
          UF
          <select className={i} value={f.state} onChange={(e) => set("state", e.target.value)}>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-sm font-medium">
        Tipo de operação
        <select className={i} value={f.operation_type} onChange={(e) => set("operation_type", e.target.value)}>
          {["Pessoa física / colecionador", "Loja física", "Loja online", "Loja física e online"].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        Volume aproximado por mês
        <input className={i} placeholder="ex.: 50 cartas" value={f.monthly_volume} onChange={(e) => set("monthly_volume", e.target.value)} />
      </label>
      <fieldset className="text-sm md:col-span-2">
        <legend className="font-medium">Categorias</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {cats.map((c) => (
            <label key={c} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={f.categories.includes(c)}
                onChange={(e) => set("categories", e.target.checked ? [...f.categories, c] : f.categories.filter((x) => x !== c))}
              />
              {c}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-sm font-medium md:col-span-2">
        Histórico de vendas (onde já vende, reputação etc.)
        <textarea rows={3} className={i} value={f.sales_history} onChange={(e) => set("sales_history", e.target.value)} />
      </label>
      <label className="flex items-start gap-2 rounded-2xl bg-muted/60 p-3.5 text-sm md:col-span-2">
        <input type="checkbox" checked={f.terms} onChange={(e) => set("terms", e.target.checked)} className="mt-1" />
        <span>
          <ShieldCheck className="mr-1 inline h-4 w-4 text-success" />
          Declaro que os produtos são originais, sigo os critérios de classificação de condição e aceito as regras do marketplace.
        </span>
      </label>
      <button
        disabled={busy}
        className="rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50 md:col-span-2"
      >
        {busy ? "Enviando…" : "Enviar para curadoria"}
      </button>
    </form>
  );
}
