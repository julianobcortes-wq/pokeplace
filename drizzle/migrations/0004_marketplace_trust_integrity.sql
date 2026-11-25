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