-- Harden payment integrity: buyers cannot mark orders paid without Mercado Pago.
CREATE OR REPLACE FUNCTION public.confirm_test_payment(_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RAISE EXCEPTION 'Pagamento de teste desativado. Use Mercado Pago.';
END $$;
REVOKE ALL ON FUNCTION public.confirm_test_payment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_test_payment(uuid) TO service_role;
