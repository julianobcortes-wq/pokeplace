# PokePlace — fechar o marketplace completo

Objetivo: tudo que um marketplace precisa para vender de verdade, com segurança. O que depender de decisão sua (valores, textos jurídicos) entra pronto para ativar, sem inventar números.

## 1. Pagamento online real
- Pagamento integrado do próprio Lovable (Stripe), começando em modo teste e depois real.
- Checkout com cartão e Pix; pedido só vira "pago" após confirmação automática do pagamento.
- Pedido com várias lojas: um pagamento só, valor separado por loja (comissão da PokePlace + valor do vendedor).
- Estoque reservado por 15 minutos durante o pagamento; se não pagar, volta para a vitrine.

## 2. Repasses aos vendedores
- Saldo do vendedor: "a liberar" (até o comprador confirmar recebimento ou 7 dias após entrega) e "disponível".
- Pedido de saque com dados bancários/Pix; painel administrativo aprova e registra o pagamento.
- Extrato completo para o vendedor e relatório financeiro para você.

## 3. Frete
- Cada loja define: CEP de origem, frete fixo, frete grátis acima de um valor e retirada em mão.
- Carrinho calcula frete por loja; prazo de postagem exibido nas ofertas.
- Rastreamento já existente ligado ao pedido; integração com Correios/Melhor Envio fica preparada para quando houver contrato.

## 4. Proteção ao comprador e disputas
- "Abrir problema" no pedido: não recebi, veio diferente, danificado — com fotos.
- Prazo para o vendedor responder; se não resolver, administração media e decide (reembolso total/parcial ou liberação ao vendedor).
- Cancelamento antes do envio; reembolso pelo próprio pagamento.
- Disputas perdidas e cancelamentos contam na reputação da loja.

## 5. Comunicação
- Perguntas públicas na página da carta/oferta, respondidas pela loja.
- Chat privado comprador ↔ vendedor dentro do pedido (com filtro contra troca de telefone/e-mail para evitar venda por fora).
- E-mails automáticos: pedido confirmado, pago, enviado, entregue, problema aberto, saque pago.
- Central de notificações no site.

## 6. Segurança e confiança
- Denunciar anúncio ou loja; fila de moderação no admin.
- Limite de anúncios para lojas novas até completar vendas.
- Página "Compra Garantida PokePlace" explicando as regras.

## 7. Administração
- Painel com pedidos, disputas, saques, denúncias, lojas e indicadores reais (vendas, comissão, ticket médio).
- Configuração de comissão e de prazos de liberação pelo painel.
- Seu acesso de administrador definido de forma explícita e segura (não automático).

## 8. Assinaturas (Collector Pro / Seller Pro)
- Cobrança mensal/anual pronta; ativa assim que você informar os valores.

## 9. Páginas legais e conta
- Termos de uso, privacidade (LGPD), regras do vendedor, política de reembolso — rascunhos marcados "revisar com advogado".
- Excluir conta e baixar meus dados.

## 10. Conferência final
- Testes automáticos de cada regra (estoque, repasse, disputa, comissão).
- Fluxo inteiro testado: cadastro → loja aprovada → anúncio → compra paga em teste → envio → recebimento → avaliação → saque.

## O que vou te pedir só no final
- Percentual de comissão e prazo de liberação do dinheiro.
- Valores dos planos.
- País/empresa registrada (para o pagamento real) e seu e-mail para virar administrador.

## Detalhes técnicos
- Stripe gerenciado (enable_stripe_payments), webhook em rota pública com verificação de assinatura; tabelas payouts, seller_balances, disputes, dispute_messages, order_messages, listing_questions, reports, notifications, shipping_profiles, stock_reservations.
- Regras financeiras e transições de estado em funções do banco + RLS; e-mails transacionais pelo sistema de e-mail do Lovable.
