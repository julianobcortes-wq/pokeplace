
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
