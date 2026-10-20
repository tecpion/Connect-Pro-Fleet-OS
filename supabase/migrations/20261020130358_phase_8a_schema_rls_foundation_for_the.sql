-- Phase 8A — operational & configuration schema foundation.
-- Creates the smallest durable schema for the remaining V1 domains:
--   staff, operational staff assignments, drivers, company/settings,
--   add-on categories, add-on catalog items.
-- Completes the existing vehicle_classes table to fully represent the frozen
-- VehicleClass pricing/rate-plan model. No business logic; schema + RLS only.
-- All new org-owned tables use the established is_org_member(organization_id)
-- RLS predicate, grant to authenticated + service_role, and grant NO anon.

-- ── staff ──────────────────────────────────────────────────────────────
-- Mirrors the frozen Staff domain model (src/lib/types.ts). Staff are
-- organization-scoped operational users; roles/permissions live on the
-- existing roles/role_permissions tables (unchanged). location_ids is a
-- jsonb array (empty = all locations). responsibilities is a jsonb array of
-- operational responsibility tags (work routing only — never permissions).
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text not null default '',
  role text not null default 'staff',
  permission_overrides jsonb,
  phone text,
  display_role text,
  role_id uuid references public.roles(id) on delete set null,
  location_ids jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  last_activity_at timestamptz,
  theme text not null default 'system',
  brand_color text,
  responsibilities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists staff_org_email on public.staff (organization_id, email) where email <> '';
create index if not exists staff_org_status on public.staff (organization_id, status);
create trigger trg_staff_updated_at before update on public.staff for each row execute function public.touch_updated_at();

-- ── operational staff assignments ───────────────────────────────────────
-- Mirrors the frozen OperationalStaffAssignment domain (src/lib/staffTypes.ts):
-- a first-class RESPONSIBILITY/OWNERSHIP record over an entity, distinct from
-- Tasks and from the legacy reservation-only StaffAssignment. entity_id is a
-- generic uuid (rental/customer/vehicle/work_order/...) so no single FK.
create table if not exists public.operational_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  assignment_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  entity_label text,
  status text not null default 'active',
  assigned_by uuid references public.staff(id) on delete set null,
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  priority text,
  notes text,
  completed_at timestamptz,
  reassigned_to uuid references public.operational_staff_assignments(id) on delete set null,
  reassign_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists opa_org_staff on public.operational_staff_assignments (organization_id, staff_id, status);
create index if not exists opa_org_entity on public.operational_staff_assignments (organization_id, entity_type, entity_id);
create trigger trg_opa_updated_at before update on public.operational_staff_assignments for each row execute function public.touch_updated_at();

-- ── drivers ────────────────────────────────────────────────────────────
-- Mirrors the frozen Driver domain (src/lib/inspectionTypes.ts): a driver
-- attached to a reservation, with license + verification state.
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete cascade,
  full_name text not null,
  license_number text not null default '',
  license_state text not null default '',
  license_expiry text,
  verification_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists drivers_org_reservation on public.drivers (organization_id, reservation_id);
create trigger trg_drivers_updated_at before update on public.drivers for each row execute function public.touch_updated_at();

-- ── company settings (one authoritative row per organization) ───────────
-- The existing settings model is structured JSON (CompanyInfo + settings
-- config). Per Phase 8 guidance we keep it as a single durable structured
-- config per org rather than over-normalizing. company_info holds the
-- CompanyInfo struct (legal_name, address, contact, timezone, currency,
-- language, ...). CompanyInfo.timezone remains the authoritative timezone.
-- settings_config holds the operational/rental/deposit/late-fee/rental-period
-- rules. One row per org (organization_id unique).
create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_info jsonb not null default '{}'::jsonb,
  settings_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists company_settings_org on public.company_settings (organization_id);
create trigger trg_company_settings_updated_at before update on public.company_settings for each row execute function public.touch_updated_at();

-- ── add-on categories ──────────────────────────────────────────────────
-- Mirrors the frozen AddonCategory domain (src/lib/settingsTypes.ts).
create table if not exists public.addon_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists addon_cat_org on public.addon_categories (organization_id, active);
create trigger trg_addon_categories_updated_at before update on public.addon_categories for each row execute function public.touch_updated_at();

-- ── add-on catalog items ───────────────────────────────────────────────
-- Mirrors the frozen AddonCatalogItem domain (src/lib/settingsTypes.ts).
-- pricing_type is one_time|per_day|per_week|per_rental|custom. No marketplace
-- functionality — rental add-on persistence only.
create table if not exists public.addon_catalog_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.addon_categories(id) on delete set null,
  name text not null,
  description text not null default '',
  price numeric(12,2) not null default 0,
  pricing_type text not null default 'one_time',
  taxable boolean not null default false,
  required boolean not null default false,
  active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists addon_item_org on public.addon_catalog_items (organization_id, active);
create index if not exists addon_item_cat on public.addon_catalog_items (category_id);
create trigger trg_addon_catalog_items_updated_at before update on public.addon_catalog_items for each row execute function public.touch_updated_at();

-- ── complete vehicle_classes for the frozen VehicleClass model ─────────
-- Existing table (migration 0003) is missing: description,
-- minimum_rental_unit, default_deposit_policy_id, display_order, created_by.
-- default_deposit_policy_id is a plain uuid (no FK): deposit policies are not
-- persisted as a table in this phase, so we do not invent a FK. These are
-- additive ALTERs only — existing data and the existing vclass_rw policy are
-- preserved.
alter table public.vehicle_classes
  add column if not exists description text not null default '',
  add column if not exists minimum_rental_unit text not null default 'day',
  add column if not exists default_deposit_policy_id uuid,
  add column if not exists display_order int not null default 0,
  add column if not exists created_by uuid;

-- ── RLS + grants ────────────────────────────────────────────────────────
alter table public.staff enable row level security;
create policy staff_rw on public.staff for all
  to authenticated using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

alter table public.operational_staff_assignments enable row level security;
create policy opa_rw on public.operational_staff_assignments for all
  to authenticated using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

alter table public.drivers enable row level security;
create policy driver_rw on public.drivers for all
  to authenticated using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

alter table public.company_settings enable row level security;
create policy company_settings_rw on public.company_settings for all
  to authenticated using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

alter table public.addon_categories enable row level security;
create policy addon_cat_rw on public.addon_categories for all
  to authenticated using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

alter table public.addon_catalog_items enable row level security;
create policy addon_item_rw on public.addon_catalog_items for all
  to authenticated using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- Grants: authenticated get the access the policies allow; service_role gets
-- all (provisioning/teardown only). No anon grants.
grant select, insert, update, delete on public.staff to authenticated;
grant all on public.staff to service_role;
grant select, insert, update, delete on public.operational_staff_assignments to authenticated;
grant all on public.operational_staff_assignments to service_role;
grant select, insert, update, delete on public.drivers to authenticated;
grant all on public.drivers to service_role;
grant select, insert, update, delete on public.company_settings to authenticated;
grant all on public.company_settings to service_role;
grant select, insert, update, delete on public.addon_categories to authenticated;
grant all on public.addon_categories to service_role;
grant select, insert, update, delete on public.addon_catalog_items to authenticated;
grant all on public.addon_catalog_items to service_role;