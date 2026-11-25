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
