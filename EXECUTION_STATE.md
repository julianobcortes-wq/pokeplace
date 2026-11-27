# Estado de Execução Autônoma — PokePlace

- **Timestamp (UTC)**: 2026-11-27T20:40:00Z
- **Branch atual**: `cursor/complete-marketplace-3347`
- **Fase atual**: Fase 6 — Analytics e Ferramentas Comerciais dos Vendedores
- **Último marco concluído**: Fase 5 concluída (`0018_portfolio_alerts_public_share.sql`, `portfolio.ts`, `CollectionActions.tsx`, `colecao.tsx` Collectr-style com P&L/set/wishlist/alertas/CSV/share LGPD, `acervo.$slug.tsx`, `carta.$cardId.tsx` estimativa por condição, `orders-cron.ts` avaliação de alertas, build + 117/117 testes verdes).
- **Próximo passo exato**:
  1. Módulo puro `src/lib/marketplace/analytics.ts`: agregação de vendas por período (`7d`/`30d`/`90d`/`all`), receita bruta, comissão, líquida, ticket médio, top cartas, valorização de estoque e `suggestListingPrice({ referenceBrl, competingPrices, condition })`.
  2. Novo componente `src/components/SellerAnalytics.tsx` conectado em `src/routes/_authenticated/minha-loja.tsx`.
  3. Botão "Preço sugerido" inteligente dentro do formulário `NewListing` em `minha-loja.tsx`.
  4. Testes `src/test/analytics-pricing.test.ts` + commit Fase 6 -> Fase 7 (auditoria final independente).
- **Testes mais recentes**: 18 suítes / 117 testes passando, `tsc --noEmit` e `npm run build` limpos.
