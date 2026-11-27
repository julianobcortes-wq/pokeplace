-- PokePlace: apply once in Supabase SQL Editor (in order).
-- After this: edit bootstrap-admin.sql with your user UUID and run it.
-- Mercado Livre pricing/channels deferred.


-- ===== 0000_migration.sql =====

create type public.app_role as enum ('admin','seller','buyer');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  market_code text not null default 'BR',
  language text not null default 'pt-BR',
  currency text not null default 'BRL',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  insert into public.user_roles (user_id, role) values (new.id, 'buyer');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.markets (
  code text primary key, name text not null, currency text not null, language text not null,
  commerce_enabled boolean not null default false
);
grant select on public.markets to anon, authenticated;
grant all on public.markets to service_role;
alter table public.markets enable row level security;
create policy "markets public" on public.markets for select using (true);
insert into public.markets values
 ('BR','Brasil','BRL','pt-BR',true),('US','Estados Unidos','USD','en-US',false),('CA','Canadá','CAD','en-CA',false),
 ('MX','México','MXN','es-MX',false),('GB','Reino Unido','GBP','en-GB',false),('EU','União Europeia','EUR','en',false),
 ('JP','Japão','JPY','ja-JP',false);

create table public.platform_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
grant select, insert, update on public.platform_settings to authenticated;
grant select on public.platform_settings to anon;
grant all on public.platform_settings to service_role;
alter table public.platform_settings enable row level security;
create policy "settings public read" on public.platform_settings for select using (true);
create policy "settings admin write" on public.platform_settings for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
insert into public.platform_settings values ('commission_rate', '0'::jsonb, now()), ('brand', '{"name":"HoloIndex"}'::jsonb, now());

create table public.card_sets (
  id text primary key, name text not null, series text, total int, release_date date,
  symbol_url text, logo_url text, source text not null default 'pokemontcg-data', created_at timestamptz not null default now()
);
create table public.cards (
  id text primary key, set_id text not null references public.card_sets(id),
  name text not null, number text not null, rarity text, supertype text, subtypes text[], types text[],
  artist text, image_small text, image_large text, source text not null default 'pokemontcg-data',
  created_at timestamptz not null default now()
);
create index cards_set_idx on public.cards(set_id);
create extension if not exists pg_trgm;
create index cards_name_trgm on public.cards using gin (name gin_trgm_ops);
grant select on public.card_sets, public.cards to anon;
grant select, insert, update, delete on public.card_sets, public.cards to authenticated;
grant all on public.card_sets, public.cards to service_role;
alter table public.card_sets enable row level security;
alter table public.cards enable row level security;
create policy "sets public" on public.card_sets for select using (true);
create policy "cards public" on public.cards for select using (true);
create policy "sets admin ins" on public.card_sets for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "sets admin upd" on public.card_sets for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "cards admin ins" on public.cards for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "cards admin upd" on public.cards for update to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.price_observations (
  id uuid primary key default gen_random_uuid(),
  card_id text not null references public.cards(id),
  market_code text not null references public.markets(code),
  source text not null, source_url text,
  price_type text not null check (price_type in ('sale','market','ask_low','ask_median')),
  language text not null default 'en', finish text not null default 'normal',
  condition text not null default 'NM', graded boolean not null default false, grade_company text, grade text,
  currency text not null, amount numeric(12,2) not null check (amount > 0),
  observed_at timestamptz not null, ingested_at timestamptz not null default now()
);
create index po_card_idx on public.price_observations(card_id, observed_at);
grant all on public.price_observations to service_role;
alter table public.price_observations enable row level security;

create type public.seller_status as enum ('draft','submitted','info_requested','approved','rejected','suspended','blocked');
create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  store_name text not null, slug text not null unique,
  person_type text not null check (person_type in ('PF','PJ')), document text not null,
  contact_email text not null, phone text, city text not null, state text not null, country text not null default 'BR',
  operation_type text, categories text[] not null default '{}', monthly_volume text, sales_history text,
  terms_accepted_at timestamptz not null,
  status public.seller_status not null default 'submitted',
  is_official boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select, insert, update on public.sellers to authenticated;
grant all on public.sellers to service_role;
alter table public.sellers enable row level security;
create policy "seller own read" on public.sellers for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "seller apply" on public.sellers for insert to authenticated with check (user_id = auth.uid() and status = 'submitted' and is_official = false);
create policy "seller own update" on public.sellers for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.protect_seller_fields() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.has_role(auth.uid(),'admin') and (new.status is distinct from old.status or new.is_official is distinct from old.is_official) then
    if not (old.status = 'info_requested' and new.status = 'submitted' and new.is_official = old.is_official) then
      raise exception 'Somente a curadoria pode alterar o status';
    end if;
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger sellers_protect before update on public.sellers for each row execute function public.protect_seller_fields();

create table public.seller_status_log (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  from_status public.seller_status, to_status public.seller_status not null,
  note text, actor_id uuid not null, created_at timestamptz not null default now()
);
grant select on public.seller_status_log to authenticated;
grant all on public.seller_status_log to service_role;
alter table public.seller_status_log enable row level security;
create policy "log read" on public.seller_status_log for select to authenticated using (
  public.has_role(auth.uid(),'admin') or exists (select 1 from public.sellers s where s.id = seller_status_log.seller_id and s.user_id = auth.uid()));

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id),
  card_id text not null references public.cards(id),
  language text not null default 'en', finish text not null default 'normal',
  condition text not null check (condition in ('M','NM','SP','MP','HP','D')),
  graded boolean not null default false, grade_company text, grade text,
  price numeric(12,2) not null check (price > 0), currency text not null default 'BRL',
  quantity int not null check (quantity >= 0),
  notes text, photos text[] not null default '{}',
  status text not null default 'active' check (status in ('active','paused','sold_out','removed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index listings_card_idx on public.listings(card_id) where status = 'active';
grant select, insert, update on public.listings to authenticated;
grant select on public.listings to anon;
grant all on public.listings to service_role;
alter table public.listings enable row level security;

create or replace function public.is_approved_seller(_seller_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.sellers where id = _seller_id and status = 'approved')
$$;
create or replace function public.owns_seller(_seller_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.sellers where id = _seller_id and user_id = auth.uid())
$$;

create policy "listings public active" on public.listings for select using (status = 'active' and public.is_approved_seller(seller_id));
create policy "listings own read" on public.listings for select to authenticated using (public.owns_seller(seller_id));
create policy "listings own insert" on public.listings for insert to authenticated with check (public.owns_seller(seller_id) and public.is_approved_seller(seller_id));
create policy "listings own update" on public.listings for update to authenticated using (public.owns_seller(seller_id)) with check (public.owns_seller(seller_id) and (public.is_approved_seller(seller_id) or status <> 'active'));

create or replace function public.admin_set_seller_status(_seller_id uuid, _status public.seller_status, _note text, _official boolean default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_old public.seller_status; v_user uuid;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Acesso negado'; end if;
  select status, user_id into v_old, v_user from public.sellers where id = _seller_id for update;
  if not found then raise exception 'Vendedor não encontrado'; end if;
  update public.sellers set status = _status, is_official = coalesce(_official, is_official) where id = _seller_id;
  insert into public.seller_status_log (seller_id, from_status, to_status, note, actor_id) values (_seller_id, v_old, _status, _note, auth.uid());
  if _status = 'approved' then
    insert into public.user_roles (user_id, role) values (v_user, 'seller') on conflict do nothing;
  elsif _status in ('suspended','blocked','rejected') then
    update public.listings set status = 'paused' where seller_id = _seller_id and status = 'active';
  end if;
end $$;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','paid','shipped','delivered','cancelled')),
  currency text not null default 'BRL', subtotal numeric(12,2) not null, commission_total numeric(12,2) not null, seller_total numeric(12,2) not null,
  ship_name text, ship_address text, ship_city text, ship_state text, ship_zip text,
  created_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  listing_id uuid not null references public.listings(id), seller_id uuid not null references public.sellers(id), card_id text not null references public.cards(id),
  quantity int not null check (quantity > 0), unit_price numeric(12,2) not null,
  commission_rate numeric(6,4) not null, commission_amount numeric(12,2) not null, seller_amount numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending','shipped','delivered','cancelled'))
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null, environment text not null check (environment in ('sandbox','live')),
  status text not null default 'pending' check (status in ('pending','succeeded','failed','refunded')),
  amount numeric(12,2) not null, currency text not null, created_at timestamptz not null default now()
);
grant select on public.orders, public.order_items, public.payments to authenticated;
grant update on public.order_items to authenticated;
grant all on public.orders, public.order_items, public.payments to service_role;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

create or replace function public.seller_in_order(_order_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.order_items oi join public.sellers s on s.id = oi.seller_id where oi.order_id = _order_id and s.user_id = auth.uid())
$$;
create or replace function public.is_order_buyer(_order_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.orders where id = _order_id and buyer_id = auth.uid())
$$;
create policy "orders read" on public.orders for select to authenticated using (buyer_id = auth.uid() or public.has_role(auth.uid(),'admin') or public.seller_in_order(id));
create policy "items read" on public.order_items for select to authenticated using (public.owns_seller(seller_id) or public.has_role(auth.uid(),'admin') or public.is_order_buyer(order_id));
create policy "items seller update" on public.order_items for update to authenticated using (public.owns_seller(seller_id)) with check (public.owns_seller(seller_id));
create policy "payments read" on public.payments for select to authenticated using (public.has_role(auth.uid(),'admin') or public.is_order_buyer(order_id));

create or replace function public.get_card_offers(_card_id text)
returns table (listing_id uuid, seller_id uuid, store_name text, store_slug text, is_official boolean, city text, state text,
  language text, finish text, condition text, graded boolean, grade_company text, grade text, price numeric, currency text, quantity int, notes text, completed_sales bigint)
language sql stable security definer set search_path=public as $$
  select l.id, s.id, s.store_name, s.slug, s.is_official, s.city, s.state, l.language, l.finish, l.condition, l.graded, l.grade_company, l.grade,
    l.price, l.currency, l.quantity, l.notes,
    (select count(*) from public.order_items oi where oi.seller_id = s.id and oi.status = 'delivered')
  from public.listings l join public.sellers s on s.id = l.seller_id
  where l.card_id = _card_id and l.status = 'active' and l.quantity > 0 and s.status = 'approved'
  order by l.price asc
$$;

create or replace function public.place_order(_items jsonb, _ship jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_order uuid; v_rate numeric; it jsonb; l record; v_sub numeric := 0; v_com numeric := 0; q int; c numeric;
begin
  if auth.uid() is null then raise exception 'Faça login para comprar'; end if;
  if _items is null or jsonb_array_length(_items) = 0 then raise exception 'Carrinho vazio'; end if;
  select coalesce((value #>> '{}')::numeric, 0) into v_rate from public.platform_settings where key = 'commission_rate';
  v_rate := coalesce(v_rate, 0);
  insert into public.orders (buyer_id, subtotal, commission_total, seller_total, ship_name, ship_address, ship_city, ship_state, ship_zip)
    values (auth.uid(), 0, 0, 0, _ship->>'name', _ship->>'address', _ship->>'city', _ship->>'state', _ship->>'zip') returning id into v_order;
  for it in select * from jsonb_array_elements(_items) loop
    q := (it->>'quantity')::int;
    if q is null or q < 1 then raise exception 'Quantidade inválida'; end if;
    select li.* into l from public.listings li join public.sellers s on s.id = li.seller_id
      where li.id = (it->>'listing_id')::uuid and li.status = 'active' and s.status = 'approved' for update of li;
    if not found then raise exception 'Oferta indisponível'; end if;
    if l.quantity < q then raise exception 'Estoque insuficiente'; end if;
    if public.owns_seller(l.seller_id) then raise exception 'Você não pode comprar da sua própria loja'; end if;
    update public.listings set quantity = quantity - q, status = case when quantity - q = 0 then 'sold_out' else status end, updated_at = now() where id = l.id;
    c := round(l.price*q*v_rate, 2);
    insert into public.order_items (order_id, listing_id, seller_id, card_id, quantity, unit_price, commission_rate, commission_amount, seller_amount)
      values (v_order, l.id, l.seller_id, l.card_id, q, l.price, v_rate, c, l.price*q - c);
    v_sub := v_sub + l.price*q; v_com := v_com + c;
  end loop;
  update public.orders set subtotal = v_sub, commission_total = v_com, seller_total = v_sub - v_com where id = v_order;
  insert into public.payments (order_id, provider, environment, amount, currency) values (v_order, 'test', 'sandbox', v_sub, 'BRL');
  return v_order;
end $$;

create table public.plans (id text primary key, name text not null, audience text not null, sort int not null default 0);
create table public.entitlements (key text primary key, description text not null);
create table public.plan_entitlements (plan_id text references public.plans(id), entitlement_key text references public.entitlements(key), primary key (plan_id, entitlement_key));
create table public.plan_prices (id uuid primary key default gen_random_uuid(), plan_id text not null references public.plans(id), market_code text not null references public.markets(code),
  currency text not null, interval text not null check (interval in ('month','year')), amount numeric(12,2), active boolean not null default false);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, plan_id text not null references public.plans(id),
  status text not null check (status in ('active','trialing','past_due','canceled','expired')),
  current_period_end timestamptz not null, cancel_at_period_end boolean not null default false, provider text, environment text,
  created_at timestamptz not null default now()
);
grant select on public.plans, public.entitlements, public.plan_entitlements, public.plan_prices to anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.plans, public.entitlements, public.plan_entitlements, public.plan_prices, public.subscriptions to service_role;
alter table public.plans enable row level security; alter table public.entitlements enable row level security;
alter table public.plan_entitlements enable row level security; alter table public.plan_prices enable row level security;
alter table public.subscriptions enable row level security;
create policy "plans public" on public.plans for select using (true);
create policy "ent public" on public.entitlements for select using (true);
create policy "pe public" on public.plan_entitlements for select using (true);
create policy "prices public" on public.plan_prices for select using (active);
create policy "subs own" on public.subscriptions for select to authenticated using (user_id = auth.uid());

insert into public.plans values ('free','Free','collector',0),('collector_pro','Collector Pro','collector',1),('seller_pro','Seller Pro','seller',2);
insert into public.entitlements values
 ('price_history_90d','Histórico de preços dos últimos 3 meses'),('price_history_full','Histórico completo disponível'),
 ('advanced_comparison','Comparação histórica avançada'),('regional_comparison','Comparação entre mercados'),
 ('advanced_alerts','Alertas avançados'),('full_rankings','Rankings completos'),
 ('seller_competitive_intel','Inteligência competitiva de preços'),('seller_reports_export','Exportação de relatórios');
insert into public.plan_entitlements values
 ('free','price_history_90d'),
 ('collector_pro','price_history_90d'),('collector_pro','price_history_full'),('collector_pro','advanced_comparison'),('collector_pro','regional_comparison'),('collector_pro','advanced_alerts'),('collector_pro','full_rankings'),
 ('seller_pro','price_history_90d'),('seller_pro','seller_competitive_intel'),('seller_pro','seller_reports_export');

create or replace function public.has_entitlement(_user uuid, _key text) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.plan_entitlements where plan_id = 'free' and entitlement_key = _key)
  or exists (select 1 from public.subscriptions s join public.plan_entitlements pe on pe.plan_id = s.plan_id
    where s.user_id = _user and pe.entitlement_key = _key and s.status in ('active','trialing') and s.current_period_end > now())
$$;

create or replace function public.get_price_history(_card_id text, _days int default 90)
returns table (observed_at timestamptz, amount numeric, currency text, price_type text, source text, market_code text, language text, finish text, condition text, graded boolean, locked boolean)
language plpgsql stable security definer set search_path=public as $$
declare v_full boolean := auth.uid() is not null and public.has_entitlement(auth.uid(), 'price_history_full');
begin
  if not v_full and (_days is null or _days > 90) then
    return query select null::timestamptz, null::numeric, null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::boolean, true;
    return;
  end if;
  return query select p.observed_at, p.amount, p.currency, p.price_type, p.source, p.market_code, p.language, p.finish, p.condition, p.graded, false
    from public.price_observations p
    where p.card_id = _card_id and (_days is null or p.observed_at >= now() - make_interval(days => _days))
    order by p.observed_at;
end $$;

revoke execute on function public.place_order(jsonb,jsonb) from public, anon;
grant execute on function public.place_order(jsonb,jsonb) to authenticated;
grant execute on function public.get_price_history(text,int), public.get_card_offers(text) to anon, authenticated;
grant execute on function public.admin_set_seller_status(uuid, public.seller_status, text, boolean) to authenticated;


-- ===== 0001_migration.sql =====
revoke all on public.price_observations from anon, authenticated;

-- ===== 0002_seller_reviews_reputation_trends.sql =====
ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS shipping_policy text,
  ADD COLUMN IF NOT EXISTS return_policy text;

CREATE TABLE public.seller_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  buyer_id uuid NOT NULL,
  rating_service smallint NOT NULL CHECK (rating_service BETWEEN 1 AND 5),
  rating_packaging smallint NOT NULL CHECK (rating_packaging BETWEEN 1 AND 5),
  rating_shipping smallint NOT NULL CHECK (rating_shipping BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR length(comment) <= 1000),
  reply text CHECK (reply IS NULL OR length(reply) <= 1000),
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, seller_id)
);
GRANT SELECT ON public.seller_reviews TO anon, authenticated;
GRANT ALL ON public.seller_reviews TO service_role;
ALTER TABLE public.seller_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews public read" ON public.seller_reviews FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.submit_review(_order_id uuid, _seller_id uuid, _service int, _packaging int, _shipping int, _comment text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para avaliar'; end if;
  if not exists (select 1 from orders o where o.id = _order_id and o.buyer_id = auth.uid()) then
    raise exception 'Somente o comprador pode avaliar este pedido'; end if;
  if not exists (select 1 from order_items oi where oi.order_id = _order_id and oi.seller_id = _seller_id and oi.status = 'delivered') then
    raise exception 'A avaliação é liberada após a entrega'; end if;
  insert into seller_reviews(seller_id, order_id, buyer_id, rating_service, rating_packaging, rating_shipping, comment)
  values (_seller_id, _order_id, auth.uid(), _service, _packaging, _shipping, nullif(trim(_comment), ''))
  returning id into v_id;
  return v_id;
end $$;

CREATE OR REPLACE FUNCTION public.reply_review(_review_id uuid, _reply text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  update seller_reviews r set reply = nullif(trim(_reply), ''), replied_at = now()
  where r.id = _review_id and r.reply is null and public.owns_seller(r.seller_id);
  if not found then raise exception 'Não é possível responder esta avaliação'; end if;
end $$;

CREATE OR REPLACE FUNCTION public.get_seller_reputation(_seller_id uuid)
RETURNS TABLE(rating numeric, reviews bigint, completed_sales bigint, cancelled bigint, total_items bigint, level text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  with r as (select avg((rating_service+rating_packaging+rating_shipping)/3.0) a, count(*) n from seller_reviews where seller_id = _seller_id),
  s as (select count(*) filter (where status='delivered') d, count(*) filter (where status='cancelled') c, count(*) t from order_items where seller_id = _seller_id)
  select round(r.a,2), r.n, s.d, s.c, s.t,
    case when r.n < 3 then 'nova' when r.a >= 4.7 then 'excelente' when r.a >= 4.2 then 'otima' when r.a >= 3.5 then 'boa' else 'regular' end
  from r, s
$$;

CREATE OR REPLACE FUNCTION public.get_public_seller(_slug text)
RETURNS TABLE(id uuid, store_name text, slug text, city text, state text, country text, is_official boolean, logo_url text, cover_url text, bio text, shipping_policy text, return_policy text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select s.id, s.store_name, s.slug, s.city, s.state, s.country, s.is_official, s.logo_url, s.cover_url, s.bio, s.shipping_policy, s.return_policy, s.created_at
  from sellers s where s.slug = _slug and s.status = 'approved'
$$;

CREATE OR REPLACE FUNCTION public.list_public_sellers(_limit int DEFAULT 8)
RETURNS TABLE(id uuid, store_name text, slug text, city text, state text, is_official boolean, logo_url text, rating numeric, reviews bigint, completed_sales bigint, active_listings bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select s.id, s.store_name, s.slug, s.city, s.state, s.is_official, s.logo_url,
    (select round(avg((rating_service+rating_packaging+rating_shipping)/3.0),2) from seller_reviews r where r.seller_id=s.id),
    (select count(*) from seller_reviews r where r.seller_id=s.id),
    (select count(*) from order_items oi where oi.seller_id=s.id and oi.status='delivered'),
    (select count(*) from listings l where l.seller_id=s.id and l.status='active' and l.quantity>0)
  from sellers s where s.status='approved'
  order by s.is_official desc, s.created_at limit _limit
$$;

DROP FUNCTION IF EXISTS public.get_card_offers(text);
CREATE FUNCTION public.get_card_offers(_card_id text)
RETURNS TABLE(listing_id uuid, seller_id uuid, store_name text, store_slug text, is_official boolean, city text, state text, language text, finish text, condition text, graded boolean, grade_company text, grade text, price numeric, currency text, quantity integer, notes text, completed_sales bigint, rating numeric, reviews bigint, logo_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select l.id, s.id, s.store_name, s.slug, s.is_official, s.city, s.state, l.language, l.finish, l.condition, l.graded, l.grade_company, l.grade,
    l.price, l.currency, l.quantity, l.notes,
    (select count(*) from order_items oi where oi.seller_id = s.id and oi.status = 'delivered'),
    (select round(avg((rating_service+rating_packaging+rating_shipping)/3.0),2) from seller_reviews r where r.seller_id=s.id),
    (select count(*) from seller_reviews r where r.seller_id=s.id),
    s.logo_url
  from listings l join sellers s on s.id = l.seller_id
  where l.card_id = _card_id and l.status = 'active' and l.quantity > 0 and s.status = 'approved'
  order by l.price asc
$$;

CREATE INDEX IF NOT EXISTS price_obs_card_time ON public.price_observations(card_id, observed_at);

-- Free 90-day trend for list sparklines (same free window as get_price_history)
CREATE OR REPLACE FUNCTION public.get_card_trends(_ids text[])
RETURNS TABLE(card_id text, points numeric[], last_price numeric, change_pct numeric, currency text, is_demo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select p.card_id, array_agg(p.amount order by p.observed_at),
    (array_agg(p.amount order by p.observed_at desc))[1],
    round(((array_agg(p.amount order by p.observed_at desc))[1] / nullif((array_agg(p.amount order by p.observed_at))[1],0) - 1) * 100, 1),
    min(p.currency), bool_or(p.source = 'demo')
  from price_observations p
  where p.card_id = any(_ids[1:120]) and p.observed_at >= now() - interval '90 days'
  group by p.card_id
$$;

GRANT EXECUTE ON FUNCTION public.get_card_offers(text), public.get_card_trends(text[]), public.get_public_seller(text), public.list_public_sellers(int), public.get_seller_reputation(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_review(uuid,uuid,int,int,int,text), public.reply_review(uuid,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_review(uuid,uuid,int,int,int,text), public.reply_review(uuid,text) FROM anon;


-- ===== 0003_rename_brand_pokeplace.sql =====
update public.platform_settings set value = '{"name":"PokePlace"}'::jsonb, updated_at = now() where key = 'brand';

-- ===== 0004_marketplace_trust_integrity.sql =====
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS shipped_at timestamptz, ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
CREATE OR REPLACE FUNCTION public.protect_order_item_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (to_jsonb(NEW) - ARRAY['status','shipped_at','delivered_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','shipped_at','delivered_at']) THEN RAISE EXCEPTION 'Valores e identificação da venda não podem ser alterados'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.status='shipped' AND OLD.status='pending' AND public.owns_seller(OLD.seller_id) THEN NEW.shipped_at=now();
  ELSIF NEW.status='cancelled' AND OLD.status='pending' AND public.owns_seller(OLD.seller_id) THEN NULL;
  ELSIF NEW.status='delivered' AND OLD.status='shipped' AND public.is_order_buyer(OLD.order_id) THEN NEW.delivered_at=now();
  ELSE RAISE EXCEPTION 'Transição inválida: somente o comprador confirma recebimento após envio'; END IF;
 ELSE NEW.shipped_at=OLD.shipped_at; NEW.delivered_at=OLD.delivered_at;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_items_integrity BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.protect_order_item_integrity();
CREATE OR REPLACE FUNCTION public.confirm_item_received(_item_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre para confirmar recebimento'; END IF;
 UPDATE public.order_items SET status='delivered' WHERE id=_item_id AND status='shipped' AND public.is_order_buyer(order_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Item não disponível para confirmação'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.confirm_item_received(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_item_received(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.is_real_completed_order(_order_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.payments p WHERE p.order_id=_order_id AND p.environment='live' AND p.status IN ('paid','succeeded','completed'))
$$;
CREATE OR REPLACE FUNCTION public.submit_review(_order_id uuid,_seller_id uuid,_service integer,_packaging integer,_shipping integer,_comment text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_order_buyer(_order_id) THEN RAISE EXCEPTION 'Somente o comprador pode avaliar'; END IF;
 IF public.owns_seller(_seller_id) THEN RAISE EXCEPTION 'Não é permitido avaliar a própria loja'; END IF;
 IF NOT public.is_real_completed_order(_order_id) THEN RAISE EXCEPTION 'Pedidos de teste ou sem pagamento confirmado não geram avaliações'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_items WHERE order_id=_order_id AND seller_id=_seller_id AND status='delivered' AND delivered_at IS NOT NULL) THEN RAISE EXCEPTION 'Confirme o recebimento antes de avaliar'; END IF;
 IF _service IS NULL OR _packaging IS NULL OR _shipping IS NULL OR _service NOT BETWEEN 1 AND 5 OR _packaging NOT BETWEEN 1 AND 5 OR _shipping NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'As notas devem ser de 1 a 5'; END IF;
 IF length(coalesce(_comment,''))>1000 THEN RAISE EXCEPTION 'Comentário limitado a 1000 caracteres'; END IF;
 INSERT INTO public.seller_reviews(seller_id,order_id,buyer_id,rating_service,rating_packaging,rating_shipping,comment) VALUES(_seller_id,_order_id,auth.uid(),_service,_packaging,_shipping,nullif(trim(_comment),'')) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.reply_review(_review_id uuid,_reply text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR nullif(trim(_reply),'') IS NULL OR length(_reply)>1000 THEN RAISE EXCEPTION 'Resposta deve ter de 1 a 1000 caracteres'; END IF;
 UPDATE public.seller_reviews SET reply=trim(_reply),replied_at=now() WHERE id=_review_id AND replied_at IS NULL AND public.owns_seller(seller_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Somente a loja pode responder, uma única vez'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_seller_reputation(_seller_id uuid) RETURNS TABLE(rating numeric,reviews bigint,completed_sales bigint,cancelled bigint,total_items bigint,level text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH r AS (SELECT avg((rating_service+rating_packaging+rating_shipping)/3.0) a,count(*) n FROM public.seller_reviews WHERE seller_id=_seller_id AND public.is_real_completed_order(order_id)),
 s AS (SELECT count(*) FILTER(WHERE status='delivered' AND delivered_at IS NOT NULL) d,count(*) FILTER(WHERE status='cancelled') c,count(*) t FROM public.order_items WHERE seller_id=_seller_id AND public.is_real_completed_order(order_id))
 SELECT round(r.a,2),r.n,s.d,s.c,s.t,CASE WHEN r.n<3 THEN 'nova' WHEN r.a>=4.7 THEN 'excelente' WHEN r.a>=4.2 THEN 'otima' WHEN r.a>=3.5 THEN 'boa' ELSE 'regular' END FROM r,s
$$;
CREATE OR REPLACE FUNCTION public.get_listing_sellers(_ids uuid[]) RETURNS TABLE(listing_id uuid,seller_id uuid,store_name text,store_slug text,is_official boolean,city text,state text,logo_url text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT l.id,s.id,s.store_name,s.slug,s.is_official,s.city,s.state,s.logo_url FROM public.listings l JOIN public.sellers s ON s.id=l.seller_id WHERE l.id=ANY(_ids[1:100]) AND l.status='active' AND s.status='approved' AND l.quantity>0
$$;
REVOKE ALL ON FUNCTION public.get_listing_sellers(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_listing_sellers(uuid[]) TO anon,authenticated;
GRANT SELECT ON public.order_items TO authenticated;
GRANT UPDATE(status) ON public.order_items TO authenticated;
REVOKE UPDATE ON public.order_items FROM authenticated;
GRANT UPDATE(status) ON public.order_items TO authenticated;
GRANT SELECT ON public.seller_reviews TO anon,authenticated;

-- ===== 0005_consistent_public_seller_reputation.sql =====
CREATE OR REPLACE FUNCTION public.get_card_offers(_card_id text) RETURNS TABLE(listing_id uuid,seller_id uuid,store_name text,store_slug text,is_official boolean,city text,state text,language text,finish text,condition text,graded boolean,grade_company text,grade text,price numeric,currency text,quantity integer,notes text,completed_sales bigint,rating numeric,reviews bigint,logo_url text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT l.id,s.id,s.store_name,s.slug,s.is_official,s.city,s.state,l.language,l.finish,l.condition,l.graded,l.grade_company,l.grade,l.price,l.currency,l.quantity,l.notes,r.completed_sales,r.rating,r.reviews,s.logo_url FROM public.listings l JOIN public.sellers s ON s.id=l.seller_id CROSS JOIN LATERAL public.get_seller_reputation(s.id) r WHERE l.card_id=_card_id AND l.status='active' AND l.quantity>0 AND s.status='approved' ORDER BY l.price
$$;
CREATE OR REPLACE FUNCTION public.list_public_sellers(_limit integer DEFAULT 8) RETURNS TABLE(id uuid,store_name text,slug text,city text,state text,is_official boolean,logo_url text,rating numeric,reviews bigint,completed_sales bigint,active_listings bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT s.id,s.store_name,s.slug,s.city,s.state,s.is_official,s.logo_url,r.rating,r.reviews,r.completed_sales,(SELECT count(*) FROM public.listings l WHERE l.seller_id=s.id AND l.status='active' AND l.quantity>0) FROM public.sellers s CROSS JOIN LATERAL public.get_seller_reputation(s.id) r WHERE s.status='approved' ORDER BY s.created_at LIMIT greatest(0,least(_limit,500))
$$;
CREATE OR REPLACE FUNCTION public.get_seller_trust(_seller_id uuid) RETURNS TABLE(rating numeric,reviews bigint,completed_sales bigint,cancelled bigint,total_items bigint,level text,service_rating numeric,packaging_rating numeric,shipping_rating numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT r.*,a.s,a.p,a.e FROM public.get_seller_reputation(_seller_id) r CROSS JOIN (SELECT round(avg(rating_service),2) s,round(avg(rating_packaging),2) p,round(avg(rating_shipping),2) e FROM public.seller_reviews WHERE seller_id=_seller_id AND public.is_real_completed_order(order_id)) a WHERE public.is_approved_seller(_seller_id) OR public.owns_seller(_seller_id) OR public.has_role(auth.uid(),'admin')
$$;
REVOKE ALL ON FUNCTION public.get_seller_trust(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_trust(uuid) TO anon,authenticated;
REVOKE SELECT ON public.seller_reviews FROM anon,authenticated;
GRANT SELECT(id,seller_id,order_id,rating_service,rating_packaging,rating_shipping,comment,reply,replied_at,created_at) ON public.seller_reviews TO anon,authenticated;

-- ===== 0006_marketplace_completion.sql =====
CREATE TABLE public.collection_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, card_id text NOT NULL REFERENCES public.cards(id), kind text NOT NULL CHECK(kind IN ('owned','wanted')), quantity integer NOT NULL DEFAULT 1 CHECK(quantity>0), target_price numeric(12,2) CHECK(target_price>0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,card_id,kind));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.collection_entries TO authenticated; GRANT ALL ON public.collection_entries TO service_role;
ALTER TABLE public.collection_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_owner ON public.collection_entries FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE TABLE public.support_tickets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, order_id uuid REFERENCES public.orders(id), subject text NOT NULL CHECK(length(trim(subject)) BETWEEN 3 AND 150), category text NOT NULL CHECK(category IN ('order','seller','account','other')), status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON public.support_tickets TO authenticated; GRANT UPDATE(status) ON public.support_tickets TO authenticated; GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_read ON public.support_tickets FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY ticket_create ON public.support_tickets FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND status='open' AND (order_id IS NULL OR public.is_order_buyer(order_id) OR public.seller_in_order(order_id)));
CREATE POLICY ticket_admin ON public.support_tickets FOR UPDATE TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE TABLE public.support_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES public.support_tickets(id), user_id uuid NOT NULL, body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON public.support_messages TO authenticated; GRANT ALL ON public.support_messages TO service_role;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_read ON public.support_messages FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.support_tickets t WHERE t.id=ticket_id AND (t.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY message_create ON public.support_messages FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.support_tickets t WHERE t.id=ticket_id AND t.status<>'resolved' AND (t.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE INDEX support_messages_ticket ON public.support_messages(ticket_id,created_at);
CREATE OR REPLACE FUNCTION public.open_support_ticket(_subject text,_category text,_body text,_order_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ DECLARE v uuid; BEGIN INSERT INTO public.support_tickets(user_id,subject,category,order_id) VALUES(auth.uid(),trim(_subject),_category,_order_id) RETURNING id INTO v; INSERT INTO public.support_messages(ticket_id,user_id,body) VALUES(v,auth.uid(),trim(_body)); RETURN v; END $$;
REVOKE ALL ON FUNCTION public.open_support_ticket(text,text,text,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.open_support_ticket(text,text,text,uuid) TO authenticated;
ALTER TABLE public.order_items ADD COLUMN tracking_code text, ADD COLUMN shipping_carrier text;
CREATE OR REPLACE FUNCTION public.mark_item_shipped(_item_id uuid,_carrier text,_tracking text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF length(trim(coalesce(_carrier,''))) NOT BETWEEN 2 AND 80 OR length(trim(coalesce(_tracking,''))) NOT BETWEEN 3 AND 120 THEN RAISE EXCEPTION 'Informe transportadora e código de rastreio'; END IF; UPDATE public.order_items SET status='shipped',shipping_carrier=trim(_carrier),tracking_code=trim(_tracking) WHERE id=_item_id AND status='pending' AND public.owns_seller(seller_id); IF NOT FOUND THEN RAISE EXCEPTION 'Venda indisponível para envio'; END IF; END $$;
REVOKE ALL ON FUNCTION public.mark_item_shipped(uuid,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.mark_item_shipped(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.protect_order_item_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','shipped_at','delivered_at','tracking_code','shipping_carrier']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','shipped_at','delivered_at','tracking_code','shipping_carrier']) THEN RAISE EXCEPTION 'Valores e identificação da venda não podem ser alterados'; END IF;
 IF NEW.tracking_code IS DISTINCT FROM OLD.tracking_code OR NEW.shipping_carrier IS DISTINCT FROM OLD.shipping_carrier THEN IF NOT(public.owns_seller(OLD.seller_id) AND OLD.status='pending' AND NEW.status='shipped') THEN RAISE EXCEPTION 'Rastreio só pode ser informado no envio pela loja'; END IF; END IF;
 NEW.shipped_at=OLD.shipped_at; NEW.delivered_at=OLD.delivered_at;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
 IF NEW.status='shipped' AND OLD.status='pending' AND public.owns_seller(OLD.seller_id) THEN NEW.shipped_at=now();
 ELSIF NEW.status='cancelled' AND OLD.status='pending' AND public.owns_seller(OLD.seller_id) THEN RAISE EXCEPTION 'Solicite cancelamento pela central de atendimento';
 ELSIF NEW.status='delivered' AND OLD.status='shipped' AND public.is_order_buyer(OLD.order_id) THEN NEW.delivered_at=now();
 ELSE RAISE EXCEPTION 'Transição inválida: somente o comprador confirma recebimento após envio'; END IF; END IF; RETURN NEW; END $$;
ALTER TABLE public.listings ADD COLUMN photo_paths text[] NOT NULL DEFAULT '{}';
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('marketplace-media', 'marketplace-media', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY marketplace_media_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='marketplace-media' AND public.owns_seller((storage.foldername(name))[1]::uuid) AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp'));
CREATE POLICY marketplace_media_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='marketplace-media' AND (public.is_approved_seller((storage.foldername(name))[1]::uuid) OR public.owns_seller((storage.foldername(name))[1]::uuid) OR public.has_role(auth.uid(),'admin')));
CREATE POLICY marketplace_media_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='marketplace-media' AND public.owns_seller((storage.foldername(name))[1]::uuid));
CREATE OR REPLACE FUNCTION public.get_seller_sales() RETURNS TABLE(item_id uuid,is_live_paid boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT oi.id,public.is_real_completed_order(oi.order_id) FROM public.order_items oi WHERE public.owns_seller(oi.seller_id) $$;
REVOKE ALL ON FUNCTION public.get_seller_sales() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_seller_sales() TO authenticated;
CREATE OR REPLACE FUNCTION public.get_marketplace_financials() RETURNS TABLE(paid_orders bigint,gmv numeric,commission numeric,seller_total numeric,test_orders bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Acesso restrito'; END IF; RETURN QUERY SELECT count(*) FILTER(WHERE public.is_real_completed_order(o.id)),coalesce(sum(o.subtotal) FILTER(WHERE public.is_real_completed_order(o.id)),0),coalesce(sum(o.commission_total) FILTER(WHERE public.is_real_completed_order(o.id)),0),coalesce(sum(o.seller_total) FILTER(WHERE public.is_real_completed_order(o.id)),0),count(*) FILTER(WHERE NOT public.is_real_completed_order(o.id)) FROM public.orders o WHERE o.status<>'cancelled'; END $$;
REVOKE ALL ON FUNCTION public.get_marketplace_financials() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_marketplace_financials() TO authenticated;

-- ===== 0007_launch_security_guards.sql =====
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN INSERT INTO public.profiles(id,display_name) VALUES(new.id,coalesce(new.raw_user_meta_data->>'name',split_part(new.email,'@',1))); INSERT INTO public.user_roles(user_id,role) VALUES(new.id,'buyer'); RETURN new; END $$;
CREATE OR REPLACE FUNCTION public.protect_seller_fields() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Identidade da loja não pode ser alterada'; END IF;
 IF NOT public.has_role(auth.uid(),'admin') THEN
 IF NEW.status IS DISTINCT FROM OLD.status OR NEW.is_official IS DISTINCT FROM OLD.is_official THEN IF NOT(OLD.status='info_requested' AND NEW.status='submitted' AND NEW.is_official=OLD.is_official) THEN RAISE EXCEPTION 'Somente a curadoria pode alterar o status'; END IF; END IF;
 IF OLD.status='approved' AND (NEW.document IS DISTINCT FROM OLD.document OR NEW.person_type IS DISTINCT FROM OLD.person_type OR NEW.store_name IS DISTINCT FROM OLD.store_name OR NEW.slug IS DISTINCT FROM OLD.slug) THEN RAISE EXCEPTION 'Alterações da identidade de loja aprovada exigem curadoria'; END IF;
 END IF; NEW.updated_at=now(); RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.validate_order_address() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF length(trim(coalesce(NEW.ship_name,'')))<3 OR length(trim(coalesce(NEW.ship_address,'')))<5 OR length(trim(coalesce(NEW.ship_city,'')))<2 OR coalesce(NEW.ship_state,'') !~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$' OR regexp_replace(coalesce(NEW.ship_zip,''),'[^0-9]','','g') !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Informe nome, endereço, cidade, UF e CEP válidos'; END IF; RETURN NEW; END $$;
CREATE TRIGGER order_address_valid BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.validate_order_address();
CREATE OR REPLACE FUNCTION public.validate_listing_media() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF cardinality(NEW.photo_paths)>4 OR EXISTS(SELECT 1 FROM unnest(NEW.photo_paths) p WHERE p NOT LIKE NEW.seller_id::text||'/%' OR p !~ '^[a-f0-9-]{36}/[a-f0-9-]+\.(jpg|jpeg|png|webp)$') THEN RAISE EXCEPTION 'Use até quatro fotos da própria loja'; END IF; RETURN NEW; END $$;
CREATE TRIGGER listing_media_valid BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.validate_listing_media();

-- ===== 0008_private_data_explicit_privileges.sql =====
REVOKE ALL ON public.collection_entries,public.support_tickets,public.support_messages FROM anon;
REVOKE ALL ON FUNCTION public.is_real_completed_order(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_real_completed_order(uuid) TO authenticated,service_role;

-- ===== 0009_marketplace_operations.sql =====

-- System bypass for trusted database functions
CREATE OR REPLACE FUNCTION public.protect_order_item_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ BEGIN
 IF current_setting('app.system', true) = 'on' THEN RETURN NEW; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','shipped_at','delivered_at','tracking_code','shipping_carrier']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','shipped_at','delivered_at','tracking_code','shipping_carrier']) THEN RAISE EXCEPTION 'Valores e identificação da venda não podem ser alterados'; END IF;
 IF NEW.tracking_code IS DISTINCT FROM OLD.tracking_code OR NEW.shipping_carrier IS DISTINCT FROM OLD.shipping_carrier THEN IF NOT(public.owns_seller(OLD.seller_id) AND OLD.status='pending' AND NEW.status='shipped') THEN RAISE EXCEPTION 'Rastreio só pode ser informado no envio pela loja'; END IF; END IF;
 NEW.shipped_at=OLD.shipped_at; NEW.delivered_at=OLD.delivered_at;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
 IF NEW.status='shipped' AND OLD.status='pending' AND public.owns_seller(OLD.seller_id) THEN NEW.shipped_at=now();
 ELSIF NEW.status='cancelled' AND OLD.status='pending' AND public.owns_seller(OLD.seller_id) THEN RAISE EXCEPTION 'Solicite cancelamento pela central de atendimento';
 ELSIF NEW.status='delivered' AND OLD.status='shipped' AND public.is_order_buyer(OLD.order_id) THEN NEW.delivered_at=now();
 ELSE RAISE EXCEPTION 'Transição inválida: somente o comprador confirma recebimento após envio'; END IF; END IF; RETURN NEW; END $function$;

INSERT INTO public.platform_settings(key,value) VALUES ('payout_release_days','7'::jsonb),('new_seller_listing_limit','50'::jsonb),('dispute_window_days','30'::jsonb) ON CONFLICT (key) DO NOTHING;

-- Shipping
CREATE TABLE public.shipping_profiles (seller_id uuid PRIMARY KEY REFERENCES public.sellers(id) ON DELETE CASCADE, origin_zip text, flat_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK(flat_fee>=0), free_over numeric(12,2) CHECK(free_over>0), pickup_available boolean NOT NULL DEFAULT false, handling_days int NOT NULL DEFAULT 2 CHECK(handling_days BETWEEN 0 AND 30), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.shipping_profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.shipping_profiles TO authenticated;
GRANT ALL ON public.shipping_profiles TO service_role;
ALTER TABLE public.shipping_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY ship_public_read ON public.shipping_profiles FOR SELECT USING (public.is_approved_seller(seller_id) OR public.owns_seller(seller_id));
CREATE POLICY ship_own_insert ON public.shipping_profiles FOR INSERT TO authenticated WITH CHECK (public.owns_seller(seller_id));
CREATE POLICY ship_own_update ON public.shipping_profiles FOR UPDATE TO authenticated USING (public.owns_seller(seller_id)) WITH CHECK (public.owns_seller(seller_id));

CREATE OR REPLACE FUNCTION public.shipping_fee(_seller_id uuid, _subtotal numeric) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((SELECT CASE WHEN free_over IS NOT NULL AND _subtotal >= free_over THEN 0 ELSE flat_fee END FROM public.shipping_profiles WHERE seller_id=_seller_id),0)
$$;
GRANT EXECUTE ON FUNCTION public.shipping_fee(uuid,numeric) TO anon, authenticated;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_total numeric(12,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS expires_at timestamptz, ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
CREATE TABLE public.order_shipments (order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, seller_id uuid NOT NULL REFERENCES public.sellers(id), amount numeric(12,2) NOT NULL DEFAULT 0, PRIMARY KEY(order_id,seller_id));
GRANT SELECT ON public.order_shipments TO authenticated;
GRANT ALL ON public.order_shipments TO service_role;
ALTER TABLE public.order_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY shipments_read ON public.order_shipments FOR SELECT TO authenticated USING (public.is_order_buyer(order_id) OR public.owns_seller(seller_id) OR public.has_role(auth.uid(),'admin'));

-- Notifications
CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, title text NOT NULL, body text, link text, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_own_read ON public.notifications FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY notif_own_update ON public.notifications FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
CREATE OR REPLACE FUNCTION public.notify(_user uuid, _title text, _body text, _link text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO public.notifications(user_id,title,body,link) SELECT _user,_title,_body,_link WHERE _user IS NOT NULL
$$;
REVOKE EXECUTE ON FUNCTION public.notify(uuid,text,text,text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_item_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_buyer uuid; v_seller_user uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT buyer_id INTO v_buyer FROM public.orders WHERE id=NEW.order_id;
  SELECT user_id INTO v_seller_user FROM public.sellers WHERE id=NEW.seller_id;
  IF NEW.status='shipped' THEN PERFORM public.notify(v_buyer,'Seu pedido foi enviado', COALESCE('Rastreio: '||NEW.tracking_code,'A loja marcou o envio.'), '/pedidos/'||NEW.order_id);
  ELSIF NEW.status='delivered' THEN PERFORM public.notify(v_seller_user,'Recebimento confirmado','O comprador confirmou o recebimento.','/minha-loja');
  ELSIF NEW.status='cancelled' THEN PERFORM public.notify(v_seller_user,'Item cancelado','Um item de pedido foi cancelado.','/minha-loja'); PERFORM public.notify(v_buyer,'Item cancelado','Um item do seu pedido foi cancelado.','/pedidos/'||NEW.order_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_items_notify AFTER UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.notify_item_status();

-- Expire unpaid orders and restore stock
CREATE OR REPLACE FUNCTION public.release_order_stock(_order_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it record;
BEGIN
  PERFORM set_config('app.system','on',true);
  FOR it IN SELECT * FROM public.order_items WHERE order_id=_order_id AND status='pending' LOOP
    UPDATE public.listings SET quantity=quantity+it.quantity, status=CASE WHEN status='sold_out' THEN 'active' ELSE status END, updated_at=now() WHERE id=it.listing_id;
  END LOOP;
  UPDATE public.order_items SET status='cancelled' WHERE order_id=_order_id AND status='pending';
  UPDATE public.orders SET status='cancelled', cancelled_at=now() WHERE id=_order_id;
  UPDATE public.payments SET status=CASE WHEN status='succeeded' THEN 'refunded' ELSE 'failed' END WHERE order_id=_order_id AND status IN ('pending','succeeded');
  PERFORM set_config('app.system','off',true);
END $$;
REVOKE EXECUTE ON FUNCTION public.release_order_stock(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.expire_unpaid_orders() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o record; n int := 0;
BEGIN
  FOR o IN SELECT id FROM public.orders WHERE status='awaiting_payment' AND expires_at IS NOT NULL AND expires_at < now() FOR UPDATE SKIP LOCKED LOOP
    PERFORM public.release_order_stock(o.id); n := n+1;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_orders() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_order(_order_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o record;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
  IF NOT FOUND OR (o.buyer_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF o.status NOT IN ('awaiting_payment','paid') THEN RAISE EXCEPTION 'Este pedido não pode mais ser cancelado'; END IF;
  IF EXISTS (SELECT 1 FROM public.order_items WHERE order_id=_order_id AND status<>'pending') THEN RAISE EXCEPTION 'Algum item já foi enviado; abra um problema no pedido'; END IF;
  PERFORM public.release_order_stock(_order_id);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO authenticated;

-- place_order with shipping and reservation
CREATE OR REPLACE FUNCTION public.place_order(_items jsonb, _ship jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_order uuid; v_rate numeric; it jsonb; l record; v_sub numeric := 0; v_com numeric := 0; q int; c numeric; v_ship numeric := 0; s record;
begin
  if auth.uid() is null then raise exception 'Faça login para comprar'; end if;
  if _items is null or jsonb_array_length(_items) = 0 then raise exception 'Carrinho vazio'; end if;
  if jsonb_array_length(_items) > 50 then raise exception 'Carrinho muito grande'; end if;
  perform public.expire_unpaid_orders();
  select coalesce((value #>> '{}')::numeric, 0) into v_rate from public.platform_settings where key = 'commission_rate';
  v_rate := coalesce(v_rate, 0);
  insert into public.orders (buyer_id, subtotal, commission_total, seller_total, ship_name, ship_address, ship_city, ship_state, ship_zip, expires_at)
    values (auth.uid(), 0, 0, 0, _ship->>'name', _ship->>'address', _ship->>'city', _ship->>'state', _ship->>'zip', now() + interval '15 minutes') returning id into v_order;
  for it in select * from jsonb_array_elements(_items) loop
    q := (it->>'quantity')::int;
    if q is null or q < 1 then raise exception 'Quantidade inválida'; end if;
    select li.* into l from public.listings li join public.sellers s2 on s2.id = li.seller_id
      where li.id = (it->>'listing_id')::uuid and li.status = 'active' and s2.status = 'approved' for update of li;
    if not found then raise exception 'Oferta indisponível'; end if;
    if l.quantity < q then raise exception 'Estoque insuficiente'; end if;
    if public.owns_seller(l.seller_id) then raise exception 'Você não pode comprar da sua própria loja'; end if;
    update public.listings set quantity = quantity - q, status = case when quantity - q = 0 then 'sold_out' else status end, updated_at = now() where id = l.id;
    c := round(l.price*q*v_rate, 2);
    insert into public.order_items (order_id, listing_id, seller_id, card_id, quantity, unit_price, commission_rate, commission_amount, seller_amount)
      values (v_order, l.id, l.seller_id, l.card_id, q, l.price, v_rate, c, l.price*q - c);
    v_sub := v_sub + l.price*q; v_com := v_com + c;
  end loop;
  for s in select seller_id, sum(unit_price*quantity) sub from public.order_items where order_id=v_order group by seller_id loop
    insert into public.order_shipments(order_id,seller_id,amount) values (v_order, s.seller_id, public.shipping_fee(s.seller_id, s.sub));
    v_ship := v_ship + public.shipping_fee(s.seller_id, s.sub);
    perform public.notify((select user_id from public.sellers where id=s.seller_id),'Nova venda','Você recebeu um novo pedido.','/minha-loja');
  end loop;
  update public.orders set subtotal = v_sub, shipping_total = v_ship, commission_total = v_com, seller_total = v_sub - v_com + v_ship where id = v_order;
  insert into public.payments (order_id, provider, environment, amount, currency) values (v_order, 'test', 'sandbox', v_sub + v_ship, 'BRL');
  return v_order;
end $function$;

-- Test payment confirmation is disabled for buyers. Real paid status comes only from
-- a verified Mercado Pago webhook (or an explicit ops path with service_role).
CREATE OR REPLACE FUNCTION public.confirm_test_payment(_order_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RAISE EXCEPTION 'Pagamento de teste desativado. Use Mercado Pago.';
END $$;
REVOKE ALL ON FUNCTION public.confirm_test_payment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_test_payment(uuid) TO service_role;

-- Disputes
CREATE TABLE public.disputes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_item_id uuid NOT NULL UNIQUE REFERENCES public.order_items(id), order_id uuid NOT NULL REFERENCES public.orders(id), buyer_id uuid NOT NULL, seller_id uuid NOT NULL REFERENCES public.sellers(id),
 reason text NOT NULL CHECK(reason IN ('not_received','not_as_described','damaged','other')), description text NOT NULL CHECK(length(trim(description)) BETWEEN 10 AND 4000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','seller_responded','escalated','resolved_refund','resolved_partial','resolved_seller')),
 resolution_amount numeric(12,2), resolution_note text, seller_deadline timestamptz NOT NULL DEFAULT now() + interval '3 days', created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz);
GRANT SELECT ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY disputes_read ON public.disputes FOR SELECT TO authenticated USING (buyer_id=auth.uid() OR public.owns_seller(seller_id) OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.dispute_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dispute_id uuid NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE, sender_id uuid NOT NULL, body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.dispute_messages TO authenticated;
GRANT ALL ON public.dispute_messages TO service_role;
ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY dmsg_read ON public.dispute_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.disputes d WHERE d.id=dispute_id AND (d.buyer_id=auth.uid() OR public.owns_seller(d.seller_id) OR public.has_role(auth.uid(),'admin'))));

CREATE OR REPLACE FUNCTION public.open_dispute(_item_id uuid, _reason text, _description text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it record; v_id uuid; v_days int; v_order record;
BEGIN
  SELECT * INTO it FROM public.order_items WHERE id=_item_id;
  IF NOT FOUND OR NOT public.is_order_buyer(it.order_id) THEN RAISE EXCEPTION 'Somente o comprador pode abrir um problema'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=it.order_id;
  IF v_order.status NOT IN ('paid','shipped','delivered') THEN RAISE EXCEPTION 'Pedido sem pagamento confirmado'; END IF;
  IF it.status='cancelled' THEN RAISE EXCEPTION 'Item cancelado'; END IF;
  SELECT COALESCE((value #>> '{}')::int,30) INTO v_days FROM public.platform_settings WHERE key='dispute_window_days';
  IF it.delivered_at IS NOT NULL AND it.delivered_at < now() - make_interval(days => COALESCE(v_days,30)) THEN RAISE EXCEPTION 'Prazo para abrir problema encerrado'; END IF;
  IF it.status='pending' AND _reason='not_received' THEN RAISE EXCEPTION 'O item ainda não foi enviado; você pode cancelar o pedido'; END IF;
  INSERT INTO public.disputes(order_item_id,order_id,buyer_id,seller_id,reason,description) VALUES (_item_id,it.order_id,auth.uid(),it.seller_id,_reason,trim(_description)) RETURNING id INTO v_id;
  INSERT INTO public.dispute_messages(dispute_id,sender_id,body) VALUES (v_id,auth.uid(),trim(_description));
  PERFORM public.notify((SELECT user_id FROM public.sellers WHERE id=it.seller_id),'Problema aberto em um pedido','Responda em até 3 dias.','/minha-loja');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.open_dispute(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reply_dispute(_dispute_id uuid, _body text, _escalate boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d record; v_is_seller boolean; v_is_admin boolean;
BEGIN
  SELECT * INTO d FROM public.disputes WHERE id=_dispute_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Problema não encontrado'; END IF;
  v_is_seller := public.owns_seller(d.seller_id); v_is_admin := public.has_role(auth.uid(),'admin');
  IF NOT (d.buyer_id=auth.uid() OR v_is_seller OR v_is_admin) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF d.status LIKE 'resolved%' THEN RAISE EXCEPTION 'Problema já resolvido'; END IF;
  IF length(trim(coalesce(_body,''))) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Mensagem deve ter de 1 a 4000 caracteres'; END IF;
  INSERT INTO public.dispute_messages(dispute_id,sender_id,body) VALUES (_dispute_id,auth.uid(),trim(_body));
  IF _escalate AND (d.buyer_id=auth.uid() OR v_is_seller) THEN UPDATE public.disputes SET status='escalated' WHERE id=_dispute_id;
  ELSIF v_is_seller AND d.status='open' THEN UPDATE public.disputes SET status='seller_responded' WHERE id=_dispute_id; END IF;
  IF v_is_seller THEN PERFORM public.notify(d.buyer_id,'A loja respondeu ao problema',NULL,'/pedidos/'||d.order_id);
  ELSE PERFORM public.notify((SELECT user_id FROM public.sellers WHERE id=d.seller_id),'Nova mensagem em um problema',NULL,'/minha-loja'); END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.reply_dispute(uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(_dispute_id uuid, _outcome text, _amount numeric, _note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d record; it record;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _outcome NOT IN ('resolved_refund','resolved_partial','resolved_seller') THEN RAISE EXCEPTION 'Decisão inválida'; END IF;
  SELECT * INTO d FROM public.disputes WHERE id=_dispute_id FOR UPDATE;
  IF NOT FOUND OR d.status LIKE 'resolved%' THEN RAISE EXCEPTION 'Problema não encontrado ou já resolvido'; END IF;
  SELECT * INTO it FROM public.order_items WHERE id=d.order_item_id;
  IF _outcome='resolved_partial' AND (_amount IS NULL OR _amount<=0 OR _amount > it.unit_price*it.quantity) THEN RAISE EXCEPTION 'Valor parcial inválido'; END IF;
  UPDATE public.disputes SET status=_outcome, resolution_amount=CASE _outcome WHEN 'resolved_refund' THEN it.unit_price*it.quantity WHEN 'resolved_partial' THEN _amount ELSE 0 END, resolution_note=_note, resolved_at=now() WHERE id=_dispute_id;
  IF _outcome='resolved_refund' THEN PERFORM set_config('app.system','on',true); UPDATE public.order_items SET status='cancelled' WHERE id=it.id; PERFORM set_config('app.system','off',true); END IF;
  PERFORM public.notify(d.buyer_id,'Problema resolvido pela PokePlace',_note,'/pedidos/'||d.order_id);
  PERFORM public.notify((SELECT user_id FROM public.sellers WHERE id=d.seller_id),'Problema resolvido pela PokePlace',_note,'/minha-loja');
END $$;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid,text,numeric,text) TO authenticated;

-- Order chat with contact filter
CREATE TABLE public.order_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, seller_id uuid NOT NULL REFERENCES public.sellers(id), sender_id uuid NOT NULL, body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.order_messages TO authenticated;
GRANT ALL ON public.order_messages TO service_role;
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY omsg_read ON public.order_messages FOR SELECT TO authenticated USING (public.is_order_buyer(order_id) OR public.owns_seller(seller_id) OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.mask_contacts(_t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(regexp_replace(regexp_replace(_t, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contato removido]', 'g'), '(\+?\d[\d\s().-]{7,}\d)', '[contato removido]', 'g'), '(wa\.me|whatsapp|instagram\.com|t\.me)[^\s]*', '[contato removido]', 'gi')
$$;

CREATE OR REPLACE FUNCTION public.send_order_message(_order_id uuid, _seller_id uuid, _body text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_buyer uuid;
BEGIN
  SELECT buyer_id INTO v_buyer FROM public.orders WHERE id=_order_id;
  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id=_order_id AND seller_id=_seller_id) THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF NOT (v_buyer=auth.uid() OR public.owns_seller(_seller_id)) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF length(trim(coalesce(_body,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Mensagem deve ter de 1 a 2000 caracteres'; END IF;
  INSERT INTO public.order_messages(order_id,seller_id,sender_id,body) VALUES (_order_id,_seller_id,auth.uid(),public.mask_contacts(trim(_body)));
  IF v_buyer=auth.uid() THEN PERFORM public.notify((SELECT user_id FROM public.sellers WHERE id=_seller_id),'Nova mensagem do comprador',NULL,'/minha-loja');
  ELSE PERFORM public.notify(v_buyer,'Nova mensagem da loja',NULL,'/pedidos/'||_order_id); END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.send_order_message(uuid,uuid,text) TO authenticated;

-- Public questions on listings
CREATE TABLE public.listing_questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE, card_id text NOT NULL REFERENCES public.cards(id), seller_id uuid NOT NULL REFERENCES public.sellers(id), user_id uuid NOT NULL, question text NOT NULL, answer text, answered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX listing_questions_card_idx ON public.listing_questions(card_id);
GRANT SELECT (id,listing_id,card_id,seller_id,question,answer,answered_at,created_at) ON public.listing_questions TO anon, authenticated;
GRANT ALL ON public.listing_questions TO service_role;
ALTER TABLE public.listing_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY lq_read ON public.listing_questions FOR SELECT USING (answer IS NOT NULL OR user_id=auth.uid() OR public.owns_seller(seller_id) OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.ask_question(_listing_id uuid, _question text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para perguntar'; END IF;
  SELECT * INTO l FROM public.listings WHERE id=_listing_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta indisponível'; END IF;
  IF public.owns_seller(l.seller_id) THEN RAISE EXCEPTION 'Você não pode perguntar na própria oferta'; END IF;
  IF length(trim(coalesce(_question,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Pergunta deve ter de 5 a 500 caracteres'; END IF;
  IF (SELECT count(*) FROM public.listing_questions WHERE user_id=auth.uid() AND created_at > now()-interval '1 hour') >= 10 THEN RAISE EXCEPTION 'Muitas perguntas; tente mais tarde'; END IF;
  INSERT INTO public.listing_questions(listing_id,card_id,seller_id,user_id,question) VALUES (_listing_id,l.card_id,l.seller_id,auth.uid(),public.mask_contacts(trim(_question)));
  PERFORM public.notify((SELECT user_id FROM public.sellers WHERE id=l.seller_id),'Nova pergunta em um anúncio',NULL,'/minha-loja');
END $$;
GRANT EXECUTE ON FUNCTION public.ask_question(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.answer_question(_question_id uuid, _answer text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q record;
BEGIN
  SELECT * INTO q FROM public.listing_questions WHERE id=_question_id FOR UPDATE;
  IF NOT FOUND OR NOT public.owns_seller(q.seller_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF q.answer IS NOT NULL THEN RAISE EXCEPTION 'Pergunta já respondida'; END IF;
  IF length(trim(coalesce(_answer,''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Resposta deve ter de 1 a 1000 caracteres'; END IF;
  UPDATE public.listing_questions SET answer=public.mask_contacts(trim(_answer)), answered_at=now() WHERE id=_question_id;
  PERFORM public.notify(q.user_id,'Sua pergunta foi respondida',NULL,'/carta/'||q.card_id);
END $$;
GRANT EXECUTE ON FUNCTION public.answer_question(uuid,text) TO authenticated;

-- Reports
CREATE TABLE public.reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL, target_type text NOT NULL CHECK(target_type IN ('listing','seller','question','review')), target_id uuid NOT NULL, reason text NOT NULL CHECK(reason IN ('fake','misleading','prohibited','abuse','off_platform','other')), details text CHECK(length(details)<=2000), status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','actioned','dismissed')), admin_note text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(reporter_id,target_type,target_id));
GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_insert ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id=auth.uid() AND status='open' AND admin_note IS NULL);
CREATE POLICY reports_read ON public.reports FOR SELECT TO authenticated USING (reporter_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.admin_review_report(_report_id uuid, _status text, _note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _status NOT IN ('actioned','dismissed') THEN RAISE EXCEPTION 'Status inválido'; END IF;
  UPDATE public.reports SET status=_status, admin_note=_note WHERE id=_report_id RETURNING * INTO r;
  IF _status='actioned' AND r.target_type='listing' THEN UPDATE public.listings SET status='removed' WHERE id=r.target_id; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_review_report(uuid,text,text) TO authenticated;

-- New seller listing limit
CREATE OR REPLACE FUNCTION public.enforce_listing_limit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_limit int; v_sales int;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.status='active' THEN RETURN NEW; END IF;
  SELECT COALESCE((value #>> '{}')::int,50) INTO v_limit FROM public.platform_settings WHERE key='new_seller_listing_limit';
  SELECT completed_sales INTO v_sales FROM public.get_seller_reputation(NEW.seller_id);
  IF COALESCE(v_sales,0) < 5 AND (SELECT count(*) FROM public.listings WHERE seller_id=NEW.seller_id AND status='active' AND id<>NEW.id) >= COALESCE(v_limit,50) THEN
    RAISE EXCEPTION 'Lojas novas podem ter até % anúncios ativos até completar 5 vendas', v_limit;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER listings_limit BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.enforce_listing_limit();

-- Payouts
CREATE TABLE public.payout_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seller_id uuid NOT NULL REFERENCES public.sellers(id), amount numeric(12,2) NOT NULL CHECK(amount>0), pix_key text NOT NULL CHECK(length(trim(pix_key)) BETWEEN 5 AND 140), status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','paid','rejected')), admin_note text, created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz);
GRANT SELECT ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY payouts_read ON public.payout_requests FOR SELECT TO authenticated USING (public.owns_seller(seller_id) OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.get_seller_balance(_seller_id uuid) RETURNS TABLE(pending numeric, available numeric, paid_out numeric, requested numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_days int; v_released numeric; v_pending numeric; v_paid numeric; v_req numeric;
BEGIN
  IF NOT (public.owns_seller(_seller_id) OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT COALESCE((value #>> '{}')::int,7) INTO v_days FROM public.platform_settings WHERE key='payout_release_days';
  WITH items AS (
    SELECT oi.*, COALESCE(sh.amount,0) * 0 AS _z, (SELECT d.status FROM public.disputes d WHERE d.order_item_id=oi.id) dstatus, (SELECT d.resolution_amount FROM public.disputes d WHERE d.order_item_id=oi.id) damount
    FROM public.order_items oi LEFT JOIN public.order_shipments sh ON sh.order_id=oi.order_id AND sh.seller_id=oi.seller_id
    WHERE oi.seller_id=_seller_id AND oi.status<>'cancelled' AND public.is_real_completed_order(oi.order_id) IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id=oi.order_id AND p.environment='live' AND p.status='succeeded'))
  SELECT
    COALESCE(sum(CASE WHEN status='delivered' AND delivered_at < now()-make_interval(days=>v_days) AND (dstatus IS NULL OR dstatus LIKE 'resolved%') THEN seller_amount - COALESCE(damount,0) END),0),
    COALESCE(sum(CASE WHEN NOT (status='delivered' AND delivered_at < now()-make_interval(days=>v_days) AND (dstatus IS NULL OR dstatus LIKE 'resolved%')) THEN seller_amount END),0)
  INTO v_released, v_pending FROM items;
  SELECT COALESCE(sum(amount) FILTER (WHERE status='paid'),0), COALESCE(sum(amount) FILTER (WHERE status='requested'),0) INTO v_paid, v_req FROM public.payout_requests WHERE seller_id=_seller_id;
  RETURN QUERY SELECT v_pending, GREATEST(v_released - v_paid - v_req,0), v_paid, v_req;
END $$;
GRANT EXECUTE ON FUNCTION public.get_seller_balance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_payout(_seller_id uuid, _amount numeric, _pix_key text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_avail numeric; v_id uuid;
BEGIN
  IF NOT public.owns_seller(_seller_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  PERFORM 1 FROM public.sellers WHERE id=_seller_id FOR UPDATE;
  SELECT available INTO v_avail FROM public.get_seller_balance(_seller_id);
  IF _amount IS NULL OR _amount <= 0 OR _amount > v_avail THEN RAISE EXCEPTION 'Valor acima do saldo disponível'; END IF;
  INSERT INTO public.payout_requests(seller_id,amount,pix_key) VALUES (_seller_id,round(_amount,2),trim(_pix_key)) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.request_payout(uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_process_payout(_payout_id uuid, _status text, _note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _status NOT IN ('paid','rejected') THEN RAISE EXCEPTION 'Status inválido'; END IF;
  UPDATE public.payout_requests SET status=_status, admin_note=_note, processed_at=now() WHERE id=_payout_id AND status='requested' RETURNING * INTO p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saque não encontrado ou já processado'; END IF;
  PERFORM public.notify((SELECT user_id FROM public.sellers WHERE id=p.seller_id), CASE WHEN _status='paid' THEN 'Saque pago' ELSE 'Saque recusado' END, _note, '/minha-loja');
END $$;
GRANT EXECUTE ON FUNCTION public.admin_process_payout(uuid,text,text) TO authenticated;

-- Admin settings
CREATE OR REPLACE FUNCTION public.admin_set_setting(_key text, _value numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _key NOT IN ('commission_rate','payout_release_days','new_seller_listing_limit','dispute_window_days') THEN RAISE EXCEPTION 'Configuração inválida'; END IF;
  IF _key='commission_rate' AND (_value<0 OR _value>0.5) THEN RAISE EXCEPTION 'Comissão deve ficar entre 0%% e 50%%'; END IF;
  IF _key<>'commission_rate' AND (_value<0 OR _value>365 OR _value<>trunc(_value)) THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  INSERT INTO public.platform_settings(key,value,updated_at) VALUES (_key,to_jsonb(_value),now()) ON CONFLICT (key) DO UPDATE SET value=excluded.value, updated_at=now();
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_setting(text,numeric) TO authenticated;

-- Account data export / deletion request
CREATE TABLE public.account_deletion_requests (user_id uuid PRIMARY KEY, reason text, status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','done')), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT ON public.account_deletion_requests TO authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY adr_insert ON public.account_deletion_requests FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND status='requested');
CREATE POLICY adr_read ON public.account_deletion_requests FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));


-- ===== 0010_ship_only_paid.sql =====
CREATE OR REPLACE FUNCTION public.require_paid_before_ship() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='shipped' AND OLD.status='pending' AND (SELECT status FROM public.orders WHERE id=NEW.order_id) <> 'paid' THEN
    RAISE EXCEPTION 'Envie somente depois do pagamento confirmado';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_items_paid_before_ship BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.require_paid_before_ship();

-- ===== 0011_marketplace_channels.sql =====
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


-- ===== 0012_disable_buyer_test_payment.sql =====
-- Harden payment integrity: buyers cannot mark orders paid without Mercado Pago.
CREATE OR REPLACE FUNCTION public.confirm_test_payment(_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RAISE EXCEPTION 'Pagamento de teste desativado. Use Mercado Pago.';
END $$;
REVOKE ALL ON FUNCTION public.confirm_test_payment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_test_payment(uuid) TO service_role;

-- ===== confirm_live_payment =====
-- Optional: apply after core migrations. Lets the Mercado Pago webhook
-- (service role) mark an order paid without using the sandbox RPC.

create or replace function public.confirm_live_payment(_order_id uuid, _provider text, _external_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and not public.has_role(auth.uid(), 'admin') then
    -- Allow when called with service_role key (PostgREST sets role).
    if current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception 'Acesso negado';
    end if;
  end if;

  update public.orders
     set status = 'paid', expires_at = null
   where id = _order_id and status = 'awaiting_payment';

  if not found then
    raise exception 'Pedido não encontrado ou já processado';
  end if;

  update public.payments
     set status = 'succeeded',
         provider = coalesce(nullif(_provider, ''), provider),
         environment = 'live'
   where order_id = _order_id;

  if not found then
    insert into public.payments (order_id, provider, environment, status, amount, currency)
    select o.id, coalesce(nullif(_provider, ''), 'mercadopago'), 'live', 'succeeded',
           o.subtotal + coalesce(o.shipping_total, 0), 'BRL'
      from public.orders o where o.id = _order_id;
  end if;
end $$;

revoke all on function public.confirm_live_payment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.confirm_live_payment(uuid, text, text) to service_role;


-- ===== 0013_ml_marketplace_rules_and_rankings.sql =====
-- Mercado Livre-style marketplace rules, seller thermometer & medals, automatic strikes,
-- shipping SLA (ship_by), 7-day CDC regret/returns, 14-day auto-delivery confirmation,
-- and LGPD-safe opt-in buyer reputation & rankings.

-- 1. Platform settings defaults (idempotent)
INSERT INTO public.platform_settings (key, value) VALUES
  ('auto_confirm_delivery_days', '14'::jsonb),
  ('max_cancel_rate_pct', '5'::jsonb),
  ('max_claim_rate_pct', '5'::jsonb),
  ('regret_window_days', '7'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. Shipping SLA deadline (ship_by) & seller strike review marker
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS ship_by timestamptz;
ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS strike_cleared_at timestamptz;

-- Ensure mark_item_shipped records shipped_at for SLA calculation & 14-day auto-confirmation
CREATE OR REPLACE FUNCTION public.mark_item_shipped(_item_id uuid, _carrier text, _tracking text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF length(trim(coalesce(_carrier, ''))) NOT BETWEEN 2 AND 80
     OR length(trim(coalesce(_tracking, ''))) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'Informe transportadora e código de rastreio';
  END IF;

  UPDATE public.order_items
     SET status = 'shipped',
         shipping_carrier = trim(_carrier),
         tracking_code = trim(_tracking),
         shipped_at = coalesce(shipped_at, now())
   WHERE id = _item_id
     AND status = 'pending'
     AND public.owns_seller(seller_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda indisponível para envio';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.mark_item_shipped(uuid, text, text) TO authenticated;

-- Populate ship_by from seller shipping_profiles.handling_days when live payment confirms
CREATE OR REPLACE FUNCTION public.confirm_live_payment(_order_id uuid, _provider text, _external_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Acesso negado';
    END IF;
  END IF;

  UPDATE public.orders
     SET status = 'paid', expires_at = NULL
   WHERE id = _order_id AND status = 'awaiting_payment';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou já processado';
  END IF;

  UPDATE public.order_items oi
     SET ship_by = now() + make_interval(days => COALESCE(
       (SELECT sp.handling_days FROM public.shipping_profiles sp WHERE sp.seller_id = oi.seller_id),
       2
     ))
   WHERE oi.order_id = _order_id
     AND oi.status = 'pending'
     AND oi.ship_by IS NULL;

  UPDATE public.payments
     SET status = 'succeeded',
         provider = coalesce(nullif(_provider, ''), provider),
         environment = 'live'
   WHERE order_id = _order_id;

  IF NOT FOUND THEN
    INSERT INTO public.payments (order_id, provider, environment, status, amount, currency)
    SELECT o.id, coalesce(nullif(_provider, ''), 'mercadopago'), 'live', 'succeeded',
           o.subtotal + coalesce(o.shipping_total, 0), 'BRL'
      FROM public.orders o WHERE o.id = _order_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.confirm_live_payment(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_live_payment(uuid, text, text) TO service_role;

-- 3. 7-day CDC right of regret (Art. 49) & return shipment tracking on disputes
ALTER TABLE public.disputes DROP CONSTRAINT IF EXISTS disputes_reason_check;
ALTER TABLE public.disputes
  ADD CONSTRAINT disputes_reason_check
  CHECK (reason IN ('not_received', 'not_as_described', 'damaged', 'regret_7d', 'other'));

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS return_carrier text,
  ADD COLUMN IF NOT EXISTS return_tracking_code text,
  ADD COLUMN IF NOT EXISTS return_submitted_at timestamptz;

CREATE OR REPLACE FUNCTION public.open_dispute(_item_id uuid, _reason text, _description text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it record;
  v_id uuid;
  v_days int;
  v_regret_days int;
  v_order record;
BEGIN
  SELECT * INTO it FROM public.order_items WHERE id = _item_id;
  IF NOT FOUND OR NOT public.is_order_buyer(it.order_id) THEN
    RAISE EXCEPTION 'Somente o comprador pode abrir um problema';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = it.order_id;
  IF v_order.status NOT IN ('paid', 'shipped', 'delivered') THEN
    RAISE EXCEPTION 'Pedido sem pagamento confirmado';
  END IF;
  IF it.status = 'cancelled' THEN
    RAISE EXCEPTION 'Item cancelado';
  END IF;

  IF _reason = 'regret_7d' THEN
    SELECT COALESCE((value #>> '{}')::int, 7) INTO v_regret_days FROM public.platform_settings WHERE key = 'regret_window_days';
    IF it.status <> 'delivered' OR it.delivered_at IS NULL THEN
      RAISE EXCEPTION 'O direito de arrependimento (CDC Art. 49) pode ser solicitado após a entrega do pedido.';
    END IF;
    IF it.delivered_at < now() - make_interval(days => COALESCE(v_regret_days, 7)) THEN
      RAISE EXCEPTION 'O prazo legal de arrependimento (% dias após a entrega) foi encerrado.', COALESCE(v_regret_days, 7);
    END IF;
  ELSE
    SELECT COALESCE((value #>> '{}')::int, 30) INTO v_days FROM public.platform_settings WHERE key = 'dispute_window_days';
    IF it.delivered_at IS NOT NULL AND it.delivered_at < now() - make_interval(days => COALESCE(v_days, 30)) THEN
      RAISE EXCEPTION 'Prazo para abrir problema encerrado';
    END IF;
    IF it.status = 'pending' AND _reason = 'not_received' THEN
      RAISE EXCEPTION 'O item ainda não foi enviado; você pode cancelar o pedido';
    END IF;
  END IF;

  INSERT INTO public.disputes (order_item_id, order_id, buyer_id, seller_id, reason, description)
  VALUES (_item_id, it.order_id, auth.uid(), it.seller_id, _reason, trim(_description))
  RETURNING id INTO v_id;

  INSERT INTO public.dispute_messages (dispute_id, sender_id, body)
  VALUES (v_id, auth.uid(), trim(_description));

  PERFORM public.notify(
    (SELECT user_id FROM public.sellers WHERE id = it.seller_id),
    CASE WHEN _reason = 'regret_7d' THEN 'Solicitação de devolução (7 dias CDC)' ELSE 'Problema aberto em um pedido' END,
    'Responda em até 3 dias.',
    '/minha-loja'
  );
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.open_dispute(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_dispute_return(_dispute_id uuid, _carrier text, _tracking text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE d record;
BEGIN
  SELECT * INTO d FROM public.disputes WHERE id = _dispute_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Problema não encontrado'; END IF;
  IF d.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'Somente o comprador pode informar o rastreio da devolução'; END IF;
  IF d.status LIKE 'resolved%' THEN RAISE EXCEPTION 'Problema já resolvido'; END IF;
  IF length(trim(coalesce(_carrier, ''))) NOT BETWEEN 2 AND 80
     OR length(trim(coalesce(_tracking, ''))) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'Informe a transportadora e o código de rastreio da devolução';
  END IF;

  UPDATE public.disputes
     SET return_carrier = trim(_carrier),
         return_tracking_code = trim(_tracking),
         return_submitted_at = now()
   WHERE id = _dispute_id;

  INSERT INTO public.dispute_messages (dispute_id, sender_id, body)
  VALUES (_dispute_id, auth.uid(), format('Devolução postada: %s · Rastreio %s', trim(_carrier), trim(_tracking)));

  PERFORM public.notify(
    (SELECT user_id FROM public.sellers WHERE id = d.seller_id),
    'Devolução postada pelo comprador',
    format('%s · %s', trim(_carrier), trim(_tracking)),
    '/minha-loja'
  );
END $$;
GRANT EXECUTE ON FUNCTION public.submit_dispute_return(uuid, text, text) TO authenticated;

-- 4. Auto-confirm delivery after N days (default 14) with no open dispute
CREATE OR REPLACE FUNCTION public.auto_confirm_delivered_orders(_days int DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
  v_count int := 0;
  rec record;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin')
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT COALESCE(_days, (SELECT (value #>> '{}')::int FROM public.platform_settings WHERE key = 'auto_confirm_delivery_days'), 14)
    INTO v_days;

  FOR rec IN
    SELECT oi.id, oi.order_id, oi.seller_id, o.buyer_id
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
     WHERE oi.status = 'shipped'
       AND oi.shipped_at IS NOT NULL
       AND oi.shipped_at <= now() - make_interval(days => greatest(1, v_days))
       AND EXISTS (
         SELECT 1 FROM public.payments p
          WHERE p.order_id = oi.order_id AND p.status = 'succeeded' AND p.environment = 'live'
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.disputes d
          WHERE d.order_item_id = oi.id AND d.status NOT LIKE 'resolved%'
       )
     FOR UPDATE OF oi SKIP LOCKED
  LOOP
    UPDATE public.order_items
       SET status = 'delivered', delivered_at = now()
     WHERE id = rec.id;

    IF NOT EXISTS (
      SELECT 1 FROM public.order_items
       WHERE order_id = rec.order_id AND status NOT IN ('delivered', 'cancelled')
    ) THEN
      UPDATE public.orders SET status = 'delivered' WHERE id = rec.order_id;
    END IF;

    PERFORM public.notify(rec.buyer_id, 'Entrega confirmada automaticamente', 'O prazo pós-envio terminou sem problemas abertos.', '/pedidos/' || rec.order_id::text);
    PERFORM public.notify((SELECT user_id FROM public.sellers WHERE id = rec.seller_id), 'Entrega confirmada automaticamente', 'O saldo entrará no ciclo normal de liberação.', '/minha-loja');
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.auto_confirm_delivered_orders(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_confirm_delivered_orders(int) TO authenticated, service_role;

-- 5. Seller Thermometer (Mercado Livre 4-pillar model) + Medals + Automatic Strikes + Public Seller Ranking
CREATE OR REPLACE FUNCTION public.get_seller_thermometer(_seller_id uuid)
RETURNS TABLE(
  rating numeric,
  reviews bigint,
  completed_sales bigint,
  cancelled bigint,
  total_items bigint,
  claims bigint,
  claim_rate numeric,
  cancel_rate numeric,
  on_time_rate numeric,
  avg_response_hours numeric,
  thermometer text,
  medal text,
  strike_status text,
  score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rep record;
  v_claims bigint := 0;
  v_shipped bigint := 0;
  v_on_time bigint := 0;
  v_avg_resp numeric := NULL;
  v_claim_rate numeric := 0;
  v_cancel_rate numeric := 0;
  v_on_time_rate numeric := 100;
  v_max_claim numeric := 5;
  v_max_cancel numeric := 5;
  v_cleared timestamptz;
  v_thermo text := 'new';
  v_medal text := 'none';
  v_strike text := 'ok';
  v_score numeric := 0;
BEGIN
  IF NOT public.is_approved_seller(_seller_id)
     AND NOT public.owns_seller(_seller_id)
     AND NOT public.has_role(auth.uid(), 'admin')
     AND coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN;
  END IF;

  SELECT * INTO v_rep FROM public.get_seller_reputation(_seller_id);

  SELECT COALESCE((value #>> '{}')::numeric, 5) INTO v_max_claim FROM public.platform_settings WHERE key = 'max_claim_rate_pct';
  SELECT COALESCE((value #>> '{}')::numeric, 5) INTO v_max_cancel FROM public.platform_settings WHERE key = 'max_cancel_rate_pct';
  SELECT s.strike_cleared_at INTO v_cleared FROM public.sellers s WHERE s.id = _seller_id;

  SELECT count(*) INTO v_claims
    FROM public.disputes d
   WHERE d.seller_id = _seller_id
     AND EXISTS (
       SELECT 1 FROM public.payments p
        WHERE p.order_id = d.order_id AND p.status = 'succeeded' AND p.environment = 'live'
     );

  SELECT count(*),
         count(*) FILTER (WHERE oi.ship_by IS NULL OR oi.shipped_at <= oi.ship_by)
    INTO v_shipped, v_on_time
    FROM public.order_items oi
   WHERE oi.seller_id = _seller_id
     AND oi.shipped_at IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.payments p
        WHERE p.order_id = oi.order_id AND p.status = 'succeeded' AND p.environment = 'live'
     );

  SELECT round(avg(extract(epoch FROM (q.answered_at - q.created_at)) / 3600.0)::numeric, 1)
    INTO v_avg_resp
    FROM public.listing_questions q
   WHERE q.seller_id = _seller_id
     AND q.answered_at IS NOT NULL
     AND q.created_at >= now() - interval '90 days';

  IF COALESCE(v_rep.total_items, 0) > 0 THEN
    v_claim_rate := round((v_claims::numeric / v_rep.total_items::numeric) * 100, 1);
    v_cancel_rate := round((COALESCE(v_rep.cancelled, 0)::numeric / v_rep.total_items::numeric) * 100, 1);
  END IF;

  IF v_shipped > 0 THEN
    v_on_time_rate := round((v_on_time::numeric / v_shipped::numeric) * 100, 1);
  END IF;

  -- Thermometer color (5 bars, Mercado Livre style)
  IF COALESCE(v_rep.completed_sales, 0) < 3 AND COALESCE(v_rep.reviews, 0) < 3 THEN
    v_thermo := 'new';
  ELSIF v_claim_rate > 8 OR v_cancel_rate > 8 OR v_on_time_rate < 75 OR (COALESCE(v_rep.reviews, 0) >= 3 AND COALESCE(v_rep.rating, 5) < 3.2) THEN
    v_thermo := 'red';
  ELSIF v_claim_rate > 5 OR v_cancel_rate > 5 OR v_on_time_rate < 85 OR (COALESCE(v_rep.reviews, 0) >= 3 AND COALESCE(v_rep.rating, 5) < 3.8) THEN
    v_thermo := 'orange';
  ELSIF v_claim_rate > 3 OR v_cancel_rate > 3 OR v_on_time_rate < 90 OR (COALESCE(v_rep.reviews, 0) >= 3 AND COALESCE(v_rep.rating, 5) < 4.3) THEN
    v_thermo := 'yellow';
  ELSIF v_claim_rate > 2 OR v_cancel_rate > 2 OR v_on_time_rate < 95 OR (COALESCE(v_rep.reviews, 0) >= 3 AND COALESCE(v_rep.rating, 5) < 4.7) THEN
    v_thermo := 'light_green';
  ELSE
    v_thermo := 'green';
  END IF;

  -- Medals (requires green thermometer + real completed sales volume)
  IF v_thermo = 'green' THEN
    IF COALESCE(v_rep.completed_sales, 0) >= 250 THEN
      v_medal := 'lider_platinum';
    ELSIF COALESCE(v_rep.completed_sales, 0) >= 75 THEN
      v_medal := 'lider_gold';
    ELSIF COALESCE(v_rep.completed_sales, 0) >= 25 THEN
      v_medal := 'lider';
    END IF;
  END IF;

  -- Automatic strike status (requires >= 5 total items to avoid punishing new stores)
  IF COALESCE(v_rep.total_items, 0) >= 5 AND (v_claim_rate > v_max_claim OR v_cancel_rate > v_max_cancel) THEN
    v_strike := CASE WHEN v_cleared IS NOT NULL THEN 'warning' ELSE 'restricted' END;
  ELSIF COALESCE(v_rep.total_items, 0) >= 5 AND (v_claim_rate > (v_max_claim * 0.6) OR v_cancel_rate > (v_max_cancel * 0.6) OR v_on_time_rate < 90) THEN
    v_strike := 'warning';
  ELSE
    v_strike := 'ok';
  END IF;

  -- Composite score (0..1000) for ranking
  v_score := round(
    (COALESCE(v_rep.rating, 0) * 120)
    + (least(COALESCE(v_rep.completed_sales, 0), 500) * 0.6)
    + (v_on_time_rate * 1.5)
    - (v_claim_rate * 12)
    - (v_cancel_rate * 10)
    + CASE v_medal
        WHEN 'lider_platinum' THEN 120
        WHEN 'lider_gold' THEN 75
        WHEN 'lider' THEN 35
        ELSE 0
      END,
    1
  );

  RETURN QUERY SELECT
    COALESCE(v_rep.rating, 0)::numeric,
    COALESCE(v_rep.reviews, 0)::bigint,
    COALESCE(v_rep.completed_sales, 0)::bigint,
    COALESCE(v_rep.cancelled, 0)::bigint,
    COALESCE(v_rep.total_items, 0)::bigint,
    v_claims,
    v_claim_rate,
    v_cancel_rate,
    v_on_time_rate,
    v_avg_resp,
    v_thermo,
    v_medal,
    v_strike,
    greatest(v_score, 0)::numeric;
END $$;
REVOKE ALL ON FUNCTION public.get_seller_thermometer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_thermometer(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_ranked_sellers(
  _state text DEFAULT NULL,
  _sort text DEFAULT 'score',
  _limit int DEFAULT 50
)
RETURNS TABLE(
  id uuid,
  store_name text,
  slug text,
  city text,
  state text,
  is_official boolean,
  logo_url text,
  rating numeric,
  reviews bigint,
  completed_sales bigint,
  active_listings bigint,
  claim_rate numeric,
  cancel_rate numeric,
  on_time_rate numeric,
  avg_response_hours numeric,
  thermometer text,
  medal text,
  strike_status text,
  score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.store_name,
    s.slug,
    s.city,
    s.state,
    s.is_official,
    s.logo_url,
    t.rating,
    t.reviews,
    t.completed_sales,
    (SELECT count(*) FROM public.listings l WHERE l.seller_id = s.id AND l.status = 'active' AND l.quantity > 0) AS active_listings,
    t.claim_rate,
    t.cancel_rate,
    t.on_time_rate,
    t.avg_response_hours,
    t.thermometer,
    t.medal,
    t.strike_status,
    t.score
  FROM public.sellers s
  CROSS JOIN LATERAL public.get_seller_thermometer(s.id) t
  WHERE s.status = 'approved'
    AND (_state IS NULL OR trim(_state) = '' OR upper(s.state) = upper(trim(_state)))
  ORDER BY
    CASE WHEN _sort = 'sales' THEN t.completed_sales::numeric
         WHEN _sort = 'rating' THEN t.rating
         ELSE t.score
    END DESC,
    t.completed_sales DESC,
    s.created_at ASC
  LIMIT greatest(1, least(coalesce(_limit, 50), 200));
$$;
REVOKE ALL ON FUNCTION public.list_ranked_sellers(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_ranked_sellers(text, text, int) TO anon, authenticated, service_role;

-- Upgrade listing activation trigger to enforce BOTH new-seller cap and automatic strike freeze
CREATE OR REPLACE FUNCTION public.enforce_listing_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int;
  v_thermo record;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN RETURN NEW; END IF;

  SELECT * INTO v_thermo FROM public.get_seller_thermometer(NEW.seller_id);

  IF v_thermo.strike_status = 'restricted' THEN
    RAISE EXCEPTION 'Loja temporariamente restrita por taxa elevada de reclamações ou cancelamentos. Fale com o suporte PokePlace para revisão.';
  END IF;

  SELECT COALESCE((value #>> '{}')::int, 50) INTO v_limit FROM public.platform_settings WHERE key = 'new_seller_listing_limit';
  IF COALESCE(v_thermo.completed_sales, 0) < 5
     AND (SELECT count(*) FROM public.listings WHERE seller_id = NEW.seller_id AND status = 'active' AND id <> NEW.id) >= COALESCE(v_limit, 50) THEN
    RAISE EXCEPTION 'Lojas novas podem ter até % anúncios ativos até completar 5 vendas', v_limit;
  END IF;

  RETURN NEW;
END $$;

-- 6. LGPD-safe Opt-in Buyer Profiles, Buyer Reviews & Buyer Rankings
CREATE TABLE IF NOT EXISTS public.buyer_profiles (
  user_id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 40),
  show_in_ranking boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.buyer_profiles TO authenticated;
GRANT ALL ON public.buyer_profiles TO service_role;
ALTER TABLE public.buyer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS buyer_profiles_self_select ON public.buyer_profiles;
CREATE POLICY buyer_profiles_self_select ON public.buyer_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS buyer_profiles_self_insert ON public.buyer_profiles;
CREATE POLICY buyer_profiles_self_insert ON public.buyer_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS buyer_profiles_self_update ON public.buyer_profiles;
CREATE POLICY buyer_profiles_self_update ON public.buyer_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.buyer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR length(trim(comment)) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, seller_id)
);
GRANT SELECT ON public.buyer_reviews TO authenticated;
GRANT ALL ON public.buyer_reviews TO service_role;
ALTER TABLE public.buyer_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS buyer_reviews_read ON public.buyer_reviews;
CREATE POLICY buyer_reviews_read ON public.buyer_reviews
  FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR public.owns_seller(seller_id) OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.submit_buyer_review(
  _order_id uuid,
  _seller_id uuid,
  _rating int,
  _comment text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer uuid;
  v_id uuid;
BEGIN
  IF NOT public.owns_seller(_seller_id) THEN
    RAISE EXCEPTION 'Somente a loja responsável pode avaliar o comprador';
  END IF;
  IF _rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Nota deve ser de 1 a 5';
  END IF;

  SELECT o.buyer_id INTO v_buyer
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
   WHERE o.id = _order_id
     AND oi.seller_id = _seller_id
     AND oi.status = 'delivered'
     AND EXISTS (
       SELECT 1 FROM public.payments p
        WHERE p.order_id = o.id AND p.status = 'succeeded' AND p.environment = 'live'
     )
   LIMIT 1;

  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'Só é possível avaliar compradores de pedidos pagos e entregues';
  END IF;

  INSERT INTO public.buyer_reviews (order_id, seller_id, buyer_id, rating, comment)
  VALUES (_order_id, _seller_id, v_buyer, _rating, NULLIF(trim(coalesce(_comment, '')), ''))
  RETURNING id INTO v_id;

  PERFORM public.notify(v_buyer, 'Você recebeu uma avaliação de loja', format('Nota %s/5 pelo seu pedido.', _rating), '/conta');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.submit_buyer_review(uuid, uuid, int, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_buyer_reputation(_buyer_id uuid)
RETURNS TABLE(
  completed_purchases bigint,
  rating numeric,
  reviews bigint,
  disputes bigint,
  dispute_rate numeric,
  tier text,
  score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchases bigint := 0;
  v_rating numeric := 0;
  v_reviews bigint := 0;
  v_disputes bigint := 0;
  v_disp_rate numeric := 0;
  v_tier text := 'novo';
  v_score numeric := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND _buyer_id <> auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin')
     AND coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     AND NOT EXISTS (SELECT 1 FROM public.buyer_profiles bp WHERE bp.user_id = _buyer_id AND bp.show_in_ranking = true)
     AND NOT EXISTS (
       SELECT 1 FROM public.orders o
       JOIN public.order_items oi ON oi.order_id = o.id
       WHERE o.buyer_id = _buyer_id AND public.owns_seller(oi.seller_id)
     ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT count(DISTINCT oi.order_id) INTO v_purchases
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
   WHERE o.buyer_id = _buyer_id
     AND oi.status = 'delivered'
     AND EXISTS (
       SELECT 1 FROM public.payments p
        WHERE p.order_id = o.id AND p.status = 'succeeded' AND p.environment = 'live'
     );

  SELECT COALESCE(round(avg(br.rating)::numeric, 2), 0), count(*)
    INTO v_rating, v_reviews
    FROM public.buyer_reviews br
   WHERE br.buyer_id = _buyer_id;

  SELECT count(*) INTO v_disputes
    FROM public.disputes d
   WHERE d.buyer_id = _buyer_id
     AND d.status = 'resolved_seller';

  IF v_purchases > 0 THEN
    v_disp_rate := round((v_disputes::numeric / v_purchases::numeric) * 100, 1);
  END IF;

  IF v_purchases >= 30 AND (v_reviews = 0 OR v_rating >= 4.7) AND v_disp_rate <= 2 THEN
    v_tier := 'vip';
  ELSIF v_purchases >= 15 AND (v_reviews = 0 OR v_rating >= 4.5) AND v_disp_rate <= 4 THEN
    v_tier := 'ouro';
  ELSIF v_purchases >= 5 AND (v_reviews = 0 OR v_rating >= 4.2) AND v_disp_rate <= 6 THEN
    v_tier := 'confiavel';
  ELSIF v_purchases >= 1 THEN
    v_tier := 'regular';
  ELSE
    v_tier := 'novo';
  END IF;

  v_score := round((v_purchases * 12) + (v_rating * 60) - (v_disp_rate * 8), 1);

  RETURN QUERY SELECT v_purchases, v_rating, v_reviews, v_disputes, v_disp_rate, v_tier, greatest(v_score, 0)::numeric;
END $$;
REVOKE ALL ON FUNCTION public.get_buyer_reputation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_buyer_reputation(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_ranked_buyers(_limit int DEFAULT 50)
RETURNS TABLE(
  display_name text,
  completed_purchases bigint,
  rating numeric,
  reviews bigint,
  dispute_rate numeric,
  tier text,
  score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    bp.display_name,
    r.completed_purchases,
    r.rating,
    r.reviews,
    r.dispute_rate,
    r.tier,
    r.score
  FROM public.buyer_profiles bp
  CROSS JOIN LATERAL public.get_buyer_reputation(bp.user_id) r
  WHERE bp.show_in_ranking = true
  ORDER BY r.score DESC, r.completed_purchases DESC, bp.updated_at ASC
  LIMIT greatest(1, least(coalesce(_limit, 50), 200));
$$;
REVOKE ALL ON FUNCTION public.list_ranked_buyers(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_ranked_buyers(int) TO anon, authenticated, service_role;

-- =====================================================================
-- 0014_reference_prices_rpc.sql
-- Latest BRL market reference prices per card for bulk repricing & pricing intel
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_card_reference_prices(_card_ids text[])
RETURNS TABLE(card_id text, reference_brl numeric, source text, observed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest_obs AS (
    SELECT DISTINCT ON (po.card_id)
      po.card_id,
      CASE
        WHEN upper(coalesce(po.currency, 'BRL')) = 'BRL' THEN po.amount
        WHEN upper(po.currency) = 'USD' THEN round(po.amount * 5.80, 2)
        WHEN upper(po.currency) = 'EUR' THEN round(po.amount * 6.25, 2)
        ELSE po.amount
      END AS reference_brl,
      po.source,
      po.observed_at
    FROM public.price_observations po
    WHERE po.card_id = ANY(_card_ids)
      AND po.amount > 0
    ORDER BY po.card_id, po.observed_at DESC
  ),
  active_avg AS (
    SELECT
      l.card_id,
      round(avg(l.price), 2) AS reference_brl,
      'marketplace_active'::text AS source,
      max(l.updated_at) AS observed_at
    FROM public.listings l
    WHERE l.card_id = ANY(_card_ids)
      AND l.status = 'active'
      AND l.quantity > 0
      AND l.price > 0
    GROUP BY l.card_id
  )
  SELECT
    c.id AS card_id,
    coalesce(lo.reference_brl, aa.reference_brl) AS reference_brl,
    coalesce(lo.source, aa.source, 'none') AS source,
    coalesce(lo.observed_at, aa.observed_at) AS observed_at
  FROM unnest(_card_ids) AS c(id)
  LEFT JOIN latest_obs lo ON lo.card_id = c.id
  LEFT JOIN active_avg aa ON aa.card_id = c.id
  WHERE coalesce(lo.reference_brl, aa.reference_brl) IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_card_reference_prices(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_card_reference_prices(text[]) TO authenticated, service_role;


