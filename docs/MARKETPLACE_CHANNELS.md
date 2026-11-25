# Canais de marketplace

O hub em `/canais` é o ponto único para o vendedor ligar canais externos. O domínio vive em `src/lib/channels` e não chama HTTP de marketplace.

Cada canal tem status de conexão (`disconnected`, `connected`, `error`), modo (`mock` nesta versão) e cursores separados de catálogo e pedidos. Uma segunda sincronização regrava as mesmas fixtures (`externalId` estável), sem duplicar.

Canais embutidos: Mercado Livre, Shopee, Amazon, Magalu, Americanas, TikTok Shop e TCGplayer. `registerChannel` acrescenta outro sem alterar os embutidos.

Contratos públicos usados só como formato futuro:

- Mercado Livre: OAuth em `auth.mercadolivre.com.br` e token em `api.mercadolibre.com/oauth/token`; itens em `/users/{id}/items/search`; pedidos em `/orders/search`.
- Shopee: `auth_partner`, `product/get_item_list`, `order/get_order_list`, assinatura HMAC de parceiro.
- Amazon SP-API: LWA, Listings Items `2021-08-01`, Orders `v0`. Marketplace do Brasil `A2Q3Y263D00KWC`.
- Magalu: token em `id.magalu.com` e recursos de SKU/pedidos do seller. Conferir o portal atual antes de implementar o cliente.
- Americanas: API SkyHub com `X-User-Email`, `X-Api-Key` e `X-Accountmanager-Key` em `/products` e `/orders`.
- TikTok Shop: OAuth `auth.tiktok-shops.com` e buscas `product/202309` e `order/202309`.
- TCGplayer: `POST /token` com public/private key e catálogo/pedidos em `api.tcgplayer.com` v1.39.0. A cotação exibida na carta vem da TCGdex (que publica o market price do TCGplayer), não deste conector.

Nenhum adaptador live existe. Credenciais ausentes não são inventadas. A tabela proposta está em `drizzle/migrations/0011_marketplace_channels.sql` e ainda não é aplicada: o estado desta versão fica na memória do processo.
