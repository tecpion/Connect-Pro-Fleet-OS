-- Customer Portal Lite: permanent customer auth identities + request persistence.
-- A renter with portal access is a REAL auth.users identity, linked to exactly
-- one Fleet customer + organization through customer_auth_links. Authorization
-- is server-side and RLS-backed; the browser never supplies customer_id.

create table if not exists public.customer_auth_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null,
  customer_id uuid not null,
  email text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (customer_id)
);
create index if not exists customer_auth_links_org_idx on public.customer_auth_links(organization_id);
create index if not exists customer_auth_links_user_idx on public.customer_auth_links(user_id);

create table if not exists public.portal_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  rental_id uuid,
  request_number text not null,
  request_type text not null,
  status text not null default 'submitted',
  subject text not null,
  customer_note text,
  staff_response text,
  current_scheduled_end text,
  requested_new_end text,
  estimated_extension_charge numeric(12,2),
  exchange_reason text,
  exchange_issue_description text,
  exchange_preferred_timing text,
  requested_return_date text,
  requested_return_location text,
  assigned_staff_id uuid,
  linked_task_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists portal_requests_org_idx on public.portal_requests(organization_id);
create index if not exists portal_requests_customer_idx on public.portal_requests(customer_id);
create unique index if not exists portal_requests_number_idx on public.portal_requests(organization_id, request_number);

-- Idempotent resolver: given the authenticated user id, return the single
-- linked (organization_id, customer_id, email). RLS enforces membership.
create or replace function public.resolve_customer_portal_auth(p_user_id uuid)
returns table (organization_id uuid, customer_id uuid, email text)
language sql stable
set search_path = public
as $$
  select organization_id, customer_id, email
  from public.customer_auth_links
  where user_id = p_user_id and status = 'active';
$$;

-- Next portal request number, scoped per org (count-based, no uuid/int mix).
create or replace function public.next_portal_request_number(p_org_id uuid)
returns text
language sql security definer
set search_path = public
as $$
  select 'PR-' || lpad(((count(*)) + 501)::text, 4, '0')
  from public.portal_requests
  where organization_id = p_org_id;
$$;

alter table public.customer_auth_links enable row level security;
alter table public.portal_requests enable row level security;

drop policy if exists "customer_auth_links_self_read" on public.customer_auth_links;
create policy "customer_auth_links_self_read" on public.customer_auth_links
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "customer_auth_links_org_manage" on public.customer_auth_links;
create policy "customer_auth_links_org_manage" on public.customer_auth_links
  for all to authenticated using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "portal_requests_customer_self" on public.portal_requests;
create policy "portal_requests_customer_self" on public.portal_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.customer_auth_links l
      where l.user_id = auth.uid()
        and l.status = 'active'
        and l.organization_id = portal_requests.organization_id
        and l.customer_id = portal_requests.customer_id
    )
  );

drop policy if exists "portal_requests_customer_insert" on public.portal_requests;
create policy "portal_requests_customer_insert" on public.portal_requests
  for insert to authenticated with check (
    exists (
      select 1 from public.customer_auth_links l
      where l.user_id = auth.uid()
        and l.status = 'active'
        and l.organization_id = portal_requests.organization_id
        and l.customer_id = portal_requests.customer_id
    )
  );

drop policy if exists "portal_requests_org_manage" on public.portal_requests;
create policy "portal_requests_org_manage" on public.portal_requests
  for all to authenticated using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

grant select on public.customer_auth_links to authenticated;
grant all on public.customer_auth_links to service_role;
grant execute on function public.resolve_customer_portal_auth to authenticated;
grant execute on function public.next_portal_request_number to authenticated;
grant select, insert, update on public.portal_requests to authenticated;
grant all on public.portal_requests to service_role;