-- Phase 3: compliance + verification persistence (maintenance tables already
-- exist from migration 0006). These back the frozen V1 release-gate inputs.
-- All org-scoped with RLS delegating to is_org_member. No DELETE on audit history.

-- ── compliance_documents ────────────────────────────────────────────────
create table if not exists public.compliance_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  entity_label text not null default '',
  document_number text,
  issuer text,
  state_jurisdiction text,
  effective_date text,
  expiration_date text,
  status text not null default 'missing',
  verification_status text not null default 'not_reviewed',
  file_reference text,
  original_filename text,
  mime_type text,
  notes text,
  source text not null default 'manual',
  uploaded_by uuid,
  uploaded_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejected_reason text,
  archived_at timestamptz,
  supersedes_document_id uuid,
  superseded_by_document_id uuid,
  location_id uuid,
  assigned_staff_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cdoc_org_entity on public.compliance_documents (organization_id, entity_type, entity_id);
create index if not exists cdoc_org_type on public.compliance_documents (organization_id, document_type);
do $$ begin
  create trigger trg_cdoc_updated_at before update on public.compliance_documents for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

-- ── compliance_requirements ────────────────────────────────────────────
create table if not exists public.compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entity_type text not null,
  document_type text not null,
  required boolean not null default false,
  blocks_operation_if_missing boolean not null default false,
  blocks_operation_if_expired boolean not null default false,
  requires_verification boolean not null default false,
  warning_days int not null default 30,
  active boolean not null default true,
  block_behavior text,
  manager_override_allowed boolean not null default true,
  source text not null default 'policy',
  applies_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creq_org_entity on public.compliance_requirements (organization_id, entity_type, document_type);
do $$ begin
  create trigger trg_creq_updated_at before update on public.compliance_requirements for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

-- ── compliance_overrides ────────────────────────────────────────────────
create table if not exists public.compliance_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  document_type text not null,
  requirement_id uuid,
  reason text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true
);
create index if not exists covr_org_entity on public.compliance_overrides (organization_id, entity_type, entity_id);

-- ── compliance_events (append-only audit) ──────────────────────────────
create table if not exists public.compliance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid,
  event_type text not null,
  label text not null default '',
  actor_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cevt_org on public.compliance_events (organization_id, created_at);

-- ── verification_requests ────────────────────────────────────────────────
create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid,
  booking_request_id uuid,
  reservation_id uuid,
  rental_id uuid,
  verification_type text not null,
  provider text not null default 'full_provider',
  status text not null default 'not_started',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  requested_by uuid,
  external_reference text,
  expires_at timestamptz,
  usage_charge_id uuid,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vreq_org_type on public.verification_requests (organization_id, verification_type);
create index if not exists vreq_org_customer on public.verification_requests (organization_id, customer_id);
do $$ begin
  create trigger trg_vreq_updated_at before update on public.verification_requests for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

-- ── verification_requirements (per customer/rental staff requirements) ──
create table if not exists public.verification_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  verification_type text not null,
  customer_id uuid,
  booking_request_id uuid,
  reservation_id uuid,
  rental_id uuid,
  required_by_staff_id uuid,
  required_at timestamptz not null default now(),
  reason text,
  removed boolean not null default false,
  removed_by_staff_id uuid,
  removed_at timestamptz
);
create index if not exists vreq2_org_type on public.verification_requirements (organization_id, verification_type);

-- ── verification_overrides ──────────────────────────────────────────────
create table if not exists public.verification_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  verification_request_id uuid not null,
  decision text not null,
  reason text not null default '',
  staff_id uuid,
  created_at timestamptz not null default now()
);

-- ── verification_audit_events (append-only) ──────────────────────────────
create table if not exists public.verification_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  verification_type text not null,
  customer_id uuid,
  rental_id uuid,
  reservation_id uuid,
  booking_request_id uuid,
  event_type text not null,
  detail text,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists vaudit_org on public.verification_audit_events (organization_id, created_at);

-- ── verification_usage_charges (mock pricing) ───────────────────────────
create table if not exists public.verification_usage_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  verification_request_id uuid not null,
  service_type text not null,
  provider text not null,
  provider_cost_mock numeric(12,2),
  platform_price_mock numeric(12,2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'estimated',
  created_at timestamptz not null default now()
);
create index if not exists vchg_org on public.verification_usage_charges (organization_id, created_at);

-- ── RLS + grants for all new tables ─────────────────────────────────────
alter table public.compliance_documents enable row level security;
create policy cdoc_rw on public.compliance_documents for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.compliance_requirements enable row level security;
create policy creq_rw on public.compliance_requirements for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.compliance_overrides enable row level security;
create policy covr_rw on public.compliance_overrides for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.compliance_events enable row level security;
create policy cevt_rw on public.compliance_events for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.verification_requests enable row level security;
create policy vreq_rw on public.verification_requests for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.verification_requirements enable row level security;
create policy vreq2_rw on public.verification_requirements for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.verification_overrides enable row level security;
create policy vovr_rw on public.verification_overrides for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.verification_audit_events enable row level security;
create policy vaudit_rw on public.verification_audit_events for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.verification_usage_charges enable row level security;
create policy vchg_rw on public.verification_usage_charges for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

-- grants
grant select, insert, update, delete on public.compliance_documents to authenticated;
grant all on public.compliance_documents to service_role;
grant select, insert, update, delete on public.compliance_requirements to authenticated;
grant all on public.compliance_requirements to service_role;
grant select, insert, update, delete on public.compliance_overrides to authenticated;
grant all on public.compliance_overrides to service_role;
grant select, insert on public.compliance_events to authenticated;
grant all on public.compliance_events to service_role;
grant select, insert, update, delete on public.verification_requests to authenticated;
grant all on public.verification_requests to service_role;
grant select, insert, update, delete on public.verification_requirements to authenticated;
grant all on public.verification_requirements to service_role;
grant select, insert, update, delete on public.verification_overrides to authenticated;
grant all on public.verification_overrides to service_role;
grant select, insert on public.verification_audit_events to authenticated;
grant all on public.verification_audit_events to service_role;
grant select, insert, update, delete on public.verification_usage_charges to authenticated;
grant all on public.verification_usage_charges to service_role;