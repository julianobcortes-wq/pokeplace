import { getChannel, listChannels } from "./registry";
import type {
  ChannelConnection,
  ChannelSnapshot,
  NormalizedListing,
  NormalizedOrder,
  SyncCursor,
} from "./types";

const connections = new Map<string, ChannelConnection>();

function key(sellerId: string, channelId: string) {
  return `${sellerId}:${channelId}`;
}

function idle(): SyncCursor {
  return { state: "idle", cursor: null, lastSyncAt: null, count: 0, message: null };
}

export function emptyConnection(sellerId: string, channelId: string): ChannelConnection {
  return {
    channelId,
    sellerId,
    status: "disconnected",
    mode: "mock",
    externalSellerId: null,
    connectedAt: null,
    catalog: idle(),
    orders: idle(),
    lastError: null,
  };
}

export function getConnection(sellerId: string, channelId: string): ChannelConnection {
  return connections.get(key(sellerId, channelId)) ?? emptyConnection(sellerId, channelId);
}

export function listSnapshots(sellerId: string): ChannelSnapshot[] {
  return listChannels().map((channel) => ({
    ...channel,
    connection: getConnection(sellerId, channel.id),
  }));
}

/**
 * Local mock connect. Does not read secrets, exchange codes, or call the channel.
 * Live OAuth stays off until a credentialed adapter is approved.
 */
export function connectChannel(sellerId: string, channelId: string): ChannelConnection {
  const channel = getChannel(channelId);
  if (!channel) throw new Error("Canal desconhecido");
  const next: ChannelConnection = {
    ...emptyConnection(sellerId, channelId),
    status: "connected",
    mode: "mock",
    externalSellerId: `mock-${channelId}`,
    connectedAt: new Date().toISOString(),
    lastError: null,
  };
  connections.set(key(sellerId, channelId), next);
  return next;
}

export function disconnectChannel(sellerId: string, channelId: string): ChannelConnection {
  if (!getChannel(channelId)) throw new Error("Canal desconhecido");
  const next = emptyConnection(sellerId, channelId);
  connections.set(key(sellerId, channelId), next);
  return next;
}

/** Synthetic catalog. Same ids on every run so a second sync does not duplicate. */
export function mockListings(channelId: string): NormalizedListing[] {
  return [
    {
      externalId: `${channelId}:sku-charizard-base`,
      title: "Charizard Base Set (fixture)",
      sku: "FIXTURE-CHAR-001",
      currency: "BRL",
      priceMinor: 250000,
      quantity: 1,
      synthetic: true,
    },
    {
      externalId: `${channelId}:sku-booster-sv`,
      title: "Booster Scarlet & Violet (fixture)",
      sku: "FIXTURE-BST-002",
      currency: "BRL",
      priceMinor: 2490,
      quantity: 12,
      synthetic: true,
    },
  ];
}

export function mockOrders(channelId: string): NormalizedOrder[] {
  return [
    {
      externalId: `${channelId}:order-1001`,
      status: "paid",
      currency: "BRL",
      totalMinor: 2490,
      createdAt: "2026-01-15T15:00:00.000Z",
      synthetic: true,
    },
  ];
}

export function syncCatalog(sellerId: string, channelId: string): ChannelConnection {
  return sync(sellerId, channelId, "catalog", mockListings(channelId).length);
}

export function syncOrders(sellerId: string, channelId: string): ChannelConnection {
  return sync(sellerId, channelId, "orders", mockOrders(channelId).length);
}

function sync(
  sellerId: string,
  channelId: string,
  kind: "catalog" | "orders",
  count: number,
): ChannelConnection {
  const current = getConnection(sellerId, channelId);
  if (current.status !== "connected") {
    const failed: ChannelConnection = {
      ...current,
      [kind]: {
        state: "failed",
        cursor: null,
        lastSyncAt: null,
        count: 0,
        message: "Conecte o canal antes de sincronizar.",
      },
    };
    connections.set(key(sellerId, channelId), failed);
    return failed;
  }
  const next: ChannelConnection = {
    ...current,
    [kind]: {
      state: "ok",
      cursor: "fixture-page-1",
      lastSyncAt: new Date().toISOString(),
      count,
      message: "Fixture sintética. Nenhuma chamada externa.",
    },
  };
  connections.set(key(sellerId, channelId), next);
  return next;
}

export function resetChannelHub(): void {
  connections.clear();
}
