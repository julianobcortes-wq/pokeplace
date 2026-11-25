# Novo visual impressionante + perfil completo do vendedor

## Situação atual
- As ofertas mostram só o nome da loja, a cidade e o número de vendas.
- Não existe avaliação, página pública da loja nem reputação.

## 1. Vendedor completo (marketplace de verdade)
- **Página pública da loja** (`/loja/nome-da-loja`): capa, logo, descrição, cidade, data de entrada na plataforma, selo "Loja verificada" (curadoria), selo "Oficial" quando for o caso, todas as cartas à venda com busca e filtros.
- **Reputação**: nota média (1 a 5 estrelas), número de avaliações, vendas concluídas, prazo médio de envio, taxa de cancelamento, termômetro de reputação (Nova, Boa, Ótima, Excelente) calculado só com dados reais.
- **Avaliações**: só quem comprou e recebeu o pedido pode avaliar aquele pedido, uma vez só. Notas separadas para atendimento, embalagem e prazo, mais comentário. O vendedor pode responder publicamente uma vez.
- **Onde aparece**: em cada oferta da página da carta (nota, nº de avaliações, vendas, selo), no carrinho (agrupado por loja), no pedido e no painel do vendedor (avaliações recebidas e respostas).
- **Painel do vendedor**: editar logo, capa, descrição, políticas de envio e devolução.
- Lojas sem avaliações aparecem como "Loja nova" — nada de nota inventada.

## 2. Redesign completo (identidade própria, não cópia)
Mantendo papel marfim, barra tinta, vermelho "energia", detalhe holográfico e cartas em moldura "slab", elevando tudo:
- **Página inicial editorial**: grande destaque com cartas em leque com brilho holográfico que reage ao movimento do mouse/celular, busca central gigante, faixas de coleções com logos oficiais, "lojas em destaque" com reputação, cartas mais procuradas.
- **Cartões de carta**: efeito holo 3D ao passar o dedo/mouse, preço "a partir de", número de ofertas, raridade em etiqueta.
- **Página da carta**: carta grande com inclinação 3D, tabela de ofertas em cartões por loja com reputação, filtros (idioma, estado, acabamento), barra de compra fixa no celular.
- **Página da loja**: capa estilo "vitrine de colecionador".
- **Celular primeiro** (você usa no celular): menu inferior fixo (Início, Buscar, Carrinho, Conta), toques grandes, animações suaves.
- Microinterações: adicionar ao carrinho com animação, esqueletos de carregamento, transições entre páginas.

## 3. Gráfico de preços em todas as cartas (já nesta versão)
- Na página de cada carta, um gráfico bonito de histórico (3 meses grátis; períodos maiores para assinantes, como já definido).
- Mini-gráfico (tendência) nos cartões das listas e indicador de alta/queda.
- Dados **reais**: importar os preços de referência públicos (TCGplayer em dólar e Cardmarket em euro) que acompanham o catálogo, mais as vendas concluídas na própria plataforma. A fonte aparece no gráfico.
- Por pedido seu, **todas as cartas terão gráfico já nesta versão**: onde ainda não houver histórico real, entra um histórico de demonstração (12 meses, variação realista, baseado no preço de referência quando existir), com o selo "Dados demonstrativos" visível no gráfico.
- Os dados de demonstração ficam marcados separadamente e podem ser apagados com um comando quando os reais chegarem; a importação de preços reais roda diariamente e substitui a demonstração aos poucos.
- Na página da carta: preço atual, mínimo, máximo, variação em 7/30/90 dias, seletor de período e de variante (idioma, estado, graduada).

## Detalhes técnicos
- Novas tabelas: `seller_reviews` (order_item/pedido, notas, comentário, resposta, RLS: inserir só comprador com pedido entregue; responder só dono da loja; leitura pública), campos novos em `sellers` (logo, capa, bio, políticas) com upload em armazenamento público.
- Função `get_seller_reputation` (security definer) agregando notas, vendas e cancelamentos reais; `get_card_offers` passa a devolver nota e nº de avaliações.
- Regras de avaliação na função `submit_review` no banco, com testes.
- Rota pública SSR `loja.$slug.tsx` com head/OG próprios.
- Tokens novos em `src/styles.css` (holo, sombras, gradientes); componentes HoloCard, SellerBadge, RatingStars, ReputationMeter, BottomNav.
