# Runbook — fechar o PokePlace

Ordem obrigatória. Sem `SUPABASE_SERVICE_ROLE_KEY` o agente não aplica schema no seu projeto.

## 1. Schema

1. No SQL Editor do Supabase, rode `drizzle/migrations/*.sql` em ordem (`0000` … `0011`).
2. Rode `scripts/sql/confirm_live_payment.sql`.
3. Ou: `SUPABASE_DB_URL=postgres://... bun run db:apply`.

## 2. Admin e economia

1. Crie a conta do fundador no app.
2. Edite `scripts/sql/bootstrap-admin.sql` com o `user_id` e execute (admin + comissão 8%).

## 3. Catálogo e preços

```bash
bun run catalog:import base1 jungle fossil base2 swsh7 sv3pt5 sv03.5 me01 ...
bun run prices:sync --limit=500
```

Repita `prices:sync` diariamente (cron / GitHub Action).

## 4. Segredos no Cursor (app publicado)

- `SUPABASE_*` (já ligados) + `SUPABASE_SERVICE_ROLE_KEY`
- `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET`
- `APP_PUBLIC_URL` = URL pública do app

Webhook: `POST {APP_PUBLIC_URL}/api/mercadopago/webhook`

## 5. Loop de venda

Cadastro → admin aprova loja → anúncio → carrinho → Mercado Pago → envio → recebimento → avaliação → saque Pix.

Pagamento de teste para compradores está desativado. Pedido só vira `paid` via webhook verificado do Mercado Pago.

## 6. Depois

- Resend (`RESEND_API_KEY`) para e-mails
- OAuth real dos canais (hoje mock)
- Melhor Envio / Correios
- Revisão jurídica dos textos
