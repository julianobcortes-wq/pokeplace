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
