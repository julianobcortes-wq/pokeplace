import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/SiteHeader";
import { BuyerTierBadge, Stars } from "@/components/market";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { isSupabaseConfigured } from "@/lib/runtime-config";
import { DEMO_USER, isDemoMode } from "@/lib/demo-mode";
import { loadDemoCollection, loadDemoOrders } from "@/lib/demo-data";
import { BRAND } from "@/lib/format";
import type { BuyerTier } from "@/lib/marketplace/rules";

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
  const qc = useQueryClient();
  const demo = isDemoMode() && !isSupabaseConfigured();
  const [reason, setReason] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showInRanking, setShowInRanking] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["account", demo],
    queryFn: async () => {
      if (demo) {
        return {
          user: { id: DEMO_USER.id, email: DEMO_USER.email },
          del: null,
          buyerProfile: { display_name: DEMO_USER.displayName, show_in_ranking: true },
          buyerRep: {
            completed_purchases: loadDemoOrders().length,
            rating: 5.0,
            reviews: 3,
            dispute_rate: 0,
            tier: "verificado" as BuyerTier,
          },
        };
      }
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      const [{ data: del }, bpRes, repRes] = await Promise.all([
        supabase.from("account_deletion_requests").select("*").maybeSingle(),
        uid
          ? (supabase as unknown as {
              from: (t: string) => {
                select: (s: string) => {
                  eq: (k: string, v: string) => {
                    maybeSingle: () => Promise<{ data: { display_name: string; show_in_ranking: boolean } | null }>;
                  };
                };
              };
            })
              .from("buyer_profiles")
              .select("display_name,show_in_ranking")
              .eq("user_id", uid)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        uid
          ? (supabase as unknown as {
              rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown[] | null }>;
            })
              .rpc("get_buyer_reputation", { _buyer_id: uid })
              .catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
      ]);
      const repRow = Array.isArray(repRes.data) && repRes.data[0] ? (repRes.data[0] as Record<string, unknown>) : null;
      return {
        user: u.user,
        del,
        buyerProfile: bpRes.data ?? null,
        buyerRep: repRow
          ? {
              completed_purchases: Number(repRow["completed_purchases"] ?? 0),
              rating: Number(repRow["rating"] ?? 0),
              reviews: Number(repRow["reviews"] ?? 0),
              dispute_rate: Number(repRow["dispute_rate"] ?? 0),
              tier: String(repRow["tier"] ?? "novo") as BuyerTier,
            }
          : null,
      };
    },
  });

  useEffect(() => {
    if (data?.buyerProfile) {
      setDisplayName(data.buyerProfile.display_name);
      setShowInRanking(Boolean(data.buyerProfile.show_in_ranking));
    } else if (data?.user?.email && !displayName) {
      setDisplayName(data.user.email.split("@")[0]?.slice(0, 24) ?? "Colecionador");
    }
  }, [data?.buyerProfile, data?.user?.email]);

  const saveCollectorProfile = async () => {
    if (!data?.user) return;
    const cleanName = displayName.trim();
    if (cleanName.length < 2 || cleanName.length > 40) {
      toast.error("Informe um apelido público entre 2 e 40 caracteres.");
      return;
    }
    if (demo) {
      toast.success("Preferências de perfil salvas (modo demonstração)");
      return;
    }
    setSavingProfile(true);
    const { error } = await (supabase as unknown as {
      from: (t: string) => {
        upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
      };
    })
      .from("buyer_profiles")
      .upsert(
        {
          user_id: data.user.id,
          display_name: cleanName,
          show_in_ranking: showInRanking,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    setSavingProfile(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(showInRanking ? "Perfil público ativado no Ranking de Compradores" : "Preferências de perfil salvas");
      qc.invalidateQueries({ queryKey: ["account"] });
    }
  };

  const exportData = async () => {
    if (demo) {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              email: DEMO_USER.email,
              orders: loadDemoOrders(),
              collection: loadDemoCollection(),
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "meus-dados-pokeplace-demo.json";
      a.click();
      return;
    }
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
    if (demo) {
      toast.info("No modo demonstração seus dados ficam apenas no navegador.");
      return;
    }
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold">Reputação e Ranking de Colecionadores</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sua privacidade vem primeiro (LGPD): seu e-mail nunca aparece. Você escolhe se quer participar com um apelido público.
              </p>
            </div>
            <BuyerTierBadge tier={data?.buyerRep?.tier ?? "novo"} />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-muted/60 p-3 text-center">
            <div>
              <p className="num text-xl font-bold">{data?.buyerRep?.completed_purchases ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Compras concluídas</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1">
                <p className="num text-xl font-bold">{data?.buyerRep?.reviews ? data.buyerRep.rating.toFixed(1) : "—"}</p>
                {!!data?.buyerRep?.reviews && <Stars value={data.buyerRep.rating} />}
              </div>
              <p className="text-[11px] text-muted-foreground">{data?.buyerRep?.reviews ?? 0} avaliações de lojas</p>
            </div>
            <div>
              <p className="num text-xl font-bold">{(data?.buyerRep?.dispute_rate ?? 0).toFixed(0)}%</p>
              <p className="text-[11px] text-muted-foreground">Disputas improcedentes</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="font-medium">Apelido público no ranking</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={40}
                placeholder="Ex: AshKetchumSP"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={showInRanking}
                onChange={(e) => setShowInRanking(e.target.checked)}
                className="mt-1"
              />
              <span>
                <b>Aparecer no Ranking de Compradores</b>
                <span className="block text-xs text-muted-foreground">
                  Exibe apenas seu apelido, selo de colecionador, total de compras concluídas e nota média dada pelas lojas.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button className="rounded-full" disabled={savingProfile} onClick={saveCollectorProfile}>
                Salvar perfil no ranking
              </Button>
              <Link to="/ranking" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                <Trophy className="h-4 w-4" /> Ver Ranking PokePlace →
              </Link>
            </div>
          </div>
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
