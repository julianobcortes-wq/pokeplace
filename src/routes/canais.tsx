import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import {
  connectSellerChannel,
  disconnectSellerChannel,
  listChannelSnapshots,
  syncSellerCatalog,
  syncSellerOrders,
} from "@/lib/channels/functions";
import { listSnapshots } from "@/lib/channels/hub";
import type { ChannelSnapshot } from "@/lib/channels/types";

export const Route = createFileRoute("/canais")({
  validateSearch: (search: Record<string, unknown>) => {
    const raw = search["seller"];
    return {
      seller: typeof raw === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(raw) ? raw : "loja-local",
    };
  },
  loaderDeps: ({ search }) => ({ seller: search.seller }),
  loader: ({ deps }) => listSnapshots(deps.seller),
  head: () => ({
    meta: [
      { title: `Canais (Fase 2) | ${BRAND.name}` },
      { name: "description", content: "Hub multicanal em preparação para a Fase 2. Modo local usa fixtures sem credenciais externas." },
    ],
  }),
  component: ChannelsPage,
});

const STATUS: Record<string, string> = {
  disconnected: "Desconectado",
  connected: "Conectado (sandbox)",
  error: "Erro",
};

function ChannelsPage() {
  const initial = Route.useLoaderData();
  const { seller } = Route.useSearch();
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<ChannelSnapshot[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setRows(listSnapshots(seller));
  }, [seller]);

  const run = async (id: string, action: "connect" | "disconnect" | "catalog" | "orders") => {
    if (!user) {
      toast.error("Entre na conta para testar conectores");
      return;
    }
    setBusy(`${action}:${id}`);
    try {
      const data = { sellerId: seller, channelId: id };
      if (action === "connect") await connectSellerChannel({ data });
      if (action === "disconnect") await disconnectSellerChannel({ data });
      if (action === "catalog") await syncSellerCatalog({ data });
      if (action === "orders") await syncSellerOrders({ data });
      setRows(await listChannelSnapshots({ data: { sellerId: seller } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o canal");
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageShell>
      <section className="grain bg-ink-glow text-ink-foreground">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <span className="inline-block rounded-full border border-ink-foreground/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-holo">
            Fase 2 · Sandbox local
          </span>
          <h1 className="mt-3 text-3xl font-extrabold md:text-4xl">Canais externos de venda</h1>
          <p className="mt-2 max-w-3xl text-sm opacity-75">
            Integrações externas (Mercado Livre, Shopee, Amazon, Magalu, TCGplayer) estão agendadas para a Fase 2. Nesta versão o hub funciona em modo sandbox local com fixtures sintéticas para validar o fluxo sem credenciais externas. Loja: <b>{seller}</b>.
          </p>
          {!loading && !user && (
            <p className="mt-4 text-sm">
              <Link to="/auth" search={{ next: "/canais" }} className="font-semibold text-holo underline">
                Entre na conta
              </Link>{" "}
              para testar a conexão sandbox.
            </p>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <ul className="grid gap-3">
          {rows.map((channel) => {
            const on = channel.connection.status === "connected";
            return (
              <li key={channel.id} className="rounded-2xl border border-border bg-card p-5 shadow-slab">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{channel.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {channel.region === "BR" ? "Brasil" : "Global"} · {channel.auth.replaceAll("_", " ")} · {STATUS[channel.connection.status]}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {on ? (
                      <Button variant="outline" size="sm" disabled={busy !== null || !user} onClick={() => run(channel.id, "disconnect")}>
                        Desconectar
                      </Button>
                    ) : (
                      <Button size="sm" disabled={busy !== null || !user} onClick={() => run(channel.id, "connect")}>
                        Conectar (sandbox)
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" disabled={!on || busy !== null || !user} onClick={() => run(channel.id, "catalog")}>
                      Sincronizar catálogo
                    </Button>
                    <Button variant="secondary" size="sm" disabled={!on || busy !== null || !user} onClick={() => run(channel.id, "orders")}>
                      Sincronizar pedidos
                    </Button>
                  </div>
                </div>
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Catálogo</dt>
                    <dd className="num font-medium">
                      {channel.connection.catalog.count} itens · {channel.connection.catalog.state}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Pedidos</dt>
                    <dd className="num font-medium">
                      {channel.connection.orders.count} · {channel.connection.orders.state}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Variáveis previstas</dt>
                    <dd className="font-mono text-xs">{channel.env.join(", ")}</dd>
                  </div>
                </dl>
                {channel.connection.catalog.message && (
                  <p className="mt-2 text-xs text-muted-foreground">{channel.connection.catalog.message}</p>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </PageShell>
  );
}
