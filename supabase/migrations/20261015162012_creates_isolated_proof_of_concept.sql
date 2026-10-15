-- ===========================================================================
-- Cloud audit PROOF-OF-CONCEPT — isolated poc_* tables (NOT Fleet OS V1 data).
-- Org-scoped RLS: a user may only read/write rows for an org they're an
-- ACTIVE member of. Mirrors the real is_org_member pattern but on its own
-- membership table so it never touches V1 workflows.
-- ===========================================================================

create table if not exists public.poc_orgs (
  id uuid primary key,
  name text not null,
  slug text
);

create table if not exists public.poc_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.poc_orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  unique (org_id, user_id)
);

create table if not exists public.poc_customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.poc_orgs(id) on delete cascade,
  name text not null,
  email text
);

create table if not exists public.poc_vehicles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.poc_orgs(id) on delete cascade,
  make text not null,
  model text not null,
  license_plate text not null
);

create table if not exists public.poc_reservations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.poc_orgs(id) on delete cascade,
  customer_id uuid references public.poc_customers(id) on delete set null,
  vehicle_id uuid references public.poc_vehicles(id) on delete set null,
  start_date text not null,
  end_date text not null,
  status text not null default 'confirmed'
);

-- helper: is the caller an active member of this poc org?
create or replace function public.poc_is_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.poc_memberships m
    where m.org_id = poc_is_member.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- grants
grant select, insert, update, delete on public.poc_orgs to authenticated;
grant select, insert, update, delete on public.poc_memberships to authenticated;
grant select, insert, update, delete on public.poc_customers to authenticated;
grant select, insert, update, delete on public.poc_vehicles to authenticated;
grant select, insert, update, delete on public.poc_reservations to authenticated;
grant all on public.poc_orgs to service_role;
grant all on public.poc_memberships to service_role;
grant all on public.poc_customers to service_role;
grant all on public.poc_vehicles to service_role;
grant all on public.poc_reservations to service_role;

-- RLS
alter table public.poc_orgs enable row level security;
alter table public.poc_memberships enable row level security;
alter table public.poc_customers enable row level security;
alter table public.poc_vehicles enable row level security;
alter table public.poc_reservations enable row level security;

create policy "poc_orgs_rw" on public.poc_orgs
  for all to authenticated
  using (public.poc_is_member(id))
  with check (public.poc_is_member(id));

create policy "poc_memberships_rw" on public.poc_memberships
  for all to authenticated
  using (public.poc_is_member(org_id))
  with check (public.poc_is_member(org_id));

create policy "poc_customers_rw" on public.poc_customers
  for all to authenticated
  using (public.poc_is_member(org_id))
  with check (public.poc_is_member(org_id));

create policy "poc_vehicles_rw" on public.poc_vehicles
  for all to authenticated
  using (public.poc_is_member(org_id))
  with check (public.poc_is_member(org_id));

create policy "poc_reservations_rw" on public.poc_reservations
  for all to authenticated
  using (public.poc_is_member(org_id))
  with check (public.poc_is_member(org_id));

-- ===========================================================================
-- Private storage bucket policy for poc-private (the one permitted write to
-- the storage schema). Object path is "<org_id>/<file>" — access granted
-- only when the caller is an active member of the org in the path prefix.
-- ===========================================================================
create policy "poc_private_rw" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'poc-private'
    and public.poc_is_member((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'poc-private'
    and public.poc_is_member((storage.foldername(name))[1]::uuid)
  );