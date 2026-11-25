-- Proposta aditiva. Não aplicar em produção a partir deste repositório até o fluxo de schema ser o Postgres próprio.
-- Hub de canais (Olist-like). Segredos ficam no provedor de env, nunca nestas tabelas.

create table if not exists public.channel_connections (
  seller_id uuid not null references public.sellers(id) on delete cascade,
  channel_id text not null,
  status text not null check (status in ('disconnected', 'connected', 'error')),
  mode text not null default 'mock' check (mode in ('mock', 'live')),
  external_seller_id text,
  connected_at timestamptz,
  last_error text,
  primary key (seller_id, channel_id)
);

create table if not exists public.channel_sync_cursors (
  seller_id uuid not null,
  channel_id text not null,
  kind text not null check (kind in ('catalog', 'orders')),
  state text not null,
  cursor text,
  last_sync_at timestamptz,
  item_count integer not null default 0,
  message text,
  primary key (seller_id, channel_id, kind),
  foreign key (seller_id, channel_id) references public.channel_connections(seller_id, channel_id) on delete cascade
);

alter table public.channel_connections enable row level security;
alter table public.channel_sync_cursors enable row level security;
