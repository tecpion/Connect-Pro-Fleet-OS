-- Connect Pro Fleet — Build #22 migration 0006: maintenance + damage claims.

create table if not exists public.maintenance_vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, contact_name text, phone text, email text,
  address text, city text, state text, postal text, vendor_type text,
  notes text, active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_maint_vendor_updated_at before update on public.maintenance_vendors for each row execute function public.touch_updated_at();

create table if not exists public.maintenance_work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  work_order_number text not null,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  location_id uuid, status text not null default 'open', priority text not null default 'normal',
  maintenance_type text not null default 'routine_service', source text not null default 'manual',
  title text not null, description text not null default '',
  reported_issue text, diagnosis text, work_performed text,
  vendor_id uuid references public.maintenance_vendors(id) on delete set null,
  assigned_user_id uuid, opened_by_user_id uuid not null, opened_at timestamptz not null default now(),
  scheduled_start_at timestamptz, actual_start_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  expected_ready_at timestamptz, actual_ready_at timestamptz,
  odometer_in int, odometer_out int, fuel_level_in int,
  notes text, internal_notes text,
  estimated_cost numeric(12,2), actual_cost numeric(12,2), labor_cost numeric(12,2),
  parts_cost numeric(12,2), tax_cost numeric(12,2), other_cost numeric(12,2),
  downtime_started_at timestamptz, downtime_ended_at timestamptz,
  next_service_due_date text, next_service_due_odometer int,
  blocks_vehicle_use boolean not null default false,
  damage_claim_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wo_org_number on public.maintenance_work_orders (organization_id, work_order_number);
create index if not exists wo_org_vehicle on public.maintenance_work_orders (organization_id, vehicle_id);
create trigger trg_wo_updated_at before update on public.maintenance_work_orders for each row execute function public.touch_updated_at();

create table if not exists public.maintenance_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  work_order_id uuid not null references public.maintenance_work_orders(id) on delete restrict,
  file_name text not null, storage_path text not null, mime_type text not null default '',
  amount numeric(12,2), vendor_id uuid, receipt_type text not null default 'receipt',
  uploaded_by uuid, uploaded_at timestamptz not null default now(), note text
);

create table if not exists public.maintenance_work_order_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  work_order_id uuid not null references public.maintenance_work_orders(id) on delete restrict,
  event_type text not null, actor_user_id uuid, actor_is_system boolean not null default false,
  old_value text, new_value text, note text,
  created_at timestamptz not null default now()
);

create table if not exists public.damage_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  claim_number text not null,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  rental_id uuid, reservation_id uuid, customer_id uuid, inspection_id uuid, incident_id uuid,
  claim_status text not null default 'open', damage_source text not null default 'checkin_inspection',
  discovered_at timestamptz not null default now(), discovered_by_user_id uuid, damage_date text,
  location_id uuid, responsibility_status text not null default 'undetermined',
  responsible_party_type text, customer_responsibility_percent int check (customer_responsibility_percent between 0 and 100),
  description text not null default '', severity text not null default 'minor',
  pre_existing text, blocks_vehicle_use boolean not null default false,
  estimated_repair_cost numeric(12,2), approved_repair_cost numeric(12,2), actual_repair_cost numeric(12,2),
  customer_charge_amount numeric(12,2), insurance_recovery_amount numeric(12,2), other_recovery_amount numeric(12,2),
  maintenance_work_order_id uuid, insurance_claim_id uuid, external_reference text,
  assigned_user_id uuid, closed_at timestamptz, closed_by_user_id uuid, metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists dmg_org_number on public.damage_claims (organization_id, claim_number);
create index if not exists dmg_org_vehicle on public.damage_claims (organization_id, vehicle_id);
create trigger trg_dmg_updated_at before update on public.damage_claims for each row execute function public.touch_updated_at();

create table if not exists public.damage_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  damage_claim_id uuid not null references public.damage_claims(id) on delete restrict,
  evidence_type text not null, storage_path text not null, inspection_photo_id uuid,
  description text, captured_at timestamptz, uploaded_by_user_id uuid,
  voided_at timestamptz, created_at timestamptz not null default now()
);

create table if not exists public.damage_claim_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  damage_claim_id uuid not null references public.damage_claims(id) on delete restrict,
  event_type text not null, actor_user_id uuid, actor_is_system boolean not null default false,
  old_value text, new_value text, note text,
  created_at timestamptz not null default now()
);

create table if not exists public.damage_insurance_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  damage_claim_id uuid not null references public.damage_claims(id) on delete restrict,
  insurer_name text not null, policy_reference text, claim_reference text not null,
  claim_status text not null default 'not_filed',
  deductible_amount numeric(12,2), claimed_amount numeric(12,2), approved_amount numeric(12,2), paid_amount numeric(12,2),
  filed_at timestamptz, approved_at timestamptz, paid_at timestamptz,
  adjuster_name text, adjuster_contact text, notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.damage_recoveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  damage_claim_id uuid not null references public.damage_claims(id) on delete restrict,
  recovery_type text not null, amount numeric(12,2) not null default 0, date text not null,
  source_reference text, ledger_transaction_id uuid, deposit_transaction_id uuid, insurance_claim_id uuid,
  notes text, created_at timestamptz not null default now(), reversed_at timestamptz
);

-- RLS.
alter table public.maintenance_vendors enable row level security;
create policy mv_rw on public.maintenance_vendors for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.maintenance_work_orders enable row level security;
create policy wo_read on public.maintenance_work_orders for select using (public.is_org_member(organization_id));
create policy wo_write on public.maintenance_work_orders for insert with check (public.is_org_member(organization_id));
create policy wo_update on public.maintenance_work_orders for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.maintenance_receipts enable row level security;
create policy mrec_rw on public.maintenance_receipts for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.maintenance_work_order_events enable row level security;
create policy woevt_rw on public.maintenance_work_order_events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.damage_claims enable row level security;
create policy dmg_read on public.damage_claims for select using (public.is_org_member(organization_id));
create policy dmg_write on public.damage_claims for insert with check (public.is_org_member(organization_id));
create policy dmg_update on public.damage_claims for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.damage_evidence enable row level security;
create policy dev_rw on public.damage_evidence for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.damage_claim_events enable row level security;
create policy dmgevt_rw on public.damage_claim_events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.damage_insurance_claims enable row level security;
create policy dmgins_rw on public.damage_insurance_claims for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.damage_recoveries enable row level security;
create policy dmgrec_rw on public.damage_recoveries for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
