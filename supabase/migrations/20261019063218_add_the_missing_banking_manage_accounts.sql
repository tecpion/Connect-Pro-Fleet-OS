-- Phase 5 live E2E fix: the financial_accounts write policy
-- (finacct_write) gates every insert/update/delete with
-- public.has_permission(organization_id, 'banking.manage_accounts').
-- That permission code was never seeded into the permissions catalog, so
-- the policy denied every writer -- including the provisioned Org A owner --
-- and the Phase 5 E2E could not create the financial_accounts fixture row
-- it needs for banking evidence + reconciliation invariants.
--
-- This migration corrects that catalog gap only. It does NOT change
-- has_permission(), does NOT weaken or bypass the finacct_write RLS policy,
-- and does NOT grant the permission to every authenticated user. Owner
-- roles already receive every row in public.permissions from
-- provision_account(), so:
--   - newly provisioned owners automatically receive banking.manage_accounts
--     once the catalog row exists (no provision_account change required);
--   - existing owner roles created before this migration are missing the
--     role_permissions row, so we backfill it for system 'owner' roles only.
--
-- Conventions match the existing catalog seed in
-- 20261015163014_phase_1_fix_rls_policy_roles_seed.sql:
--   (code, label, module) with module = 'Banking'.

insert into public.permissions (code, label, module)
values ('banking.manage_accounts', 'Manage Bank Accounts', 'Banking')
on conflict (code) do nothing;

-- Backfill the permission onto every existing system 'owner' role (the role
-- provision_account creates with code = 'owner', is_system = true). We do
-- NOT touch non-owner roles, so a non-owner user gains nothing here unless
-- their existing role was already supposed to carry this permission.
insert into public.role_permissions (role_id, permission_code)
select r.id, 'banking.manage_accounts'
from public.roles r
where r.code = 'owner'
  and r.is_system = true
on conflict (role_id, permission_code) do nothing;