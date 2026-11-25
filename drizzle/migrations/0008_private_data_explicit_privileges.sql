REVOKE ALL ON public.collection_entries,public.support_tickets,public.support_messages FROM anon;
REVOKE ALL ON FUNCTION public.is_real_completed_order(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_real_completed_order(uuid) TO authenticated,service_role;