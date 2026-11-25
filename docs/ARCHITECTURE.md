# Arquitetura

- **Frontend/SSR:** TanStack Start (React 19) em Cloudflare Workers. Páginas públicas (catálogo, carta, coleção, busca) com SSR e metadados para SEO.
- **Backend:** Lovable Cloud (Postgres + Auth). Regras de negócio críticas ficam no banco (funções `security definer` + RLS), não no navegador.
- **Global por configuração:** tabela `markets` (país, moeda, idioma, comércio habilitado). Um único catálogo mundial; preços observados carregam mercado e moeda.
- **Catálogo:** `card_sets` + `cards`, importados por conector (`scripts/import-catalog.ts`) a partir do dataset aberto PokemonTCG/pokemon-tcg-data.
- **Marketplace multi-seller:** `listings` sempre aponta para a carta canônica; variante (idioma, acabamento, condição, graduação) fica no anúncio.
- **Curadoria:** `sellers.status` só muda via `admin_set_seller_status`, que grava `seller_status_log` (auditoria). Loja não aprovada/suspensa não publica (RLS).
- **Pedidos:** `place_order` trava a linha do anúncio (`FOR UPDATE`) — impede vender a última unidade duas vezes; grava `order_items` (comissão e valor do vendedor) e `payments` (sandbox) separados.
- **Freemium:** `has_entitlement` + `get_price_history` cortam o histórico no servidor (Free = 90 dias). A tabela `price_observations` não é legível diretamente.
- **Papéis:** `user_roles` (admin/seller/buyer). Cadastro cria só `buyer`. Um operador concede `admin` depois, no SQL do banco, com a role de serviço: `insert into public.user_roles (user_id, role) values ('<user-uuid>', 'admin');`.
