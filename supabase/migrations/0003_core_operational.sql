-- Connect Pro Fleet — Build #22 migration 0003: core operational tables
-- (customers, vehicles, classes, locations, reservations, rentals, exchanges,
-- billing periods). All organization-scoped with RLS delegating to
-- is_org_member.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  first_name text not null, last_name text not null,
  phone text not null default '', email text not null default '',
  date_of_birth text, address text, city text, state text, zip text,
  emergency_contact_name text, emergency_contact_phone text,
  customer_status text not null default 'good_standing',
  customer_source text not null default 'staff',
  notes text not null default '',
  drivers_license_number text, drivers_license_state text, drivers_license_expiry text,
  drivers_license_front_path text, drivers_license_back_path text,
  insurance_company text, insurance_policy_number text, insurance_expiry text, insurance_document_path text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists customers_org_ext on public.customers (organization_id, external_id) where external_id is not null;
create trigger trg_customers_updated_at before update on public.customers for each row execute function public.touch_updated_at();

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  vin text not null, make text not null, model text not null, year int not null,
  license_plate text not null default '', status text not null default 'available',
  location text not null default '', vehicle_type text not null default 'car',
  vehicle_class_id uuid, pricing_override boolean default false,
  min_rental_days_override int, deposit_override boolean default false,
  daily_rate numeric(12,2) not null default 0, weekly_rate numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) not null default 0,
  purchase_date text, purchase_price numeric(12,2) not null default 0,
  current_mileage int not null default 0,
  insurance_policy_number text, insurance_expiry text, registration_expiry text,
  ownership_type text, owner_entity_id uuid, owner_display_name text,
  ownership_notes text, ownership_effective_date text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists vehicles_org_vin on public.vehicles (organization_id, vin);
create unique index if not exists vehicles_org_ext on public.vehicles (organization_id, external_id) where external_id is not null;
create trigger trg_vehicles_updated_at before update on public.vehicles for each row execute function public.touch_updated_at();

create table if not exists public.vehicle_classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, vehicle_type text not null default 'car',
  daily_rate numeric(12,2) not null default 0, weekly_rate numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) not null default 0, minimum_rental_duration int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_vehicle_classes_updated_at before update on public.vehicle_classes for each row execute function public.touch_updated_at();

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, address text not null default '', phone text not null default '',
  timezone text not null default 'America/Detroit', is_default boolean not null default false
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  customer_id uuid, renter_name text not null, renter_email text not null default '', renter_phone text not null default '',
  start_date text not null, end_date text not null,
  status text not null default 'pending_verification', source text not null default 'manual',
  ghl_opportunity_id text, total_price numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) not null default 0, deposit_status text not null default 'held',
  amount_paid numeric(12,2) not null default 0, converted_to_rental_id uuid,
  pricing_snapshot jsonb,
  created_at timestamptz not null default now(),
  created_by uuid, created_by_name text not null default 'System'
);

create table if not exists public.rentals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reservation_id uuid, customer_id uuid not null, vehicle_id uuid not null,
  agreement_number text not null, status text not null default 'draft',
  checkout_date text, checkout_time text, scheduled_return_date text not null,
  scheduled_return_time text, actual_return_date text, actual_return_time text,
  rate_type text not null default 'weekly', rate_amount numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0, tax numeric(12,2) not null default 0,
  fees numeric(12,2) not null default 0, discount numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) not null default 0, amount_paid numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  mileage_out int, mileage_in int, fuel_out int, fuel_in int,
  weekly_payment_day text, next_payment_due text, payment_cutoff_time text,
  grace_period int not null default 0, late_fee numeric(12,2) not null default 0,
  late_fee_applied boolean not null default false, weeks_rented int not null default 0,
  billing_config jsonb, pricing_snapshot jsonb,
  rental_origin text default 'native', migration_cutover_at timestamptz,
  imported_legacy_rental boolean default false, external_agreement_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists rentals_org_agreement on public.rentals (organization_id, agreement_number);
create unique index if not exists rentals_org_ext on public.rentals (organization_id, external_agreement_id) where external_agreement_id is not null;
create trigger trg_rentals_updated_at before update on public.rentals for each row execute function public.touch_updated_at();

create table if not exists public.rental_vehicle_exchanges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  rental_id uuid not null references public.rentals(id) on delete restrict,
  old_vehicle_id uuid not null, new_vehicle_id uuid not null,
  effective_date text not null, old_mileage_in int not null default 0, new_mileage_out int not null default 0,
  reason text not null default '', rate_change jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  rental_id uuid not null references public.rentals(id) on delete restrict,
  period_start text not null, period_end text not null, due_at text not null, due_time text,
  amount numeric(12,2) not null default 0, base_amount numeric(12,2) not null default 0,
  fee_amount numeric(12,2) not null default 0, tax_amount numeric(12,2) not null default 0,
  status text not null default 'open', source text not null default 'native',
  external_invoice_id text, metadata jsonb,
  created_at timestamptz not null default now()
);

-- RLS: members can read; write gated by permission where appropriate.
alter table public.customers enable row level security;
create policy customer_rw on public.customers for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.vehicles enable row level security;
create policy vehicle_rw on public.vehicles for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.vehicle_classes enable row level security;
create policy vclass_rw on public.vehicle_classes for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.locations enable row level security;
create policy loc_rw on public.locations for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.reservations enable row level security;
create policy res_rw on public.reservations for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.rentals enable row level security;
create policy rental_rw on public.rentals for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.rental_vehicle_exchanges enable row level security;
create policy exch_rw on public.rental_vehicle_exchanges for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.billing_periods enable row level security;
create policy bp_rw on public.billing_periods for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
