-- Connect Pro Fleet — Build #22 migration 0001: extensions + helpers.
-- Required extensions and central RLS helper functions used by all policies.

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "uuid-ossp";     -- uuid_generate_v4() fallback

-- ---------------------------------------------------------------------------
-- Central RLS helpers (SECURITY DEFINER, stable search_path).
-- is_org_member(org_id): true when the authenticated user is an ACTIVE member
-- of the given organization. This is the foundation of tenant isolation —
-- every tenant-scoped policy delegates to it.
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- has_permission(org_id, permission_code): true when the authenticated user is
-- an active member whose role grants the permission code (via role_permissions),
-- OR the user is an owner of the organization. Used for permission-aware RLS on
-- sensitive financial tables.
create or replace function public.has_permission(
  org_id uuid,
  permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and rp.permission_code = permission_code
  )
  or exists (
    select 1
    from public.organization_memberships m
    join public.roles r on r.id = m.role_id
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and r.code = 'owner'
  );
$$;

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
