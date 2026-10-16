CREATE OR REPLACE FUNCTION public.provision_account(
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
  select m.organization_id
    into v_existing_membership
  from public.organization_memberships m
  where m.user_id = p_user_id and m.status = 'active'
  limit 1;

  if v_existing_membership is not null then
    v_org_id := v_existing_membership;
    select r.id into v_role_id
    from public.roles r
    where r.organization_id = v_org_id and r.code = 'owner';
    if v_role_id is null then
      insert into public.roles (organization_id, name, code, is_system)
      values (v_org_id, 'Owner', 'owner', true)
      on conflict (organization_id, code) do nothing
      returning id into v_role_id;
    end if;
    insert into public.profiles (id, email, first_name, last_name, display_name)
    values (p_user_id, p_email, p_first_name, p_last_name,
            trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')))
    on conflict (id) do update set email = excluded.email;
    update public.organization_memberships
      set role_id = v_role_id, status = 'active', joined_at = coalesce(organization_memberships.joined_at, now())
    where organization_memberships.organization_id = v_org_id
      and organization_memberships.user_id = p_user_id;
    return query select v_org_id, v_role_id, false;
    return;
  end if;

  v_org_name := coalesce(nullif(trim(p_org_name), ''), 'My Fleet');
  insert into public.organizations (name, slug)
  values (v_org_name, lower(regexp_replace(v_org_name, '[^a-z0-9]+', '-', 'g')) || '-' || substr(replace(p_user_id::text, '-', ''), 1, 8))
  returning id into v_org_id;
  v_created_org := true;

  insert into public.roles (organization_id, name, code, is_system)
  values (v_org_id, 'Owner', 'owner', true)
  returning id into v_role_id;

  insert into public.role_permissions (role_id, permission_code)
  select v_role_id, code from public.permissions
  on conflict do nothing;

  insert into public.profiles (id, email, first_name, last_name, display_name)
  values (p_user_id, p_email, p_first_name, p_last_name,
          trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')))
  on conflict (id) do update set email = excluded.email;

  -- Qualify every column reference: the RETURNS TABLE output params
  -- (organization_id, role_id) shadow unqualified names in PL/pgSQL scope.
  insert into public.organization_memberships (organization_id, user_id, role_id, status, joined_at)
  values (v_org_id, p_user_id, v_role_id, 'active', now())
  on conflict (organization_id, user_id) do update
    set role_id = excluded.role_id, status = 'active',
        joined_at = coalesce(organization_memberships.joined_at, now());

  return query select v_org_id, v_role_id, v_created_org;
  return;
end;
$function$;