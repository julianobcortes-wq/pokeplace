# PokePlace

Marketplace de cartas Pokémon (TCG). O visual veio do export Lovable. Sem chaves o site abre com uma amostra de coleções e consulta preço público na TCGdex. Canais de venda (Mercado Livre, Shopee, Amazon, Magalu, Americanas, TikTok Shop e TCGplayer) ficam em modo mock.

## Como rodar

Node 22+ ou Bun.

```bash
cp .env.example .env
bun install
bun run dev
```

Sem Bun: `npm install` e `npm run dev`.

A URL sai no terminal (em geral `http://localhost:8080`).

Fluxo: **Coleções** → carta → preço de mercado, anúncio ou **Canais**.

```bash
bun run build
bun run test
```

## O que é dado real e o que é amostra

- Coleções e cartas em `src/lib/catalog/seed.json`: metadados públicos da TCGdex (nome, código, data, total oficial, imagem). São 16 coleções e uma amostra de cartas por coleção, não o set inteiro.
- Preço na página da carta: chamada a `https://api.tcgdex.net/v2/en/cards/{id}` (market price TCGplayer e médias Cardmarket 1/7/30 dias). Se a chamada falha, a tela diz que não há cotação. Nenhum preço é inventado.
- Hub `/canais`: status e sync na memória do processo, fixtures sintéticas, sem OAuth e sem HTTP de marketplace.
- Pedidos, lojas e ofertas do PokePlace: só existem com Supabase. Sem as variáveis, essas listas ficam vazias.

## Variáveis

Veja `.env.example`. Não commite `.env`.

Supabase: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` e as mesmas com prefixo `VITE_`.

Canais (nomes apenas; esta versão não usa os valores para chamar API):

| Canal | Variáveis |
| --- | --- |
| Mercado Livre | `ML_APP_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI` |
| Shopee | `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_REDIRECT_URI` |
| Amazon | `AMAZON_LWA_CLIENT_ID`, `AMAZON_LWA_CLIENT_SECRET`, `AMAZON_REFRESH_TOKEN`, `AMAZON_SELLER_ID` |
| Magalu | `MAGALU_CLIENT_ID`, `MAGALU_CLIENT_SECRET` |
| Americanas | `AMERICANAS_USER_EMAIL`, `AMERICANAS_API_KEY`, `AMERICANAS_ACCOUNT_KEY` |
| TikTok Shop | `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET` |
| TCGplayer | `TCGPLAYER_PUBLIC_KEY`, `TCGPLAYER_PRIVATE_KEY` |

A TCGdex não pede chave. Detalhe dos endpoints: `docs/MARKETPLACE_CHANNELS.md`.
