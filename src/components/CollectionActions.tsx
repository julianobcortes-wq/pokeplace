import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Layers } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function CollectionActions({ cardId }: { cardId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["collection-card", user?.id, cardId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("collection_entries").select("*").eq("card_id", cardId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggle = async (kind: "owned" | "wanted") => {
    if (!user) return;
    const row = data.find((r) => r.kind === kind);
    const { error } = row
      ? await supabase.from("collection_entries").delete().eq("id", row.id)
      : await supabase.from("collection_entries").insert({ user_id: user.id, card_id: cardId, kind });
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
    <div className="mt-4 flex flex-wrap gap-2">
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
            {kind === "owned" ? <Layers className="h-3.5 w-3.5" /> : <Heart className="h-3.5 w-3.5" />}
            {kind === "owned" ? (active ? "Na minha coleção" : "Tenho esta carta") : active ? "Na lista de desejos" : "Quero esta carta"}
          </button>
        );
      })}
    </div>
  );
}
