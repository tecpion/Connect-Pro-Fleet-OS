-- ===========================================================================
-- Security hardening: enable RLS on the seven tenancy/auth tables, add
-- membership-scoped policies + grants, and lock down SECURITY DEFINER
-- functions so anon can no longer execute them. No Fleet OS V1 workflow
-- logic is changed; this only closes the public-access gaps the Cloud
-- security advisor flagged.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Enable RLS on the seven tenancy tables (they were public + unlocked).
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.permissions enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_invitations enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Grants. Authenticated users get the access the policies below allow;
--    service_role keeps full access for admin/maintenance paths. No anon
--    grants anywhere (this app has no anonymous access).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;
grant select, insert, update, delete on public.permissions to authenticated;
grant select, insert, update, delete on public.organization_memberships to authenticated;
grant select, insert, update, delete on public.organization_invitations to authenticated;

grant all on public.organizations to service_role;
grant all on public.profiles to service_role;
grant all on public.roles to service_role;
grant all on public.role_permissions to service_role;
grant all on public.permissions to service_role;
grant all on public.organization_memberships to service_role;
grant all on public.organization_invitations to service_role;

-- ---------------------------------------------------------------------------
-- 3. Policies.
--
-- organizations: a user may read/write an org they are an active member of.
-- ---------------------------------------------------------------------------
create policy "orgs_rw" on public.organizations
  for all to authenticated
  using (public.is_org_member(id))
  with check (public.is_org_member(id));

-- profiles: a user reads/updates their own profile. Creation is done by the
-- app on first session (never an auth.users trigger), so insert is allowed
-- only for the profile owner.
create policy "profiles_self_rw" on public.profiles
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- roles: a user may read/write roles for an org they belong to.
create policy "roles_rw" on public.roles
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- permissions: the permission catalog is reference data shared across orgs;
-- any authenticated user may read it. Writes are admin-only (service_role).
create policy "permissions_read" on public.permissions
  for select to authenticated using (true);

-- role_permissions: readable/writable only by members of the org that owns
-- the role. The join through roles -> organization_id enforces tenancy.
create policy "role_permissions_rw" on public.role_permissions
  for all to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and public.is_org_member(r.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and public.is_org_member(r.organization_id)
    )
  );

-- organization_memberships: a user may read the memberships of any org they
-- belong to, and may insert/update a membership row for an org they belong
-- to (invitations/role changes are gated by app-level permission checks on
-- top of this). A user can always read their own membership rows.
create policy "memberships_rw" on public.organization_memberships
  for all to authenticated
  using (
    public.is_org_member(organization_id) or user_id = auth.uid()
  )
  with check (
    public.is_org_member(organization_id) or user_id = auth.uid()
  );

-- organization_invitations: a user may read/manage invitations for an org
-- they belong to.
create policy "invitations_rw" on public.organization_invitations
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 4. Lock down SECURITY DEFINER functions: revoke EXECUTE from anon (and
--    PUBLIC, which covers anon) on every SECURITY DEFINER function. They
--    remain executable by authenticated, which is the only role that needs
--    them (RLS policies + authenticated RPC calls). service_role keeps EXECUTE.
--
--    is_org_member / has_permission / poc_is_member are used by RLS policies
--    (must stay executable by authenticated). next_document_number and
--    post_payment are app RPCs (must stay executable by authenticated).
-- ---------------------------------------------------------------------------
revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.has_permission(uuid, text) from public, anon;
revoke execute on function public.poc_is_member(uuid) from public, anon;
revoke execute on function public.next_document_number(uuid, text, text, int) from public, anon;
revoke execute on function public.post_payment(uuid, uuid, numeric, text, text, text, text, text, text, text, text, uuid) from public, anon;

-- Explicitly grant execute to authenticated so RLS policies and app RPCs keep
-- working after the PUBLIC revoke (defensive: authenticated already inherited
-- from public, but make it explicit and non-inheritance-dependent).
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.poc_is_member(uuid) to authenticated;
grant execute on function public.next_document_number(uuid, text, text, int) to authenticated;
grant execute on function public.post_payment(uuid, uuid, numeric, text, text, text, text, text, text, text, text, uuid) to authenticated;