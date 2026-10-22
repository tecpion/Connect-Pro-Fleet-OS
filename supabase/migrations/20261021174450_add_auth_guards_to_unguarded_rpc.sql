-- Harden the three SECURITY DEFINER functions that lacked a caller-identity /
-- org-membership check. The remaining flagged functions (is_org_member,
-- has_permission, post_payment) are RLS helpers / already guarded and are
-- intentionally left as SECURITY DEFINER — changing them would break tenant
-- isolation. This migration only adds guards; it does not change behavior
-- for authorized callers.

-- 1) next_document_number: any authenticated user could previously advance ANY
--    org's document sequence. Require active membership in the target org.
create or replace function public.next_document_number(
  org_id uuid, sequence_type text, prefix text, year_value int
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_val int;
  padded text;
begin
  if not public.is_org_member(org_id) then
    raise exception 'Not authorized for this organization.';
  end if;

  insert into public.document_sequences (organization_id, sequence_type, year, current_value)
  values (org_id, sequence_type, year_value, 1)
  on conflict (organization_id, sequence_type, year)
  do update set current_value = public.document_sequences.current_value + 1
  returning public.document_sequences.current_value into next_val;
  padded := lpad(next_val::text, 6, '0');
  return prefix || '-' || year_value::text || '-' || padded;
end;
$$;

-- 2) next_portal_request_number: any authenticated user could previously read
--    any org's portal-request count. Require active membership in the org.
create or replace function public.next_portal_request_number(p_org_id uuid)
returns text
language sql security definer
set search_path = public
as $$
  select case when public.is_org_member(p_org_id)
    then 'PR-' || lpad(((count(*)) + 501)::text, 4, '0')
    else null
  end
  from public.portal_requests
  where organization_id = p_org_id;
$$;

-- 3) provision_account: any authenticated user could previously provision an
--    account/org for an ARBITRARY p_user_id. Require the caller to be the
--    user being provisioned. (Service-role / admin callers that legitimately
--    need to provision on behalf of another user must use the admin client path,
--    not this RPC.)
create or replace function public.provision_account(
  p_user_id uuid,
  p_email text,
  p_org_name text DEFAULT NULL,
  p_first_name text DEFAULT '',
  p_last_name text DEFAULT ''
)
RETURNS TABLE(organization_id uuid, role_id uuid, created_org boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_role_id uuid;
  v_created_org boolean := false;
  v_existing_membership uuid;
  v_org_name text;
begin
  -- Caller must be provisioning their own account. This prevents an
  -- authenticated user from creating an org/membership for someone else.
  if p_user_id is distinct from auth.uid() then
    raise exception 'Not authorized to provision an account for another user.';
  end if;

  -- Does this user already have an active membership? If so, do NOT create a
  -- second org — return their existing org. This prevents duplicate companies
  -- on retry / re-login.
  select m.organization_id
    into v_existing_membership
  from public.organization_memberships m
  where m.user_id = p_user_id and m.status = 'active'
  limit 1;

  if v_existing_membership is not null then
    v_org_id := v_existing_membership;
    -- Ensure the owner role exists for this org (idempotent). Reference the
    -- unique constraint BY NAME so the RETURNS TABLE output param
    -- "organization_id" does not shadow the table column in the conflict target.
    select r.id into v_role_id
    from public.roles r
    where r.organization_id = v_org_id and r.code = 'owner';
    if v_role_id is null then
      insert into public.roles (organization_id, name, code, is_system)
      values (v_org_id, 'Owner', 'owner', true)
      on conflict on constraint roles_organization_id_code_key do nothing
      returning id into v_role_id;
    end if;
    -- Ensure profile exists.
    insert into public.profiles (id, email, first_name, last_name, display_name)
    values (p_user_id, p_email, p_first_name, p_last_name,
            trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')))
    on conflict on constraint profiles_pkey do update set email = excluded.email;
    -- Ensure membership has the owner role. Qualify columns because the
    -- RETURNS TABLE output params (organization_id, role_id) shadow unqualified
    -- names in PL/pgSQL scope.
    update public.organization_memberships
      set role_id = v_role_id, status = 'active', joined_at = coalesce(organization_memberships.joined_at, now())
    where organization_memberships.organization_id = v_org_id
      and organization_memberships.user_id = p_user_id;
    return query select v_org_id, v_role_id, false;
    return;
  end if;

  -- New account: create the organization.
  v_org_name := coalesce(nullif(trim(p_org_name), ''), 'My Fleet');
  insert into public.organizations (name, slug)
  values (v_org_name, lower(regexp_replace(v_org_name, '[^a-z0-9]+', '-', 'g')) || '-' || substr(replace(p_user_id::text, '-', ''), 1, 8))
  returning id into v_org_id;
  v_created_org := true;

  -- Owner role with ALL permissions.
  insert into public.roles (organization_id, name, code, is_system)
  values (v_org_id, 'Owner', 'owner', true)
  returning id into v_role_id;

  insert into public.role_permissions (role_id, permission_code)
  select v_role_id, code from public.permissions
  on conflict do nothing;

  -- Profile.
  insert into public.profiles (id, email, first_name, last_name, display_name)
  values (p_user_id, p_email, p_first_name, p_last_name,
          trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')))
  on conflict on constraint profiles_pkey do update set email = excluded.email;

  -- Active membership with owner role. Reference the unique constraint BY NAME
  -- to avoid the RETURNS TABLE output-param shadowing of organization_id.
  insert into public.organization_memberships (organization_id, user_id, role_id, status, joined_at)
  values (v_org_id, p_user_id, v_role_id, 'active', now())
  on conflict on constraint organization_memberships_organization_id_user_id_key do update
    set role_id = excluded.role_id, status = 'active',
        joined_at = coalesce(organization_memberships.joined_at, now());

  return query select v_org_id, v_role_id, v_created_org;
  return;
end;
$function$;

-- Re-grant execute to authenticated (CREATE OR REPLACE preserves grants, but
-- be explicit/idempotent for the two SQL functions whose signature is unchanged).
grant execute on function public.next_document_number(uuid, text, text, int) to authenticated;
grant execute on function public.next_portal_request_number(uuid) to authenticated;
grant execute on function public.provision_account(uuid, text, text, text, text) to authenticated;