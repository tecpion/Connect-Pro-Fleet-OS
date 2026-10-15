-- ===========================================================================
-- Phase 1 foundation: (1) tighten the customers/vehicles/reservations RLS
-- policies from TO public to TO authenticated, (2) seed the full permission
-- catalog so has_permission() works, (3) add an idempotent SECURITY DEFINER
-- provision_account() function for server-side account initialization
-- (org + owner role with all permissions + profile + membership).
-- No Fleet OS V1 workflow logic is changed.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Replace the customers/vehicles/reservations ALL policies that were
--    scoped TO public (which includes anon) with TO authenticated versions.
--    The USING/WITH CHECK expressions stay is_org_member(organization_id),
--    which already denies anon (auth.uid() is null), but the explicit role
--    removes the anon surface and matches the hardening standard.
-- ---------------------------------------------------------------------------
drop policy if exists "customer_rw" on public.customers;
drop policy if exists "vehicle_rw" on public.vehicles;
drop policy if exists "res_rw" on public.reservations;

create policy "customer_rw" on public.customers
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "vehicle_rw" on public.vehicles
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "res_rw" on public.reservations
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 2. Seed the permission catalog (239 permissions) from the app's
--    PERMISSION_CATALOG. Idempotent: on conflict do nothing.
-- ---------------------------------------------------------------------------
insert into public.permissions (code, label, module) values
  ('dashboard.view','View Dashboard','Dashboard'),
  ('dashboard.view_financials','View Financial KPIs','Dashboard'),
  ('planner.view','View Planner','Planner'),
  ('planner.create_reservation','Create Reservation from Planner','Planner'),
  ('planner.modify_availability','Modify Availability','Planner'),
  ('vehicles.view','View Vehicles','Vehicles'),
  ('vehicles.add','Add Vehicles','Vehicles'),
  ('vehicles.edit','Edit Vehicles','Vehicles'),
  ('vehicles.delete','Delete / Archive Vehicles','Vehicles'),
  ('vehicles.view_financials','View Vehicle Financials','Vehicles'),
  ('vehicles.view_documents','View Vehicle Documents','Vehicles'),
  ('vehicles.manage_classes','Manage Vehicle Classes','Vehicles'),
  ('vehicles.override_pricing','Override Vehicle Pricing','Vehicles'),
  ('vehicles.view_ownership','View Vehicle Ownership','Vehicles'),
  ('reservations.view','View Reservations','Reservations'),
  ('reservations.create','Create Reservations','Reservations'),
  ('reservations.edit','Edit Reservations','Reservations'),
  ('reservations.cancel','Cancel Reservations','Reservations'),
  ('reservations.record_payment','Record Reservation Payments','Reservations'),
  ('reservations.override_price','Override Rental Price','Reservations'),
  ('reservations.override_minimum','Override Minimum Rental Duration','Reservations'),
  ('rentals.view','View Rentals','Rentals'),
  ('rentals.start','Start Rental','Rentals'),
  ('rentals.extend','Extend Rental','Rentals'),
  ('rentals.exchange','Exchange Vehicle','Rentals'),
  ('rentals.return','Return Vehicle','Rentals'),
  ('rentals.add_charges','Add Charges','Rentals'),
  ('rentals.override_deposit_requirement','Override Deposit Requirement','Rentals'),
  ('rentals.override_release_gate','Override Release Gate (Checkout)','Rentals'),
  ('deposits.view','View Deposits','Deposits'),
  ('deposits.collect','Collect Deposits','Deposits'),
  ('deposits.apply','Apply Deposits','Deposits'),
  ('deposits.refund','Refund Deposits','Deposits'),
  ('deposits.forfeit','Forfeit Deposits','Deposits'),
  ('deposits.override_requirement','Override Deposit Requirement','Deposits'),
  ('payments.view','View Payments','Payments'),
  ('payments.record','Record Payments','Payments'),
  ('payments.apply_late_fees','Apply Late Fees','Payments'),
  ('payments.waive_fees','Waive Fees','Payments'),
  ('payments.issue_credits','Issue Credits','Payments'),
  ('payments.issue_refunds','Issue Refunds','Payments'),
  ('payments.view_revenue','View Revenue','Payments'),
  ('payment_arrangements.view','View Payment Arrangements','Payment Arrangements'),
  ('payment_arrangements.create','Create Arrangements','Payment Arrangements'),
  ('payment_arrangements.modify','Modify Arrangements','Payment Arrangements'),
  ('payment_arrangements.cancel','Cancel Arrangements','Payment Arrangements'),
  ('payment_arrangements.override','Override Arrangement Rules','Payment Arrangements'),
  ('customers.view','View Customers','Customers'),
  ('customers.add','Add Customers','Customers'),
  ('customers.edit','Edit Customers','Customers'),
  ('customers.view_license','View Driver License','Customers'),
  ('customers.view_insurance','View Insurance','Customers'),
  ('customers.manage_status','Add Do Not Rent / Watchlist','Customers'),
  ('inspections.view','View Inspections','Inspections'),
  ('inspections.create','Create Inspections','Inspections'),
  ('inspections.confirm_damage','Confirm Damage','Inspections'),
  ('maintenance.view','View Maintenance','Maintenance'),
  ('maintenance.add','Add Maintenance','Maintenance'),
  ('maintenance.edit','Edit Maintenance','Maintenance'),
  ('maintenance.complete','Complete Maintenance','Maintenance'),
  ('maintenance.assign','Assign Maintenance','Maintenance'),
  ('maintenance.change_status','Change Status','Maintenance'),
  ('maintenance.cancel','Cancel Maintenance','Maintenance'),
  ('maintenance.reopen','Reopen Maintenance','Maintenance'),
  ('maintenance.manage_vendors','Manage Vendors','Maintenance'),
  ('maintenance.view_costs','View Maintenance Costs','Maintenance'),
  ('maintenance.edit_costs','Edit Maintenance Costs','Maintenance'),
  ('maintenance.upload_receipts','Upload Receipts','Maintenance'),
  ('maintenance.manage_downtime','Manage Downtime','Maintenance'),
  ('investors.view','View Investors','Investors / Partners'),
  ('investors.view_financials','View Investor Financials','Investors / Partners'),
  ('investors.view_statements','View Statements','Investors / Partners'),
  ('investors.manage_agreements','Manage Investor Agreements','Investors / Partners'),
  ('investors.generate_settlements','Generate Settlements','Investors / Partners'),
  ('investors.finalize_settlements','Finalize Settlements','Investors / Partners'),
  ('investors.create_partnership','Create Investor / JV Partnerships','Investors / Partners'),
  ('settings.view','View Settings','Settings'),
  ('settings.manage_company','Manage Company','Settings'),
  ('settings.manage_users','Manage Users','Settings'),
  ('settings.manage_roles','Manage Roles','Settings'),
  ('settings.manage_locations','Manage Locations','Settings'),
  ('settings.manage_pricing','Manage Pricing','Settings'),
  ('settings.manage_addons','Manage Add-Ons','Settings'),
  ('settings.manage_deposits','Manage Deposits','Settings'),
  ('settings.manage_agreements','Manage Agreements','Settings'),
  ('settings.manage_integrations','Manage Integrations','Settings'),
  ('company_settings.view','View Company Settings','Company Policies'),
  ('company_settings.manage','Manage Company Settings','Company Policies'),
  ('rental_policies.view','View Rental Policies','Company Policies'),
  ('rental_policies.manage','Manage Rental Policies','Company Policies'),
  ('billing_policies.manage','Manage Billing & Payment Policies','Company Policies'),
  ('fee_settings.manage','Manage Fee Settings','Company Policies'),
  ('taxes.view','View Tax Rules','Taxes & Fees'),
  ('taxes.manage','Manage Tax Rules','Taxes & Fees'),
  ('taxes.override','Override / Exempt Tax','Taxes & Fees'),
  ('fees.view','View Fee Rules','Taxes & Fees'),
  ('fees.manage','Manage Fee Rules','Taxes & Fees'),
  ('fees.assess','Assess Fees','Taxes & Fees'),
  ('fees.override','Override Fee Amounts','Taxes & Fees'),
  ('tasks.view_own','View Own Tasks','Tasks'),
  ('tasks.view_all','View All Tasks','Tasks'),
  ('tasks.create','Create Tasks','Tasks'),
  ('tasks.assign','Assign / Reassign Tasks','Tasks'),
  ('tasks.edit','Edit Tasks','Tasks'),
  ('tasks.complete','Complete Tasks','Tasks'),
  ('tasks.cancel','Cancel Tasks','Tasks'),
  ('tasks.reopen','Reopen Tasks','Tasks'),
  ('tasks.manage_system_tasks','Manage System Tasks','Tasks'),
  ('notifications.view_own','View Own Notifications','Notifications'),
  ('notifications.manage_preferences','Manage Notification Preferences','Notifications'),
  ('expenses.view','View Expenses','Expenses'),
  ('expenses.create','Record Expenses','Expenses'),
  ('expenses.edit_metadata','Edit Expense Metadata','Expenses'),
  ('expenses.reverse','Reverse Expenses','Expenses'),
  ('expenses.view_company_overhead','View Company Overhead','Expenses'),
  ('expenses.view_vehicle_expenses','View Vehicle Expenses','Expenses'),
  ('expenses.view_payment_details','View Payment Details','Expenses'),
  ('expenses.manage_categories','Manage Expense Categories','Expenses'),
  ('expenses.manage_receipts','Manage Receipts','Expenses'),
  ('expenses.view_reimbursements','View Reimbursements','Expenses'),
  ('expenses.manage_reimbursements','Manage Reimbursements','Expenses'),
  ('expenses.view_petty_cash','View Petty Cash','Expenses'),
  ('expenses.manage_petty_cash','Manage Petty Cash','Expenses'),
  ('expenses.view_costs','View Cost Data','Expenses'),
  ('banking.view','View Banking','Banking'),
  ('banking.import','Import Transactions','Banking'),
  ('banking.review','Review Transactions','Banking'),
  ('banking.match','Match Transactions','Banking'),
  ('banking.unmatch','Unmatch Transactions','Banking'),
  ('banking.create_expense','Create Expense from Transaction','Banking'),
  ('banking.mark_transfer','Mark Transfers','Banking'),
  ('banking.reconcile_statement','Reconcile Statements','Banking'),
  ('banking.view_balances','View Account Balances','Banking'),
  ('profitability.view','View Profitability','Profitability'),
  ('profitability.view_vehicle','View Vehicle Profitability','Profitability'),
  ('profitability.view_fleet','View Fleet Profitability','Profitability'),
  ('profitability.view_company','View Company Profitability','Profitability'),
  ('profitability.export','Export Profitability Reports','Profitability'),
  ('damage_claims.view','View Damage Claims','Damage Claims'),
  ('damage_claims.create','Create Damage Claims','Damage Claims'),
  ('damage_claims.edit','Edit Damage Claims','Damage Claims'),
  ('damage_claims.assign','Assign Damage Claims','Damage Claims'),
  ('damage_claims.determine_responsibility','Determine Responsibility','Damage Claims'),
  ('damage_claims.view_financials','View Claim Financials','Damage Claims'),
  ('damage_claims.charge_customer','Charge Customer','Damage Claims'),
  ('damage_claims.apply_deposit','Apply Deposit to Claim','Damage Claims'),
  ('damage_claims.manage_insurance','Manage Insurance Claims','Damage Claims'),
  ('damage_claims.link_expenses','Link Expenses to Claims','Damage Claims'),
  ('damage_claims.close','Close Damage Claims','Damage Claims'),
  ('damage_claims.cancel','Cancel Damage Claims','Damage Claims'),
  ('damage_claims.manage_evidence','Manage Evidence','Damage Claims'),
  ('reports.view_profitability','View Profitability Reports','Reports'),
  ('reports.view_vehicle_profitability','View Vehicle Profitability','Reports'),
  ('reports.view_revenue','View Revenue Reports','Reports'),
  ('reports.view_expenses','View Expense Reports','Reports'),
  ('reports.view_collections','View Collections Reports','Reports'),
  ('reports.export','Export Reports','Reports'),
  ('reports.view_management_summary','View Management Summary','Reports'),
  ('reports.view_operations','View Operating Reports','Reports'),
  ('reports.view_fleet_reports','View Fleet Reports','Reports'),
  ('reports.view_accounting','View Accounting Reports','Reports'),
  ('reports.view_staff_activity','View Staff Activity Reports','Reports'),
  ('reports.view_partner_reports','View Partner / Investor Reports','Reports'),
  ('reports.view_compliance','View Compliance Report','Reports'),
  ('support.view','View Support Center','Support'),
  ('support.create','Create Support Requests','Support'),
  ('support.comment','Comment on Support Requests','Support'),
  ('support.view_all_company_tickets','View All Company Support Requests','Support'),
  ('telematics.view','View Telematics','Telematics'),
  ('telematics.view_map','View Live Map / Locations','Telematics'),
  ('telematics.view_trips','View Trip History','Telematics'),
  ('telematics.view_history','View Location History','Telematics'),
  ('telematics.manage_devices','Assign / Replace / Remove Devices','Telematics'),
  ('telematics.manage_alerts','Acknowledge / Resolve / Dismiss Alerts','Telematics'),
  ('telematics.manage_geofences','Manage Geofences','Telematics'),
  ('documents.delete_draft','Delete Unused Drafts','Vehicle Docs'),
  ('verification.view','View Customer Verification','Verification'),
  ('verification.view_results','View Verification Results / History','Verification'),
  ('verification.manage_policy','Manage Verification Policy','Verification'),
  ('verification.require','Require / Remove Per-Customer Checks','Verification'),
  ('verification.run','Run Paid Verification Checks','Verification'),
  ('verification.override','Override Verification Result','Verification'),
  ('violations.view','View Violations','Violations'),
  ('violations.create','Create Violations','Violations'),
  ('violations.edit','Edit Violations','Violations'),
  ('violations.assign_responsibility','Assign Responsibility','Violations'),
  ('violations.charge_customer','Charge Customer for Violation','Violations'),
  ('violations.record_company_payment','Record Company Payment','Violations'),
  ('violations.dispute','Manage Disputes','Violations'),
  ('violations.resolve','Resolve / Close Violations','Violations'),
  ('violations.import','Import Violations (CSV)','Violations'),
  ('violations.view_financials','View Violation Financials','Violations'),
  ('staff.view','View Staff','Staff'),
  ('staff.create','Add Staff','Staff'),
  ('staff.edit','Edit Staff','Staff'),
  ('staff.deactivate','Deactivate / Suspend Staff','Staff'),
  ('staff.manage_roles','Manage Roles','Staff'),
  ('staff.manage_permissions','Manage Permissions','Staff'),
  ('staff.assign_work','Assign / Reassign Work','Staff'),
  ('staff.view_activity','View Staff Activity','Staff'),
  ('ai_workforce.view','View AI Workforce','AI Workforce'),
  ('ai_workforce.manage','Manage AI Agents & Settings','AI Workforce'),
  ('ai_workforce.approve_actions','Approve / Reject Agent Actions','AI Workforce'),
  ('ai_workforce.run','Run Agents Manually','AI Workforce'),
  ('case.view','View Cases','Case Center'),
  ('case.create','Create Cases','Case Center'),
  ('case.edit','Edit Cases','Case Center'),
  ('case.assign','Assign Cases','Case Center'),
  ('case.determine_responsibility','Determine Responsibility','Case Center'),
  ('case.resolve','Resolve Cases','Case Center'),
  ('case.close','Close Cases','Case Center'),
  ('case.upload_evidence','Upload Evidence','Case Center'),
  ('compliance.view','View Compliance','Compliance'),
  ('compliance.manage','Manage Compliance','Compliance'),
  ('documents.view','View Documents','Compliance'),
  ('documents.upload','Upload Documents','Compliance'),
  ('documents.review','Review Documents','Compliance'),
  ('documents.archive','Archive Documents','Compliance'),
  ('integrations.view','View Integrations','Integrations'),
  ('integrations.manage','Manage Integrations','Integrations'),
  ('integrations.view_events','View Event Log','Integrations'),
  ('integrations.retry','Retry Failed Events','Integrations'),
  ('integrations.resolve_reviews','Resolve Sync Reviews','Integrations'),
  ('integrations.view_payloads','View Event Payloads','Integrations'),
  ('integrations.payment_sync','Payment Sync','Integrations'),
  ('migration.view','View Migration Center','Migration'),
  ('migration.import','Import Data','Migration'),
  ('migration.manage_mapping','Manage Column Mapping','Migration'),
  ('migration.resolve_duplicates','Resolve Import Duplicates','Migration'),
  ('migration.import_active_rentals','Import Active Rentals','Migration'),
  ('migration.create_opening_balances','Create Opening Balances','Migration'),
  ('migration.import_historical_financials','Import Historical Financials','Migration'),
  ('migration.rollback','Rollback Import Batches','Migration'),
  ('migration.view_history','View Import History','Migration')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. provision_account(): idempotent server-side account initialization.
--    Called by the auth server function after a NEW signup. Creates:
--      - organization (if the user has no existing membership)
--      - owner role for that org (with ALL permissions)
--      - profile row for the user
--      - active membership linking user -> org with the owner role
--    Idempotent: if any piece exists it is reused. A user who already belongs
--    to an org will NOT create a second org (returns the existing org).
--    SECURITY DEFINER so it can insert into organizations/roles/profiles/
--    memberships regardless of the caller's RLS visibility (the caller is
--    authenticated but has no rows yet). search_path locked to public.
--    Returns: { organization_id, role_id, created_org boolean }
-- ---------------------------------------------------------------------------
create or replace function public.provision_account(
  p_user_id uuid,
  p_email text,
  p_org_name text default null,
  p_first_name text default '',
  p_last_name text default ''
)
returns table (organization_id uuid, role_id uuid, created_org boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_role_id uuid;
  v_created_org boolean := false;
  v_existing_membership uuid;
  v_org_name text;
begin
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
    -- Ensure the owner role exists for this org (idempotent).
    select r.id into v_role_id
    from public.roles r
    where r.organization_id = v_org_id and r.code = 'owner';
    if v_role_id is null then
      insert into public.roles (organization_id, name, code, is_system)
      values (v_org_id, 'Owner', 'owner', true)
      on conflict (organization_id, code) do nothing
      returning id into v_role_id;
    end if;
    -- Ensure profile exists.
    insert into public.profiles (id, email, first_name, last_name, display_name)
    values (p_user_id, p_email, p_first_name, p_last_name,
            trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')))
    on conflict (id) do update set email = excluded.email;
    -- Ensure membership has the owner role.
    update public.organization_memberships
      set role_id = v_role_id, status = 'active', joined_at = coalesce(joined_at, now())
    where organization_id = v_org_id and user_id = p_user_id;
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
  on conflict (id) do update set email = excluded.email;

  -- Active membership with owner role.
  insert into public.organization_memberships (organization_id, user_id, role_id, status, joined_at)
  values (v_org_id, p_user_id, v_role_id, 'active', now())
  on conflict (organization_id, user_id) do update
    set role_id = v_role_id, status = 'active', joined_at = coalesce(organization_memberships.joined_at, now());

  return query select v_org_id, v_role_id, v_created_org;
  return;
end;
$$;

-- Lock down provision_account: only authenticated (server-side callers with
-- the user's session) may invoke it. anon must not.
revoke execute on function public.provision_account(uuid, text, text, text, text) from public, anon;
grant execute on function public.provision_account(uuid, text, text, text, text) to authenticated, service_role;