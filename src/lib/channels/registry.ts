import type { ChannelDefinition } from "./types";

/**
 * Built-in channels. Shapes follow public docs (Nov 2026 knowledge), not live calls.
 * Register more with `registerChannel` — that is the extension point.
 */
export const BUILTIN_CHANNELS: ChannelDefinition[] = [
  {
    id: "mercado_livre",
    name: "Mercado Livre",
    region: "BR",
    auth: "oauth_authorization_code",
    env: ["ML_APP_ID", "ML_CLIENT_SECRET", "ML_REDIRECT_URI"],
    docsUrl: "https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao",
    endpoints: {
      authorize: "https://auth.mercadolivre.com.br/authorization",
      token: "https://api.mercadolibre.com/oauth/token",
      catalog: "https://api.mercadolibre.com/users/{user_id}/items/search",
      orders: "https://api.mercadolibre.com/orders/search",
    },
    builtin: true,
  },
  {
    id: "shopee",
    name: "Shopee",
    region: "BR",
    auth: "partner_hmac",
    env: ["SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY", "SHOPEE_REDIRECT_URI"],
    docsUrl: "https://open.shopee.com/documents/v2/v2.shop.auth_partner",
    endpoints: {
      authorize: "https://partner.shopeemobile.com/api/v2/shop/auth_partner",
      catalog: "https://partner.shopeemobile.com/api/v2/product/get_item_list",
      orders: "https://partner.shopeemobile.com/api/v2/order/get_order_list",
    },
    builtin: true,
  },
  {
    id: "amazon",
    name: "Amazon",
    region: "GLOBAL",
    auth: "oauth_authorization_code",
    env: ["AMAZON_LWA_CLIENT_ID", "AMAZON_LWA_CLIENT_SECRET", "AMAZON_REFRESH_TOKEN", "AMAZON_SELLER_ID"],
    docsUrl: "https://developer-docs.amazon.com/sp-api/",
    endpoints: {
      authorize: "https://sellercentral.amazon.com.br/apps/authorize/consent",
      token: "https://api.amazon.com/auth/o2/token",
      catalog: "https://sellingpartnerapi-na.amazon.com/listings/2021-08-01/items/{sellerId}",
      orders: "https://sellingpartnerapi-na.amazon.com/orders/v0/orders",
    },
    builtin: true,
  },
  {
    id: "magalu",
    name: "Magalu",
    region: "BR",
    auth: "oauth_authorization_code",
    env: ["MAGALU_CLIENT_ID", "MAGALU_CLIENT_SECRET"],
    docsUrl: "https://developers.magalu.com/",
    endpoints: {
      token: "https://id.magalu.com/oauth/token",
      catalog: "https://api.magalu.com/seller/v1/portfolios/skus",
      orders: "https://api.magalu.com/seller/v1/orders",
    },
    builtin: true,
  },
  {
    id: "americanas",
    name: "Americanas",
    region: "BR",
    auth: "api_key",
    env: ["AMERICANAS_USER_EMAIL", "AMERICANAS_API_KEY", "AMERICANAS_ACCOUNT_KEY"],
    docsUrl: "https://desenvolvedores.americanas.com.br/",
    endpoints: {
      catalog: "https://api.skyhub.com.br/products",
      orders: "https://api.skyhub.com.br/orders",
    },
    builtin: true,
  },
  {
    id: "tiktok_shop",
    name: "TikTok Shop",
    region: "GLOBAL",
    auth: "oauth_authorization_code",
    env: ["TIKTOK_APP_KEY", "TIKTOK_APP_SECRET"],
    docsUrl: "https://partner.tiktokshop.com/docv2/page/authorization-overview-202309",
    endpoints: {
      authorize: "https://auth.tiktok-shops.com/oauth/authorize",
      token: "https://auth.tiktok-shops.com/api/v2/token/get",
      catalog: "https://open-api.tiktokglobalshop.com/product/202309/products/search",
      orders: "https://open-api.tiktokglobalshop.com/order/202309/orders/search",
    },
    builtin: true,
  },
  {
    id: "tcgplayer",
    name: "TCGplayer",
    region: "GLOBAL",
    auth: "api_key",
    env: ["TCGPLAYER_PUBLIC_KEY", "TCGPLAYER_PRIVATE_KEY"],
    docsUrl: "https://docs.tcgplayer.com/docs/getting-started",
    endpoints: {
      token: "https://api.tcgplayer.com/token",
      catalog: "https://api.tcgplayer.com/v1.39.0/catalog/products",
      orders: "https://api.tcgplayer.com/v1.39.0/stores/{storeKey}/orders",
    },
    builtin: true,
  },
];

const extensions: ChannelDefinition[] = [];

export function registerChannel(def: ChannelDefinition): void {
  if (listChannels().some((c) => c.id === def.id)) {
    throw new Error(`Canal já registrado: ${def.id}`);
  }
  extensions.push({ ...def, builtin: false });
}

export function listChannels(): ChannelDefinition[] {
  return [...BUILTIN_CHANNELS, ...extensions];
}

export function getChannel(id: string): ChannelDefinition | undefined {
  return listChannels().find((c) => c.id === id);
}

/** Test-only reset of the extension list. */
export function clearChannelExtensions(): void {
  extensions.length = 0;
}
