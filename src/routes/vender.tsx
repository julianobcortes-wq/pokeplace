import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, Store } from "lucide-react";
import { PageShell } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
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
    enabled: !!user,
    queryFn: async () => (await supabase.from("sellers").select("*").eq("user_id", user!.id).maybeSingle()).data,
  });

  return (
    <PageShell>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Venda suas cartas no {BRAND.name}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Qualquer vendedor brasileiro, pessoa física ou jurídica, pode se inscrever. Para proteger os compradores, toda loja passa pela nossa curadoria antes de anunciar. Vender não exige assinatura.</p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[[ClipboardCheck, "1. Inscrição", "Envie seus dados e o tipo de operação."], [CheckCircle2, "2. Curadoria", "Analisamos identificação, origem dos produtos e capacidade de envio."], [Store, "3. Anuncie", "Escolha a carta no catálogo, informe condição, preço e estoque."]].map(([I, t, d]) => {
            const Icon = I as typeof Store;
            return <div key={t as string} className="rounded-md bg-card p-4 shadow-sm"><Icon className="h-6 w-6 text-primary" /><p className="mt-2 font-semibold">{t as string}</p><p className="text-sm text-muted-foreground">{d as string}</p></div>;
          })}
        </div>

        <div className="mt-8 rounded-md bg-card p-6 shadow-sm">
          {loading || (user && isLoading) ? <p>Carregando…</p>
            : !user ? (
              <div><p className="font-semibold">Crie sua conta para se inscrever.</p>
                <Link to="/auth" search={{ next: "/vender" }} className="mt-3 inline-block rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground">Entrar / Criar conta</Link></div>
            ) : seller ? (
              <div>
                <p className="text-sm text-muted-foreground">Sua loja</p>
                <p className="text-xl font-semibold">{seller.store_name}</p>
                <p className="mt-2">Situação: <b>{SELLER_STATUS[seller.status]}</b></p>
                {seller.status === "approved" && <Link to="/minha-loja" className="mt-4 inline-block rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground">Ir para minha loja</Link>}
                {seller.status === "submitted" && <p className="mt-2 text-sm text-muted-foreground">Recebemos sua inscrição. Você será avisado quando a curadoria concluir a análise.</p>}
              </div>
            ) : <ApplyForm userId={user.id} email={user.email ?? ""} onDone={() => qc.invalidateQueries({ queryKey: ["my-seller"] })} />}
        </div>
      </main>
    </PageShell>
  );
}

function ApplyForm({ userId, email, onDone }: { userId: string; email: string; onDone: () => void }) {
  const [f, setF] = useState({ store_name: "", person_type: "PF", document: "", contact_email: email, phone: "", city: "", state: "SP", operation_type: "Pessoa física / colecionador", categories: ["Cartas avulsas"], monthly_volume: "", sales_history: "", terms: false });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const i = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.terms) { toast.error("Aceite os termos para continuar."); return; }
    setBusy(true);
    const slug = f.store_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + userId.slice(0, 4);
    const { terms: _t, ...rest } = f;
    const { error } = await supabase.from("sellers").insert({ ...rest, user_id: userId, slug, status: "submitted", terms_accepted_at: new Date().toISOString() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Inscrição enviada para a curadoria!");
    onDone();
  };
  const cats = ["Cartas avulsas", "Cartas graduadas", "Produtos lacrados", "Acessórios"];
  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <h2 className="text-xl font-semibold md:col-span-2">Inscrição de vendedor</h2>
      <label className="text-sm">Nome da loja<input required className={i} value={f.store_name} onChange={(e) => set("store_name", e.target.value)} /></label>
      <label className="text-sm">Tipo
        <select className={i} value={f.person_type} onChange={(e) => set("person_type", e.target.value)}><option value="PF">Pessoa física (CPF)</option><option value="PJ">Pessoa jurídica (CNPJ)</option></select>
      </label>
      <label className="text-sm">{f.person_type === "PF" ? "CPF" : "CNPJ"}<input required className={i} value={f.document} onChange={(e) => set("document", e.target.value.replace(/[^\d./-]/g, ""))} /></label>
      <label className="text-sm">E-mail de contato<input required type="email" className={i} value={f.contact_email} onChange={(e) => set("contact_email", e.target.value)} /></label>
      <label className="text-sm">Telefone / WhatsApp<input className={i} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
      <div className="grid grid-cols-[1fr_90px] gap-2">
        <label className="text-sm">Cidade<input required className={i} value={f.city} onChange={(e) => set("city", e.target.value)} /></label>
        <label className="text-sm">UF<select className={i} value={f.state} onChange={(e) => set("state", e.target.value)}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></label>
      </div>
      <label className="text-sm">Tipo de operação
        <select className={i} value={f.operation_type} onChange={(e) => set("operation_type", e.target.value)}>
          {["Pessoa física / colecionador", "Loja física", "Loja online", "Loja física e online"].map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
      <label className="text-sm">Volume aproximado por mês<input className={i} placeholder="ex.: 50 cartas" value={f.monthly_volume} onChange={(e) => set("monthly_volume", e.target.value)} /></label>
      <fieldset className="text-sm md:col-span-2"><legend>Categorias</legend>
        <div className="mt-1 flex flex-wrap gap-4">{cats.map((c) => (
          <label key={c} className="flex items-center gap-1.5"><input type="checkbox" checked={f.categories.includes(c)} onChange={(e) => set("categories", e.target.checked ? [...f.categories, c] : f.categories.filter((x) => x !== c))} />{c}</label>
        ))}</div>
      </fieldset>
      <label className="text-sm md:col-span-2">Histórico de vendas (onde já vende, reputação etc.)<textarea rows={3} className={i} value={f.sales_history} onChange={(e) => set("sales_history", e.target.value)} /></label>
      <label className="flex items-start gap-2 text-sm md:col-span-2"><input type="checkbox" checked={f.terms} onChange={(e) => set("terms", e.target.checked)} className="mt-1" />Declaro que os produtos são originais, sigo os critérios de classificação de condição e aceito as regras do marketplace.</label>
      <button disabled={busy} className="rounded-md bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50 md:col-span-2">Enviar para curadoria</button>
    </form>
  );
}
