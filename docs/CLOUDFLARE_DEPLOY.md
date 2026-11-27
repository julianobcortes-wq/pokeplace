# Guia de Deploy Permanente — Cloudflare Workers (PokePlace)

Este projeto usa TanStack Start + Vite + Nitro com o preset `cloudflare-module` já configurado automaticamente pelo `@lovable.dev/vite-tanstack-config`. Ao rodar `npm run build`, o build gera:
- `.output/server/wrangler.json` (configuração completa do Worker + assets estáticos de `.output/public`)
- `.wrangler/deploy/config.json` (apontando para `.output/server/wrangler.json`)

## 1. Conectar o Repositório no Dashboard da Cloudflare (2 minutos)
1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com) -> **Workers & Pages** -> **Create** -> **Import a repository**.
2. Selecione o repositório `julianobcortes-wq/pokeplace` e a branch de produção `main`.
3. Configure os comandos de build:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
   - **Root directory**: `/` (raiz)
   - **Node version**: `20` ou `22` (variável `NODE_VERSION=22`)
4. Salve e inicie o primeiro deploy. Toda atualização na `main` fará deploy automático em uma URL permanente `https://<seu-worker>.workers.dev` (ou domínio customizado, ex. `pokeplace.com.br`).

## 2. Variáveis de Ambiente e Secrets no Cloudflare Worker
Em **Settings -> Variables and Secrets**, adicione:

### Obrigatórias para funcionar o marketplace em produção
| Variável | Tipo | Descrição |
|---|---|---|
| `SUPABASE_URL` | Plaintext | URL do projeto Supabase (`https://<ref>.supabase.co`) |
| `SUPABASE_PUBLISHABLE_KEY` | Plaintext | Chave pública/anon do Supabase |
| `SUPABASE_PROJECT_ID` | Plaintext | ID do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Service Role Key do Supabase (usada apenas no servidor: webhooks, cron, admin) |
| `APP_PUBLIC_URL` | Plaintext | URL pública final (ex.: `https://pokeplace.com.br` ou `https://<worker>.workers.dev`) |
| `CRON_SECRET` | Secret | Segredo aleatório (32+ chars) exigido no header `x-cron-secret` dos endpoints `/api/cron/*` |

> Nota: Para variáveis públicas injetadas no bundle Vite em tempo de build, configure também `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID` como Build Variables na Cloudflare.

### Opcionais (Integrações Comerciais — ativam recursos automaticamente quando definidas)
| Variável | Tipo | Descrição |
|---|---|---|
| `RESEND_API_KEY` | Secret | Chave da API Resend para envio real de e-mails transacionais |
| `RESEND_FROM` | Plaintext | Remetente verificado no Resend (ex.: `PokePlace <avisos@pokeplace.com.br>`) |
| `MP_ACCESS_TOKEN` | Secret | Access Token do Mercado Pago (Checkout Pro + estornos + conciliação) |
| `MP_WEBHOOK_SECRET` | Secret | Assinatura secreta do Webhook no painel Mercado Pago (validação HMAC fail-closed) |

> Segurança: Sem `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`, pagamentos reais permanecem desabilitados em produção e webhooks são recusados com erro de configuração. Nunca habilite pagamentos simulados em produção.

## 3. Aplicar o Banco de Dados no Supabase
1. Abra o **SQL Editor** no painel do Supabase.
2. Cole e execute o conteúdo completo de `scripts/sql/all-migrations.sql` (o arquivo é 100% idempotente e pode ser reexecutado com segurança após atualizações).
3. Opcional: defina o primeiro administrador executando:
   ```sql
   insert into public.user_roles (user_id, role)
   values ('<SEU_USER_UUID>', 'admin')
   on conflict do nothing;
   ```

## 4. Configurar Tarefas Agendadas (Cron)
Agende chamadas POST (via Cloudflare Cron Trigger, GitHub Actions ou cron externo) com o header `x-cron-secret: <CRON_SECRET>`:
- **A cada 30 minutos**: `POST https://<dominio>/api/cron/sync-prices` (atualiza cotações de mercado em lotes seguros de até 10 cartas).
- **A cada 1 hora**: `POST https://<dominio>/api/cron/orders-maintenance` (expira pedidos vencidos devolvendo estoque, expira ofertas vencidas de 48h, confirma entregas após 7 dias, envia avisos pré-confirmação e avalia alertas de preço).

## 5. Webhook do Mercado Pago
Quando ativar pagamentos reais:
1. No painel de desenvolvedores do Mercado Pago, cadastre a URL de webhook:
   `https://<dominio>/api/mercadopago/webhook`
2. Ative o tópico `payment` (e opcionalmente `chargebacks` / `merchant_order`).
3. Copie o segredo gerado para a variável `MP_WEBHOOK_SECRET` na Cloudflare.
4. Teste a saúde geral em `GET https://<dominio>/api/health`.
