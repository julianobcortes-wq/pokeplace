import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/conta")({
  head: () => ({
    meta: [
      { title: `Minha conta | ${BRAND.name}` },
      { name: "description", content: "Seus dados, privacidade e exclusão de conta." },
      { property: "og:title", content: "Minha conta" },
      { property: "og:description", content: "Gerencie seus dados no PokePlace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Account,
});

function Account() {
  const [reason, setReason] = useState("");
  const { data, refetch } = useQuery({
    queryKey: ["account"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: del } = await supabase.from("account_deletion_requests").select("*").maybeSingle();
      return { user: u.user, del };
    },
  });

  const exportData = async () => {
    const [orders, items, collection, tickets, messages] = await Promise.all([
      supabase.from("orders").select("*"),
      supabase.from("order_items").select("*"),
      supabase.from("collection_entries").select("*"),
      supabase.from("support_tickets").select("*"),
      supabase.from("order_messages").select("*"),
    ]);
    const blob = new Blob(
      [
        JSON.stringify(
          {
            email: data?.user?.email,
            orders: orders.data,
            items: items.data,
            collection: collection.data,
            tickets: tickets.data,
            messages: messages.data,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "meus-dados-pokeplace.json";
    a.click();
  };

  const requestDelete = async () => {
    if (!data?.user || !confirm("Pedir a exclusão definitiva da sua conta?")) return;
    const { error } = await supabase.from("account_deletion_requests").insert({ user_id: data.user.id, reason: reason || null });
    if (error) toast.error(error.message);
    else {
      toast.success("Pedido de exclusão registrado");
      refetch();
    }
  };

  return (
    <PageShell>
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-8">
        <div>
          <p className="num text-[11px] uppercase tracking-[0.2em] text-primary">LGPD & Privacidade</p>
          <h1 className="mt-1 text-3xl font-extrabold">Minha conta</h1>
        </div>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-slab">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">E-mail conectado</p>
          <p className="mt-1 font-semibold">{data?.user?.email ?? "—"}</p>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-slab">
          <h2 className="font-display text-lg font-bold">Seus dados</h2>
          <p className="mt-1 text-sm text-muted-foreground">Baixe uma cópia em JSON dos seus pedidos, coleção e mensagens.</p>
          <Button className="mt-3 rounded-full" variant="outline" onClick={exportData}>
            Baixar meus dados
          </Button>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-slab">
          <h2 className="font-display text-lg font-bold">Excluir conta</h2>
          {data?.del ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Pedido de exclusão registrado em {new Date(data.del.created_at).toLocaleDateString("pt-BR")}. Nossa equipe concluirá em até 15 dias.
            </p>
          ) : (
            <>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo (opcional)"
                rows={3}
                className="mt-3 w-full rounded-xl border border-input bg-background p-3 text-sm"
              />
              <Button className="mt-3 rounded-full" variant="destructive" onClick={requestDelete}>
                Pedir exclusão
              </Button>
            </>
          )}
        </section>
        <p className="text-xs text-muted-foreground">
          Consulte a{" "}
          <Link to="/privacidade" className="font-semibold text-primary underline">
            política de privacidade
          </Link>
          .
        </p>
      </main>
    </PageShell>
  );
}
