
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

-- Test payment confirmation (sandbox only; real payments confirmed by provider webhook)
CREATE OR REPLACE FUNCTION public.confirm_test_payment(_order_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_order_buyer(_order_id) THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  UPDATE public.orders SET status='paid', expires_at=NULL WHERE id=_order_id AND status='awaiting_payment' AND expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido expirado ou já pago'; END IF;
  UPDATE public.payments SET status='succeeded' WHERE order_id=_order_id AND environment='sandbox';
END $$;
GRANT EXECUTE ON FUNCTION public.confirm_test_payment(uuid) TO authenticated;

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
