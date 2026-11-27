# Estado de Execução Autônoma — PokePlace

- **Timestamp (UTC)**: 2026-11-27T20:20:00Z
- **Branch atual**: `cursor/complete-marketplace-3347`
- **Fase atual**: Fase 2 — Funcionalidades dos Compradores e Conversão (Propostas/Ofertas, Lista de Desejos com Preço-Alvo, Cupons e Promoções por Volume)
- **Último marco concluído**: Fase 1 concluída (`grading.ts`, `ConditionGuide.tsx`, `reference_percent` em `bulk-edit.ts` + `guard.functions.ts` + `BulkListingEditor.tsx`, `0014_reference_prices_rpc`, galeria frente/verso em `ListingPhotos.tsx` e `minha-loja.tsx`, 96/96 testes verdes).
- **Próximo passo exato**:
  1. SQL `0015_offers_coupons_promotions.sql` em `scripts/sql/all-migrations.sql` (`listing_offers`, `store_coupons`, `store_volume_discounts`, RPCs `submit_listing_offer`, `respond_listing_offer`, `cancel_listing_offer`, `expire_stale_offers`, `validate_store_coupon`, `get_wishlist_matches`).
  2. Módulos puros `src/lib/marketplace/offers.ts` e `src/lib/marketplace/promotions.ts`.
  3. Componentes UI (`src/components/OfferModal.tsx`, `src/components/SellerPromotions.tsx`, `src/components/OffersInbox.tsx`) integrados em `carta.$cardId.tsx`, `minha-loja.tsx`, `pedidos.index.tsx` e `carrinho.tsx`.
  4. Testes completos de propostas, cupons e descontos por volume.
- **Testes mais recentes**: 14 suítes / 96 testes passando, `tsc --noEmit` limpo.
