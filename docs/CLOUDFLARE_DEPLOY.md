# Deploy Zero-Touch — Cloudflare Workers + Supabase (PokePlace)

Todo o provisionamento de banco, Auth, build, Worker, assets estáticos, segredos, Cron Triggers e domínio permanente roda em um único comando automatizado.

## Pré-requisitos (apenas 2 segredos no ambiente)
Adicione como segredos de ambiente (nunca cole no chat ou no repositório):
1. `CLOUDFLARE_API_TOKEN` — token com permissões **Workers Scripts: Edit** e **Account Settings: Read** (e **Zone / DNS: Edit** apenas se usar domínio customizado).
2. `SUPABASE_ACCESS_TOKEN` — Personal Access Token da Supabase Management API (busca automaticamente `publishable` e `service_role`, aplica todas as migrations de forma idempotente e configura Auth Site URL + Redirect URLs).

Alternativamente para o banco, `SUPABASE_DB_URL` (ou `DATABASE_URL`) também é suportado pelo script de provisionamento.

## Execução única (tudo automatizado)

```bash
npm run deploy:production
```

O comando executa automaticamente:
1. Gera `CRON_SECRET` criptográfico (256 bits) caso não exista no ambiente.
2. Descobre o projeto Supabase (`supabase/config.toml` / Management API), busca as chaves de API, aplica `scripts/sql/all-migrations.sql` de forma idempotente (com rastreamento em `public.pokeplace_schema_migrations`) e popula o catálogo inicial caso esteja vazio.
3. Descobre `CLOUDFLARE_ACCOUNT_ID` e o subdomínio permanente `*.workers.dev` (ou usa `CLOUDFLARE_CUSTOM_DOMAIN` se definido).
4. Faz `npm run build` com `wrangler.jsonc` + plugin Nitro `server/plugins/cloudflare-cron.ts` (mesclados automaticamente em `.output/server/wrangler.json`).
5. Executa um único `wrangler deploy --secrets-file <arquivo-temporario>` que envia atomica e simultaneamente:
   - código do Worker + assets estáticos (`.output/public`)
   - todos os secrets (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `APP_PUBLIC_URL` e integrações opcionais presentes no env)
   - Cron Triggers nativos (`*/30 * * * *` -> `/api/cron/sync-prices?limit=10`, `0 * * * *` -> `/api/cron/orders-maintenance`)
   - domínio permanente (`workers_dev: true` ou `--domain <CLOUDFLARE_CUSTOM_DOMAIN>`)
6. Atualiza `site_url` e `uri_allow_list` no Supabase Auth via Management API para a URL permanente.
7. Valida HTTP `200` em `/`, `/api/health` e nos endpoints de cron.

## Validação local sem credenciais

```bash
npm run deploy:dry-run
```

## Variáveis opcionais (ativam integrações comerciais automaticamente quando presentes)
- `CLOUDFLARE_CUSTOM_DOMAIN` — domínio próprio (ex.: `pokeplace.com.br`)
- `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` — Mercado Pago (Checkout Pro / Pix + webhook HMAC em `/api/mercadopago/webhook`)
- `RESEND_API_KEY`, `RESEND_FROM` — envio real de e-mails transacionais
