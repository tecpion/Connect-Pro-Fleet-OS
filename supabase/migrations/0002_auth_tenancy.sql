-- Connect Pro Fleet — Build #22 migration 0002: organizations, profiles,
-- roles, permissions, memberships, invitations.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  timezone text not null default 'America/Detroit',
  currency text not null default 'USD',
  status text not null default 'active' check (status in ('active','suspended','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  display_name text not null default '',
  email text not null default '',
  phone text,
  avatar_path text,
  status text not null default 'active' check (status in ('active','suspended','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text not null,
  module text not null
);

create table if not exists public.role_permissions (
  role_id uuid references public.roles(id) on delete cascade,
  permission_code text references public.permissions(code) on delete cascade,
  primary key (role_id, permission_code)
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid references public.roles(id) on delete set null,
  status text not null default 'active' check (status in ('active','invited','suspended')),
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role_id uuid references public.roles(id) on delete set null,
  token_hash text not null,
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create trigger trg_organizations_updated_at before update on public.organizations
  for each row execute function public.touch_updated_at();
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger trg_memberships_updated_at before update on public.organization_memberships
  for each row execute function public.touch_updated_at();

-- A user can read organizations they belong to.
alter table public.organizations enable row level security;
create policy org_read on public.organizations for select
  using (public.is_org_member(id));

-- A user can read/update their own profile.
alter table public.profiles enable row level security;
create policy profile_self_read on public.profiles for select using (id = auth.uid());
create policy profile_self_update on public.profiles for update using (id = auth.uid());

-- Roles readable by members of the org; owners manage roles.
alter table public.roles enable row level security;
create policy role_read on public.roles for select
  using (organization_id is null or public.is_org_member(organization_id));

alter table public.permissions enable row level security;
create policy permissions_read on public.permissions for select using (true);

alter table public.role_permissions enable row level security;
create policy role_perm_read on public.role_permissions for select
  using (exists (
    select 1 from public.roles r
    where r.id = role_id and (r.organization_id is null or public.is_org_member(r.organization_id))
  ));

-- Memberships: members of an org can see who's in it; only owners manage.
alter table public.organization_memberships enable row level security;
create policy membership_read on public.organization_memberships for select
  using (public.is_org_member(organization_id) or user_id = auth.uid());
create policy membership_manage on public.organization_memberships for all
  using (public.has_permission(organization_id, 'users.manage'));

alter table public.organization_invitations enable row level security;
create policy invitation_read on public.organization_invitations for select
  using (public.is_org_member(organization_id));
