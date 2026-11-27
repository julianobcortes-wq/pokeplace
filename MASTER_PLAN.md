# PokePlace — Plano Mestre de Finalização do Marketplace

Última atualização: 2026-11-27

## Visão Geral
Plano mestre vivo para fechamento completo e comercial do marketplace **PokePlace** (TanStack Start + Vite + Nitro/Cloudflare Workers + Supabase Postgres/RLS/Storage + Mercado Pago + Resend).

## Arquitetura e Decisões Técnicas Consolidadas
- **Hospedagem permanente**: Cloudflare Workers conectado ao GitHub (`@lovable.dev/vite-tanstack-config` já gera `.output/server/wrangler.json` e `.wrangler/deploy/config.json` via `npm run build`). Guia operacional em `docs/CLOUDFLARE_DEPLOY.md`.
- **Banco de dados**: Supabase Postgres com todas as migrações idempotentes consolidadas em `scripts/sql/all-migrations.sql` (sem editar `supabase/migrations/` ou `drizzle/`).
- **Pagamentos**: Mercado Pago (checkout, split/comissão, webhook com validação HMAC fail-closed, estornos, conciliação e idempotência). Mantido desabilitado em produção até configuração das credenciais reais; nunca aprova pagamentos simulados em produção.
- **Frete**: Regras por UF (estado), frete grátis configurável acima de valor mínimo, prazo de postagem (`handling_days`), código de rastreio + transportadora + etiqueta imprimível, arquitetura pronta para integração futura de APIs logísticas.
- **E-mails transacionais**: Resend (`RESEND_API_KEY`) com fallback seguro de log quando a chave não estiver presente.

---

## Status por Fase

### Fase 0 — Arquitetura, Infraestrutura, Deploy Permanente e Segurança
- [x] Infraestrutura base, paridade visual, catálogo de 3.864 cartas e precificação BRL (`main`)
- [x] Hardening inicial de segurança, guarda de produção 503 (`src/lib/config-guard.ts`), orçamento de saída TCGdex (`src/lib/rolling-budget.ts`)
- [x] Regra permanente `.cursor/rules/autonomous-execution.mdc`
- [x] Documentação de deploy permanente na Cloudflare (`docs/CLOUDFLARE_DEPLOY.md`) e compatibilidade de `env` no Worker (`src/server.ts`)
- [x] Rate limiting em rotas públicas e sensíveis (`src/lib/rate-limit.ts` + `src/server.ts`) e headers de segurança HTTP
- [x] Correção do bug `runAdminPriceSync({ data: { limit: 10 } })` em `admin.tsx`
- [x] Verificação de ausência de arquivos SQL expostos em `public/` (`favicon.png` e `robots.txt` apenas)

### Fase 1 — Funcionalidades dos Vendedores
- [x] Curadoria de vendedores, perfil de loja e anúncios unitários
- [x] Upload em massa via CSV (`src/lib/marketplace/bulk-listing.ts`, `src/components/BulkListingUpload.tsx`)
- [x] Edição em lote de preço/estoque/status (`src/lib/marketplace/bulk-edit.ts`, `src/components/BulkListingEditor.tsx`)
- [x] Edição em lote por % sobre preço de referência BRL (`reference_percent` + RPC `get_card_reference_prices` em `0014`)
- [x] Guia visual de condições (M, NM, SP, MP, HP, D) + validação de empresas/notas de grading (PSA, BGS, CGC, TAG) no cadastro unitário e CSV (`src/lib/marketplace/grading.ts`, `src/components/ConditionGuide.tsx`)
- [x] Galeria de fotos reais por unidade com rótulos frente/verso/detalhes e navegação lightbox (`NewListing` + `ListingPhotos`)

### Fase 2 — Funcionalidades dos Compradores e Conversão
- [x] Sistema de propostas ("Fazer oferta"): envio, contra-oferta, aceite/recusa, expiração 48h, reserva de estoque automática ao aceitar (`0015`, `offers.ts`, `OfferModal.tsx`, `OffersInbox.tsx`)
- [x] RPC de correspondência de lista de desejos com preço-alvo (`get_wishlist_matches` em `0015`; UI integrada na Fase 5 em `colecao.tsx`)
- [x] Cupons de desconto por loja (`store_coupons`) + descontos progressivos por volume (`store_volume_discounts`, `promotions.ts`, `SellerPromotions.tsx`)
- [x] Carrinho e checkout exibindo frete por UF, barra de progresso de frete grátis, cupons e descontos por volume antes do pagamento (`carrinho.tsx` + `place_order_v2`)

### Fase 3 — Pedidos, Checkout, Logística, Comunicação e Mercado Pago Completo
- [ ] Frete por UF (`shipping_profiles.state_rates`), frete grátis configurável, transportadora e link de rastreio
- [ ] Etiqueta imprimível de envio para vendedores
- [ ] E-mails transacionais completos via Resend (pagamento confirmado, pedido enviado + rastreio, aviso SLA, aviso pré-confirmação de entrega, entrega confirmada, oferta aceita, alerta de preço)
- [ ] Cron unificado `/api/cron/orders-maintenance` (`expire_stale_orders`, `expire_stale_offers`, `auto_confirm_delivered_orders`, avisos de entrega e alertas de preço)
- [ ] Integração completa Mercado Pago: preferência com split/comissão, webhook idempotente (`approved`, `refunded`, `charged_back`, `cancelled`, `rejected`), estorno via API, conciliação administrativa (desativado em produção sem credenciais)

### Fase 4 — Reputação, Confiança, Disputas e Mediação
- [x] Termômetro 5 níveis, medalhas PokeLíder, strikes, CDC art. 49 (7 dias), SLA de envio, ranking opt-in `/ranking`
- [ ] Anexos de evidência (fotos) em mensagens de disputa (`dispute_messages.attachment_paths`)
- [ ] Exibição clara de prazo de resposta do vendedor e painel de decisão de mediação administrativa
- [ ] Fluxo de revisão/recurso de strikes pelo vendedor (`seller_strike_appeals`) com fila de análise no admin
- [ ] Histórico de suporte vinculado diretamente ao pedido (`pedidos.$orderId.tsx`)

### Fase 5 — Portfólio Estilo Collectr e Inteligência de Preços
- [ ] Custo de aquisição, condição, valorização total, P&L (lucro/prejuízo R$ e %) e agrupamento por coleção/set
- [ ] Histórico de preços multi-janela (7D / 30D / 90D / 365D) e comparativo estimado por condição na página da carta
- [ ] Alertas de preço (acima/abaixo de valor BRL) com avaliação em lote e notificação in-app + e-mail
- [ ] Exportação CSV da coleção e link público compartilhável opt-in (LGPD) em `/acervo/$slug`

### Fase 6 — Analytics e Ferramentas Comerciais dos Vendedores
- [ ] Painel de analytics do vendedor: vendas por período (7d/30d/90d/tudo), receita bruta/líquida após comissão, ticket médio, cartas mais vendidas, giro/valor de estoque
- [ ] Preço sugerido inteligente baseado no histórico de mercado + concorrência na mesma condição
- [ ] Promoções de volume por loja (ex.: leve 3+ cartas com X% de desconto) integradas ao carrinho e pedido

### Fase 7 — Testes, Segurança, Performance e Auditoria Final Independente
- [ ] Cobertura completa de testes unitários e de integração (jornadas comprador/vendedor/admin, pagamentos, concorrência, integridade financeira, ofertas, cupons, frete UF, portfólio, analytics, segurança)
- [ ] Auditoria de segurança (RLS, SECURITY DEFINER, HMAC webhook, proteção contra open redirect/XSS, ausência de segredos ou arquivos SQL expostos)
- [ ] Auditoria completa de UI/rotas/links/botões/TODOs e responsividade (mobile 390px e desktop 1440px)
- [ ] Correção de todos os achados e reauditoria limpa com build e testes 100% verdes

---

## Bugs Identificados
1. **[Fase 0 — CORRIGIDO]** `src/routes/_authenticated/admin.tsx` chamava `runAdminPriceSync({ data: { limit: 30 } })`, mas a validação Zod de `runAdminPriceSync` exige `limit <= 10`. Corrigido para `limit: 10`.

## Bloqueios Exclusivamente Externos (Dependem do Proprietário)
1. **Cloudflare Workers**: Conectar o repositório GitHub no dashboard da Cloudflare e cadastrar as variáveis de ambiente descritas em `docs/CLOUDFLARE_DEPLOY.md`.
2. **Supabase SQL**: Executar `scripts/sql/all-migrations.sql` no SQL Editor do projeto Supabase após o merge final para aplicar todas as novas tabelas, colunas, políticas RLS e RPCs.
3. **Credenciais de produção**: Definir `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `APP_PUBLIC_URL`, `RESEND_API_KEY`, `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` na Cloudflare (e configurar o webhook do Mercado Pago apontando para `https://<dominio>/api/mercadopago/webhook`).
4. **Cron agendado na Cloudflare**: Configurar um Cron Trigger ou GitHub Actions agendado chamando `/api/cron/sync-prices` e `/api/cron/orders-maintenance` com header `x-cron-secret`.

## Próxima Tarefa Imediata
Concluir Fase 0 (rate limiting público, correção do bug `limit: 30 -> 10` no admin, compatibilidade `env` Cloudflare no `src/server.ts`, testes de Phase 0) e seguir imediatamente para a Fase 1.
