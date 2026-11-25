/** Domain model for the seller channel hub. Money is integer minor units. */

export type BuiltinChannelId =
  | "mercado_livre"
  | "shopee"
  | "amazon"
  | "magalu"
  | "americanas"
  | "tiktok_shop";

export type ConnectionStatus = "disconnected" | "connected" | "error";
export type SyncState = "idle" | "ok" | "failed";
export type ChannelMode = "mock";

export type ChannelAuthKind = "oauth_authorization_code" | "partner_hmac" | "api_key";

export type ChannelDefinition = {
  id: string;
  name: string;
  region: "BR" | "GLOBAL";
  auth: ChannelAuthKind;
  /** Env var names only. Values are never read into the UI or logs. */
  env: string[];
  docsUrl: string;
  /** Public API paths used as the contract for a future live adapter. */
  endpoints: { authorize?: string; token?: string; catalog: string; orders: string };
  builtin: boolean;
};

export type SyncCursor = {
  state: SyncState;
  cursor: string | null;
  lastSyncAt: string | null;
  count: number;
  message: string | null;
};

export type ChannelConnection = {
  channelId: string;
  sellerId: string;
  status: ConnectionStatus;
  mode: ChannelMode;
  externalSellerId: string | null;
  connectedAt: string | null;
  catalog: SyncCursor;
  orders: SyncCursor;
  lastError: string | null;
};

export type NormalizedListing = {
  externalId: string;
  title: string;
  sku: string | null;
  currency: "BRL";
  priceMinor: number;
  quantity: number;
  synthetic: true;
};

export type NormalizedOrder = {
  externalId: string;
  status: "paid" | "shipped" | "cancelled";
  currency: "BRL";
  totalMinor: number;
  createdAt: string;
  synthetic: true;
};

export type ChannelSnapshot = ChannelDefinition & {
  connection: ChannelConnection;
};
