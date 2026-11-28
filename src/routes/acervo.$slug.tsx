import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Layers, TrendingUp } from "lucide-react";
import { PageShell } from "@/components/SiteHeader";
import { dbRpc } from "@/lib/supabase-ext";
import { isSupabaseConfigured } from "@/lib/runtime-config";
import { isDemoMode } from "@/lib/demo-mode";
import { getDemoPublicCollection } from "@/lib/demo-data";
import { BRAND, money } from "@/lib/format";
import { conditionAdjustedPrice } from "@/lib/marketplace/portfolio";

export const Route = createFileRoute("/acervo/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Acervo @${params.slug} | ${BRAND.name}` },
      {
        name: "description",
        content: `Coleção pública de cartas Pokémon compartilhada na ${BRAND.name}.`,
      },
    ],
  }),
  component: PublicCollectionPage,
});

type PublicCardRow = {
  owner_name: string;
  share_slug: string;
  card_id: string;
  quantity: number;
  condition: string;
  card_name: string;
  card_number: string;
  image_small: string | null;
  set_name: string | null;
  ref_price_brl: number | null;
};

function PublicCollectionPage() {
  const { slug } = Route.useParams();
  const demo = isDemoMode() && !isSupabaseConfigured();
  const { data = [], isPending } = useQuery({
    queryKey: ["public-collection", slug, demo],
    enabled: isSupabaseConfigured() || demo,
    queryFn: async () => {
      if (demo) {
        return getDemoPublicCollection(slug) as PublicCardRow[];
      }
      const { data, error } = await dbRpc<PublicCardRow[]>("get_public_collection", {
        _slug: slug,
      });
      if (error) return [];
      return Array.isArray(data) ? data : [];
    },
  });

  const ownerName = data[0]?.owner_name ?? null;
  const totalCopies = data.reduce((acc, r) => acc + (r.quantity || 1), 0);
  const estTotal = data.reduce((acc, r) => {
    const p = conditionAdjustedPrice(r.ref_price_brl, r.condition);
    return acc + (p ? p * (r.quantity || 1) : 0);
  }, 0);

  return (
    <PageShell>
      <section className="grain bg-ink-glow text-ink-foreground">
        <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
          <p className="num text-[11px] uppercase tracking-[0.2em] text-holo">
            Acervo público · @{slug}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold md:text-5xl">
                {ownerName ?? "Coleção Pokémon"}
              </h1>
              <p className="mt-1 text-sm opacity-75">
                Vitrine pública opt-in compartilhada pelo colecionador.
              </p>
            </div>
            {data.length > 0 && (
              <div className="flex gap-3">
                <div className="rounded-2xl border border-ink-foreground/15 bg-ink-foreground/5 px-4 py-2.5">
                  <p className="flex items-center gap-1 text-[11px] opacity-65">
                    <Layers className="h-3.5 w-3.5" /> Cartas
                  </p>
                  <p className="num text-xl font-bold">
                    {data.length}{" "}
                    <span className="text-xs font-normal opacity-70">({totalCopies}×)</span>
                  </p>
                </div>
                {estTotal > 0 && (
                  <div className="rounded-2xl border border-ink-foreground/15 bg-ink-foreground/5 px-4 py-2.5">
                    <p className="flex items-center gap-1 text-[11px] opacity-65">
                      <TrendingUp className="h-3.5 w-3.5 text-holo" /> Valor estimado
                    </p>
                    <p className="num text-xl font-bold text-holo">{money(estTotal)}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-72 animate-pulse rounded-2xl border border-border bg-card"
              />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="dots rounded-3xl border border-dashed border-border py-14 text-center">
            <p className="font-display text-lg font-bold">Acervo não encontrado ou privado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Este colecionador ainda não ativou o compartilhamento público ou não possui cartas
              listadas.
            </p>
            <Link
              to="/colecoes"
              className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
            >
              Explorar catálogo
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.map((r) => {
              const adj = conditionAdjustedPrice(r.ref_price_brl, r.condition);
              return (
                <Link
                  key={`${r.card_id}-${r.condition}`}
                  to="/carta/$cardId"
                  params={{ cardId: r.card_id }}
                  className="group flex flex-col rounded-2xl border border-border bg-card p-4 shadow-slab transition hover:-translate-y-0.5 hover:border-primary/40"
                >
                  <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-muted/50 p-3">
                    {r.image_small && (
                      <img
                        src={r.image_small}
                        alt={r.card_name}
                        className="h-full w-auto object-contain transition group-hover:scale-105"
                      />
                    )}
                  </div>
                  <h2 className="mt-3 truncate font-semibold">
                    {r.card_name}{" "}
                    <span className="num text-xs font-normal text-muted-foreground">
                      #{r.card_number}
                    </span>
                  </h2>
                  <p className="truncate text-xs text-muted-foreground">{r.set_name}</p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="rounded bg-muted px-2 py-0.5 font-medium">
                      {r.quantity}× · {r.condition}
                    </span>
                    {adj != null && <span className="num font-bold">{money(adj)}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </PageShell>
  );
}
