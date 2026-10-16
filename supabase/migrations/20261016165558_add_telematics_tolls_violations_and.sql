-- Connect Pro Fleet — Phase 4: telematics + tolls/violations + case center.

-- =========================================================================
-- TELEMATICS
-- =========================================================================

create table if not exists public.telematics_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'custom',
  external_device_id text not null,
  imei_or_serial text,
  vehicle_id uuid,
  status text not null default 'unknown',
  installed_at timestamptz not null default now(),
  last_connected_at timestamptz,
  battery_voltage numeric(8,2),
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists td_org_ext on public.telematics_devices (organization_id, external_device_id);
create index if not exists td_org_vehicle on public.telematics_devices (organization_id, vehicle_id);

create table if not exists public.telematics_device_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.telematics_devices(id) on delete cascade,
  vehicle_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists tda_device on public.telematics_device_assignments (device_id);
create index if not exists tda_vehicle on public.telematics_device_assignments (vehicle_id);

create table if not exists public.telematics_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null,
  vehicle_id uuid not null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  recorded_at timestamptz not null,
  provider_timestamp timestamptz,
  heading numeric(6,2),
  speed numeric(8,2),
  ignition_status text,
  odometer numeric(12,2),
  battery_voltage numeric(8,2),
  gps_signal_status text,
  created_at timestamptz not null default now()
);
create index if not exists tp_vehicle on public.telematics_positions (organization_id, vehicle_id, recorded_at desc);

create table if not exists public.telematics_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null,
  vehicle_id uuid not null,
  type text not null,
  occurred_at timestamptz not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists te_vehicle on public.telematics_events (organization_id, vehicle_id, occurred_at desc);

create table if not exists public.telematics_trips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null,
  device_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  start_location text not null default '',
  end_location text not null default '',
  distance numeric(12,2),
  duration_minutes numeric(10,2),
  max_speed numeric(8,2),
  average_speed numeric(8,2),
  rental_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists ttr_vehicle on public.telematics_trips (organization_id, vehicle_id, started_at desc);

create table if not exists public.telematics_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null,
  rental_id uuid,
  event_id uuid,
  severity text not null default 'low',
  type text not null,
  occurred_at timestamptz not null,
  location text,
  status text not null default 'new',
  assigned_to uuid,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tal_org on public.telematics_alerts (organization_id, status, occurred_at desc);

create table if not exists public.telematics_geofences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'custom',
  active boolean not null default true,
  center_latitude numeric(10,7) not null,
  center_longitude numeric(10,7) not null,
  radius_meters numeric(12,2),
  applies_to_all boolean not null default true,
  applies_to_class_id uuid,
  applies_to_vehicle_ids jsonb,
  alert_on_enter boolean not null default false,
  alert_on_exit boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists tg_org on public.telematics_geofences (organization_id, active);

-- =========================================================================
-- TOLLS / VIOLATIONS
-- =========================================================================

create table if not exists public.violations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  violation_number text not null,
  violation_type text not null default 'toll',
  status text not null default 'new',
  vehicle_id uuid not null,
  rental_id uuid,
  customer_id uuid,
  occurred_at timestamptz not null,
  received_at timestamptz,
  due_at timestamptz,
  issuing_authority text,
  citation_number text,
  plate_number_snapshot text,
  state_jurisdiction text,
  location_description text,
  description text,
  base_amount numeric(12,2) not null default 0,
  penalties_amount numeric(12,2) not null default 0,
  admin_fee_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  responsibility text not null default 'unknown',
  responsibility_reason text,
  responsibility_notes text,
  responsibility_decided_by uuid,
  responsibility_decided_at timestamptz,
  dispute_status text not null default 'not_disputed',
  dispute_reason text,
  dispute_opened_at timestamptz,
  dispute_resolved_at timestamptz,
  dispute_decision_note text,
  reduced_amount numeric(12,2),
  company_payment_status text not null default 'not_paid',
  customer_charge_status text not null default 'not_charged',
  reimbursement_status text not null default 'none',
  linked_expense_id uuid,
  customer_charge_transaction_id uuid,
  charge_idempotency_key text,
  assigned_staff_id uuid,
  notes text,
  source text not null default 'manual',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  provider text,
  external_event_id text,
  matching_confidence text,
  reviewed_by uuid,
  reviewed_at timestamptz
);
create unique index if not exists v_org_number on public.violations (organization_id, violation_number);
create unique index if not exists v_org_ext on public.violations (organization_id, provider, external_event_id) where external_event_id is not null;
create index if not exists v_org_vehicle on public.violations (organization_id, vehicle_id, occurred_at desc);
create index if not exists v_org_rental on public.violations (organization_id, rental_id);
create index if not exists v_org_status on public.violations (organization_id, status);
create trigger trg_viol_updated_at before update on public.violations for each row execute function public.touch_updated_at();

create table if not exists public.violation_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  violation_id uuid not null references public.violations(id) on delete cascade,
  type text not null,
  file_ref text,
  source text,
  description text,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now()
);
create index if not exists ve_viol on public.violation_evidence (organization_id, violation_id);

create table if not exists public.violation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  violation_id uuid not null references public.violations(id) on delete cascade,
  type text not null,
  label text not null,
  at timestamptz not null default now(),
  actor_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists vev_viol on public.violation_events (organization_id, violation_id, at desc);

-- =========================================================================
-- CASE CENTER
-- =========================================================================

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_number text not null,
  category text not null default 'general',
  status text not null default 'new',
  priority text not null default 'normal',
  title text not null,
  description text,
  customer_id uuid,
  vehicle_id uuid,
  rental_id uuid,
  event_date timestamptz,
  assigned_staff_id uuid,
  location_id uuid,
  due_date timestamptz,
  responsibility jsonb not null default '{"determination":"unreviewed","reason":null,"determined_by":null,"determined_at":null}',
  amount_at_issue numeric(12,2) not null default 0,
  toll_detail jsonb,
  roadside_detail jsonb,
  dispute_detail jsonb,
  financial_links jsonb not null default '{}',
  evidence_links jsonb not null default '{}',
  outcome jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz
);
create unique index if not exists c_org_number on public.cases (organization_id, case_number);
create index if not exists c_org_status on public.cases (organization_id, status);
create index if not exists c_org_rental on public.cases (organization_id, rental_id);
create trigger trg_case_updated_at before update on public.cases for each row execute function public.touch_updated_at();

create table if not exists public.case_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  type text not null,
  label text not null,
  at timestamptz not null default now(),
  actor_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ce_case on public.case_events (organization_id, case_id, at desc);

-- =========================================================================
-- GRANTS
-- =========================================================================

grant select, insert, update, delete on public.telematics_devices to authenticated;
grant all on public.telematics_devices to service_role;
grant select, insert, update, delete on public.telematics_device_assignments to authenticated;
grant all on public.telematics_device_assignments to service_role;
grant select, insert, update, delete on public.telematics_positions to authenticated;
grant all on public.telematics_positions to service_role;
grant select, insert, update, delete on public.telematics_events to authenticated;
grant all on public.telematics_events to service_role;
grant select, insert, update, delete on public.telematics_trips to authenticated;
grant all on public.telematics_trips to service_role;
grant select, insert, update, delete on public.telematics_alerts to authenticated;
grant all on public.telematics_alerts to service_role;
grant select, insert, update, delete on public.telematics_geofences to authenticated;
grant all on public.telematics_geofences to service_role;

grant select, insert, update, delete on public.violations to authenticated;
grant all on public.violations to service_role;
grant select, insert, update, delete on public.violation_evidence to authenticated;
grant all on public.violation_evidence to service_role;
grant select, insert, update, delete on public.violation_events to authenticated;
grant all on public.violation_events to service_role;

grant select, insert, update, delete on public.cases to authenticated;
grant all on public.cases to service_role;
grant select, insert, update, delete on public.case_events to authenticated;
grant all on public.case_events to service_role;

-- =========================================================================
-- RLS — all org-scoped via is_org_member
-- =========================================================================

alter table public.telematics_devices enable row level security;
create policy td_read on public.telematics_devices for select to authenticated using (public.is_org_member(organization_id));
create policy td_write on public.telematics_devices for insert to authenticated with check (public.is_org_member(organization_id));
create policy td_update on public.telematics_devices for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy td_delete on public.telematics_devices for delete to authenticated using (public.is_org_member(organization_id));

alter table public.telematics_device_assignments enable row level security;
create policy tda_read on public.telematics_device_assignments for select to authenticated using (public.is_org_member(organization_id));
create policy tda_write on public.telematics_device_assignments for insert to authenticated with check (public.is_org_member(organization_id));
create policy tda_update on public.telematics_device_assignments for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy tda_delete on public.telematics_device_assignments for delete to authenticated using (public.is_org_member(organization_id));

alter table public.telematics_positions enable row level security;
create policy tp_read on public.telematics_positions for select to authenticated using (public.is_org_member(organization_id));
create policy tp_write on public.telematics_positions for insert to authenticated with check (public.is_org_member(organization_id));
create policy tp_delete on public.telematics_positions for delete to authenticated using (public.is_org_member(organization_id));

alter table public.telematics_events enable row level security;
create policy te_read on public.telematics_events for select to authenticated using (public.is_org_member(organization_id));
create policy te_write on public.telematics_events for insert to authenticated with check (public.is_org_member(organization_id));

alter table public.telematics_trips enable row level security;
create policy ttr_read on public.telematics_trips for select to authenticated using (public.is_org_member(organization_id));
create policy ttr_write on public.telematics_trips for insert to authenticated with check (public.is_org_member(organization_id));
create policy ttr_update on public.telematics_trips for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.telematics_alerts enable row level security;
create policy tal_read on public.telematics_alerts for select to authenticated using (public.is_org_member(organization_id));
create policy tal_write on public.telematics_alerts for insert to authenticated with check (public.is_org_member(organization_id));
create policy tal_update on public.telematics_alerts for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.telematics_geofences enable row level security;
create policy tg_read on public.telematics_geofences for select to authenticated using (public.is_org_member(organization_id));
create policy tg_write on public.telematics_geofences for insert to authenticated with check (public.is_org_member(organization_id));
create policy tg_update on public.telematics_geofences for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy tg_delete on public.telematics_geofences for delete to authenticated using (public.is_org_member(organization_id));

alter table public.violations enable row level security;
create policy v_read on public.violations for select to authenticated using (public.is_org_member(organization_id));
create policy v_write on public.violations for insert to authenticated with check (public.is_org_member(organization_id));
create policy v_update on public.violations for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy v_delete on public.violations for delete to authenticated using (public.is_org_member(organization_id));

alter table public.violation_evidence enable row level security;
create policy ve_read on public.violation_evidence for select to authenticated using (public.is_org_member(organization_id));
create policy ve_write on public.violation_evidence for insert to authenticated with check (public.is_org_member(organization_id));
create policy ve_delete on public.violation_evidence for delete to authenticated using (public.is_org_member(organization_id));

alter table public.violation_events enable row level security;
create policy vev_read on public.violation_events for select to authenticated using (public.is_org_member(organization_id));
create policy vev_write on public.violation_events for insert to authenticated with check (public.is_org_member(organization_id));

alter table public.cases enable row level security;
create policy c_read on public.cases for select to authenticated using (public.is_org_member(organization_id));
create policy c_write on public.cases for insert to authenticated with check (public.is_org_member(organization_id));
create policy c_update on public.cases for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy c_delete on public.cases for delete to authenticated using (public.is_org_member(organization_id));

alter table public.case_events enable row level security;
create policy ce_read on public.case_events for select to authenticated using (public.is_org_member(organization_id));
create policy ce_write on public.case_events for insert to authenticated with check (public.is_org_member(organization_id));