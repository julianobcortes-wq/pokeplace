-- Run in Supabase SQL editor AFTER going live.
-- 1) Sign up once in the app, copy auth.users id.
-- 2) Replace the UUID below, then execute.

-- insert into public.user_roles (user_id, role)
-- values ('00000000-0000-0000-0000-000000000000', 'admin')
-- on conflict do nothing;

-- Default marketplace economics (adjust later in Admin).
insert into public.platform_settings (key, value, updated_at)
values
  ('commission_rate', '0.08'::jsonb, now()),
  ('payout_hold_days', '7'::jsonb, now()),
  ('brand', '{"name":"PokePlace"}'::jsonb, now())
on conflict (key) do update set value = excluded.value, updated_at = now();
