-- Connect Pro Fleet — Build #22 migration 0001: extensions + helpers.
-- Required extensions and central RLS helper functions used by all policies.

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "uuid-ossp";     -- uuid_generate_v4() fallback

-- updated_at trigger helper.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
