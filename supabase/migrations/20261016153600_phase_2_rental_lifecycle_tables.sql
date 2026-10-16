-- Phase 2: core rental lifecycle persistence. Adds booking_requests,
-- outbound events, inspections, agreements, and the column gaps on
-- rentals/deposit_history_events needed by the frozen V1 lifecycle.
-- All org-scoped with RLS delegating to is_org_member. No DELETE on
-- financial/audit tables (immutable history).

-- ── booking_requests ─────────────────────────────────────────────
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  location_id uuid,
  first_name text not null, last_name text not null,
  phone text not null default '', email text not null default '',
  requested_vehicle_id uuid, requested_vehicle_class_id uuid,
  requested_start_date text, requested_end_date text,
  rental_duration_type text not null default 'unknown',
  notes text,
  driver_license_document_reference text,
  driver_license_status text not null default 'not_provided',
  verification_status text not null default 'pending',
  source text not null default 'manual',
  crm_contact_id text, crm_opportunity_id text, crm_pipeline_stage text,
  external_request_id text, lead_source text,
  submitted_at timestamptz not null default now(),
  form_answers jsonb,
  status text not null default 'new',
  assigned_to uuid,
  customer_match jsonb,
  converted_reservation_id uuid,
  declined jsonb, waitlist jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists brq_org_ext on public.booking_requests (organization_id, external_request_id) where external_request_id is not null;
create index if not exists brq_org_status on public.booking_requests (organization_id, status);
do $$ begin
  create trigger trg_brq_updated_at before update on public.booking_requests for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

-- ── booking_outbound_events (recorded only, no live delivery) ────
create table if not exists public.booking_outbound_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_type text not null,
  booking_request_id uuid, crm_opportunity_id text, crm_contact_id text,
  reservation_id uuid, rental_id uuid,
  payload jsonb, delivery_state text not null default 'recorded',
  created_at timestamptz not null default now()
);
create index if not exists boe_org on public.booking_outbound_events (organization_id, created_at);

-- ── inspections (checkout/checkin) ───────────────────────────────
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reservation_id uuid, vehicle_id uuid not null,
  inspection_type text not null default 'checkout',
  photos jsonb not null default '[]',
  odometer_reading int not null default 0,
  fuel_level int not null default 0,
  damage_notes text not null default '',
  damage_detected boolean not null default false,
  damage_ai_confidence numeric(5,2) not null default 0,
  damage_ai_flagged_regions jsonb not null default '[]',
  inspector_signature_path text,
  timestamp timestamptz not null default now()
);
create index if not exists insp_org_vehicle on public.inspections (organization_id, vehicle_id);

-- ── agreement_templates ──────────────────────────────────────────
create table if not exists public.agreement_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null, agreement_type text not null default 'rental',
  description text not null default '', file_path text, file_name text,
  version int not null default 1, effective_date text,
  status text not null default 'draft', is_default boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists atmpl_org on public.agreement_templates (organization_id, status);

-- ── master_agreements ────────────────────────────────────────────
create table if not exists public.master_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  driver_id uuid, signature_path text not null,
  signed_at timestamptz not null default now(),
  terms_version text not null default '1',
  expires_at text, status text not null default 'active',
  rate_at_signing numeric(12,2) not null default 0,
  vehicle_id_at_signing uuid
);

-- ── agreement_instances ──────────────────────────────────────────
create table if not exists public.agreement_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  master_agreement_id uuid, reservation_id uuid,
  period_start text, period_end text, vehicle_id uuid,
  mileage_start int not null default 0, mileage_end int,
  rate numeric(12,2) not null default 0,
  pdf_path text, generated_at timestamptz not null default now()
);

-- ── column gaps on rentals (policy snapshot + renewal chain) ─────
alter table public.rentals
  add column if not exists policy_snapshot jsonb,
  add column if not exists prior_agreement_id uuid,
  add column if not exists renewed_from_agreement_id uuid;

-- ── request_key on deposit_history_events (idempotency) ──────────
alter table public.deposit_history_events
  add column if not exists request_key text;
create unique index if not exists dephist_org_key on public.deposit_history_events (organization_id, request_key) where request_key is not null;

-- ── RLS + grants ─────────────────────────────────────────────────
alter table public.booking_requests enable row level security;
create policy brq_rw on public.booking_requests for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.booking_outbound_events enable row level security;
create policy boe_rw on public.booking_outbound_events for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.inspections enable row level security;
create policy insp_rw on public.inspections for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.agreement_templates enable row level security;
create policy atmpl_rw on public.agreement_templates for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.master_agreements enable row level security;
create policy magr_rw on public.master_agreements for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.agreement_instances enable row level security;
create policy ains_rw on public.agreement_instances for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

-- grants for all new tables
grant select, insert, update, delete on public.booking_requests to authenticated;
grant all on public.booking_requests to service_role;
grant select, insert, update, delete on public.booking_outbound_events to authenticated;
grant all on public.booking_outbound_events to service_role;
grant select, insert, update, delete on public.inspections to authenticated;
grant all on public.inspections to service_role;
grant select, insert, update, delete on public.agreement_templates to authenticated;
grant all on public.agreement_templates to service_role;
grant select, insert, update, delete on public.master_agreements to authenticated;
grant all on public.master_agreements to service_role;
grant select, insert, update, delete on public.agreement_instances to authenticated;
grant all on public.agreement_instances to service_role;