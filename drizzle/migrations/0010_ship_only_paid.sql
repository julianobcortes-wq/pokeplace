CREATE OR REPLACE FUNCTION public.require_paid_before_ship() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='shipped' AND OLD.status='pending' AND (SELECT status FROM public.orders WHERE id=NEW.order_id) <> 'paid' THEN
    RAISE EXCEPTION 'Envie somente depois do pagamento confirmado';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_items_paid_before_ship BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.require_paid_before_ship();