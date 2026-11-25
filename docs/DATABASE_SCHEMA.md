# Esquema de dados

| Tabela | Função |
|---|---|
| markets | Mercados (BR, US, CA, MX, GB, EU, JP) com moeda/idioma |
| card_sets, cards | Catálogo global canônico |
| price_observations | Preços com proveniência: fonte, tipo (venda/market/anúncio), mercado, moeda, idioma, acabamento, condição, graduação, data |
| sellers, seller_status_log | Inscrição de vendedores e histórico auditável da curadoria |
| listings | Ofertas de lojas vinculadas à carta canônica |
| orders, order_items, payments | Pedido, itens com comissão/valor do vendedor, pagamento (sandbox/live) — separados e conciliáveis |
| plans, entitlements, plan_entitlements, plan_prices, subscriptions | Assinaturas por direitos; preços por mercado/moeda/ciclo definidos pela administração |
| user_roles, profiles | Papéis e preferências (mercado, idioma, moeda) |
| platform_settings | Comissão e identidade da marca |

Funções: `place_order`, `admin_set_seller_status`, `get_card_offers`, `get_price_history`, `has_entitlement`, `has_role`.
