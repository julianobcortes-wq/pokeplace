import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Heart, Layers } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { dbTable } from "@/lib/supabase-ext";

export function CollectionActions({
  cardId,
  referenceBrl,
}: {
  cardId: string;
  referenceBrl?: number | null;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertDir, setAlertDir] = useState<"below" | "above">("below");
  const [alertPrice, setAlertPrice] = useState(
    referenceBrl && referenceBrl > 0 ? String(Math.max(1, Math.round(referenceBrl * 0.9))) : "",
  );
  const [savingAlert, setSavingAlert] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["collection-card", user?.id, cardId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collection_entries")
        .select("*")
        .eq("card_id", cardId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggle = async (kind: "owned" | "wanted") => {
    if (!user) return;
    const row = data.find((r) => r.kind === kind);
    const { error } = row
      ? await supabase.from("collection_entries").delete().eq("id", row.id)
      : await supabase
          .from("collection_entries")
          .insert({ user_id: user.id, card_id: cardId, kind });
    if (error) {
      toast.error("Não foi possível salvar");
    } else {
      toast.success(
        row
          ? kind === "owned"
            ? "Removida do seu acervo"
            : "Removida da lista de desejos"
          : kind === "owned"
            ? "Salva no seu acervo"
            : "Adicionada à lista de desejos",
      );
      await qc.invalidateQueries({ queryKey: ["collection-card"] });
      await qc.invalidateQueries({ queryKey: ["collection"] });
    }
  };

  const createAlert = async () => {
    if (!user) return;
    const n = Number(alertPrice.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Informe um preço-alvo válido em R$");
      return;
    }
    setSavingAlert(true);
    const { error } = await dbTable("price_alerts").insert({
      user_id: user.id,
      card_id: cardId,
      direction: alertDir,
      target_brl: Math.round(n * 100) / 100,
    });
    setSavingAlert(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Alerta de preço criado! Você será avisado quando atingir a meta.");
    setAlertOpen(false);
    qc.invalidateQueries({ queryKey: ["price-alerts"] });
  };

  if (!user) {
    return (
      <div className="mt-4">
        <Link
          to="/auth"
          search={{ next: `/carta/${cardId}` }}
          className="inline-flex items-center gap-2 rounded-full border border-ink-foreground/20 bg-ink-foreground/10 px-4 py-1.5 text-xs font-semibold text-ink-foreground transition hover:bg-ink-foreground/20"
        >
          <Layers className="h-3.5 w-3.5" /> Entre para salvar no seu acervo
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap gap-2">
        {(["owned", "wanted"] as const).map((kind) => {
          const active = data.some((r) => r.kind === kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggle(kind)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-ink-foreground/20 bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/20"
              }`}
            >
              {kind === "owned" ? (
                <Layers className="h-3.5 w-3.5" />
              ) : (
                <Heart className="h-3.5 w-3.5" />
              )}
              {kind === "owned"
                ? active
                  ? "Na minha coleção"
                  : "Tenho esta carta"
                : active
                  ? "Na lista de desejos"
                  : "Quero esta carta"}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setAlertOpen((o) => !o)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
            alertOpen
              ? "border-holo bg-holo/20 text-holo"
              : "border-ink-foreground/20 bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/20"
          }`}
        >
          <Bell className="h-3.5 w-3.5" /> Alerta de preço
        </button>
      </div>

      {alertOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink-foreground/20 bg-ink-foreground/10 p-3 text-xs text-ink-foreground">
          <span>Avise-me quando ficar</span>
          <select
            value={alertDir}
            onChange={(e) => setAlertDir(e.target.value as "below" | "above")}
            className="rounded-md border border-ink-foreground/20 bg-ink px-2 py-1 text-xs text-ink-foreground"
          >
            <option value="below">abaixo de</option>
            <option value="above">acima de</option>
          </select>
          <input
            type="number"
            min={0.5}
            step="0.50"
            value={alertPrice}
            onChange={(e) => setAlertPrice(e.target.value)}
            placeholder="R$"
            className="num w-24 rounded-md border border-ink-foreground/20 bg-ink px-2 py-1 text-xs text-ink-foreground"
          />
          <button
            type="button"
            disabled={savingAlert}
            onClick={createAlert}
            className="rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {savingAlert ? "Salvando…" : "Criar alerta"}
          </button>
        </div>
      )}
    </div>
  );
}
