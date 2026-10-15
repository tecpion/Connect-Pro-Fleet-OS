-- Connect Pro Fleet — Build #22 development seed (supabase/seed.sql).
-- Seeds a demo organization, owner profile/membership, and system roles.
-- Do NOT seed production credentials. Mock JS seed remains for unit tests.

-- Demo organization.
insert into public.organizations (id, name, slug, timezone, currency, status)
values ('11111111-1111-1111-1111-111111111111', 'Connect Pro Fleet Demo', 'cpf-demo', 'America/Detroit', 'USD', 'active')
on conflict (id) do nothing;

-- System roles (organization_id null = system/default).
insert into public.roles (id, organization_id, name, code, is_system) values
  ('22222222-2222-2222-2222-222222222222', null, 'Owner', 'owner', true),
  ('33333333-3333-3333-3333-333333333333', null, 'Manager', 'manager', true),
  ('44444444-4444-4444-4444-444444444444', null, 'User', 'user', true)
on conflict (id) do nothing;

-- NOTE: auth.users entries are created by Supabase Auth (sign-up/sign-in),
-- not seeded here. The profile + membership rows are created by the app's
-- sign-up flow after auth. This seed only guarantees the org + roles exist.
