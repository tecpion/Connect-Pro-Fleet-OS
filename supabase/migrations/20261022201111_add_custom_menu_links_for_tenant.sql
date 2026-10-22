-- Custom Menu Links — tenant-scoped external tool links for the Fleet OS sidebar.
-- Each organization can create its own external software links (GPS Tracker,
-- Insurance Portal, QuickBooks, Stripe, etc.) that appear under "My Tools" in
-- the left navigation. Links are tenant-specific with RLS isolation, visibility
-- controls (all staff / selected roles / selected users), and safe open modes
-- (new tab or embedded iframe with fallback for X-Frame-Options/CSP blocking).

create table if not exists public.custom_menu_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  url text not null,
  icon text,
  description text,
  open_mode text not null default 'new_tab' check (open_mode in ('new_tab', 'embedded')),
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  visibility text not null default 'all_staff' check (visibility in ('all_staff', 'selected_roles', 'selected_users')),
  visible_role_ids text[] not null default '{}',
  visible_user_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists custom_menu_links_org on public.custom_menu_links (organization_id, is_enabled, sort_order);

-- ── RLS + grants ────────────────────────────────────────────────────────
alter table public.custom_menu_links enable row level security;

drop policy if exists "custom_menu_links org read" on public.custom_menu_links;
create policy "custom_menu_links org read" on public.custom_menu_links
  for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists "custom_menu_links org write" on public.custom_menu_links;
create policy "custom_menu_links org write" on public.custom_menu_links
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

grant select, insert, update, delete on public.custom_menu_links to authenticated;
grant all on public.custom_menu_links to service_role;