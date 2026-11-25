import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/format";
import {
  connectSellerChannel,
  disconnectSellerChannel,
  listChannelSnapshots,
  syncSellerCatalog,
  syncSellerOrders,
} from "@/lib/channels/functions";
import type { ChannelSnapshot } from "@/lib/channels/types";

export const Route = createFileRoute("/canais")({
  validateSearch: (search: Record<string, unknown>) => ({
    seller: typeof search.seller === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(search.seller) ? search.seller : "loja-local",
  }),
  loaderDeps: ({ search }) => ({ seller: search.seller }),
  loader: ({ deps }) => listChannelSnapshots({ data: { sellerId: deps.seller } }),
  head: () => ({
    meta: [
      { title: `Canais | ${BRAND.name}` },
      { name: "description", content: "Conecte marketplaces e acompanhe o status de catálogo e pedidos. Modo local usa fixtures, sem credenciais." },
    ],
  }),
  component: ChannelsPage,
});

const STATUS: Record<string, string> = {
  disconnected: "Desconectado",
  connected: "Conectado (mock)",
  error: "Erro",
};

function ChannelsPage() {
  const initial = Route.useLoaderData();
  const { seller } = Route.useSearch();
  const [rows, setRows] = useState<ChannelSnapshot[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, action: "connect" | "disconnect" | "catalog" | "orders") => {
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
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <section className="rounded-md bg-card p-5 shadow-sm">
          <h1 className="text-2xl font-semibold">Canais de venda</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Hub para ligar Mercado Livre, Shopee, Amazon, Magalu, Americanas, TikTok Shop, TCGplayer e novos canais no mesmo lugar.
            Esta versão não chama as APIs: conectar marca o canal como mock e a sincronização grava fixtures sintéticas na memória do processo.
            Loja local: <b>{seller}</b>.
          </p>
        </section>
        <ul className="grid gap-3">
          {rows.map((channel) => {
            const on = channel.connection.status === "connected";
            return (
              <li key={channel.id} className="rounded-md bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{channel.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {channel.region === "BR" ? "Brasil" : "Global"} · {channel.auth.replaceAll("_", " ")} · {STATUS[channel.connection.status]}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {on ? (
                      <Button variant="outline" disabled={busy !== null} onClick={() => run(channel.id, "disconnect")}>Desconectar</Button>
                    ) : (
                      <Button disabled={busy !== null} onClick={() => run(channel.id, "connect")}>Conectar</Button>
                    )}
                    <Button variant="secondary" disabled={!on || busy !== null} onClick={() => run(channel.id, "catalog")}>Sincronizar catálogo</Button>
                    <Button variant="secondary" disabled={!on || busy !== null} onClick={() => run(channel.id, "orders")}>Sincronizar pedidos</Button>
                  </div>
                </div>
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Catálogo</dt>
                    <dd>{channel.connection.catalog.count} itens · {channel.connection.catalog.state}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Pedidos</dt>
                    <dd>{channel.connection.orders.count} · {channel.connection.orders.state}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Variáveis</dt>
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
