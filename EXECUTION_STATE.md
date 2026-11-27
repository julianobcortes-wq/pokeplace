# Estado de Execução Autônoma — PokePlace

- **Timestamp (UTC)**: 2026-11-27T20:25:30Z
- **Branch atual**: `cursor/complete-marketplace-3347`
- **Fase atual**: Fase 3 — Logística por UF, Etiqueta de Envio, E-mails Transacionais Resend, Cron Unificado e Mercado Pago Completo (Split, Estorno, Conciliação, Webhook Idempotente)
- **Último marco concluído**: Fase 2 concluída (`0015_offers_coupons_promotions_shipping_uf.sql`, `offers.ts`, `promotions.ts`, `shipping.ts`, `OfferModal.tsx`, `OffersInbox.tsx`, `SellerPromotions.tsx`, `carrinho.tsx` com frete UF + cupons + volume + `place_order_v2`, 102/102 testes verdes).
- **Próximo passo exato**:
  1. SQL `0016_mp_reconciliation_refunds_cron.sql` em `scripts/sql/all-migrations.sql` (`payment_webhook_events` idempotência, `payment_refunds`, `record_payment_refund`, `reconcile_payment_status`, `list_orders_needing_delivery_warning`).
  2. Expandir `src/lib/notify/email.ts` com templates transacionais completos via Resend (pago, enviado + link de rastreio, aviso SLA, aviso pré-confirmação de entrega, entregue, oferta aceita, alerta de preço).
  3. Expandir `src/lib/payments/mercadopago.ts`, `webhook.ts` e `functions.ts` com metadados de split/comissão, estorno via API (`refundMercadoPagoPayment`), conciliação de status, idempotência por `x-request-id`/payment_id e ações administrativas (desabilitado em produção sem credenciais).
  4. Criar `/api/cron/orders-maintenance` em `src/server.ts` + `src/lib/ops/orders-cron.ts`.
  5. Atualizar `ShippingEditor` (`ops.tsx`) para taxas por UF + transportadora preferida, adicionar botão de etiqueta imprimível em `minha-loja.tsx` e painel de conciliação/estorno MP em `admin.tsx`.
  6. Testes unitários completos de Fase 3.
- **Testes mais recentes**: 15 suítes / 102 testes passando, `tsc --noEmit` limpo.
