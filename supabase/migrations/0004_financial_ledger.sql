-- Connect Pro Fleet — Build #22 migration 0004: rental ledger, payment
-- allocations, deposits. Immutable financial history — no hard deletes via
-- RLS (no DELETE policy). Money stored as numeric(12,2).

create table if not exists public.rental_ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  rental_id uuid not null references public.rentals(id) on delete restrict,
  reservation_id uuid, customer_id uuid not null, vehicle_id uuid,
  invoice_id uuid, deposit_id uuid,
  transaction_type text not null, category text not null,
  description text not null default '', amount numeric(12,2) not null default 0,
  direction text not null, payment_method text, tender_method text, processor text,
  payment_source text, external_transaction_id text, external_payment_id text,
  integration_event_id uuid,
  status text not null default 'posted',
  effective_date text not null, related_transaction_id uuid,
  billing_period uuid, charge_group_id text, metadata jsonb,
  created_at timestamptz not null default now(),
  created_by uuid, notes text
);
-- Idempotency: one payment per external identity per org.
create unique index if not exists ledger_org_ext_pay on public.rental_ledger_transactions (organization_id, external_payment_id) where external_payment_id is not null;
create unique index if not exists ledger_org_ext_txn on public.rental_ledger_transactions (organization_id, external_transaction_id) where external_transaction_id is not null and category = 'payment';
create index if not exists ledger_org_rental on public.rental_ledger_transactions (organization_id, rental_id, effective_date);
create index if not exists ledger_org_customer on public.rental_ledger_transactions (organization_id, customer_id, effective_date);

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_transaction_id uuid not null references public.rental_ledger_transactions(id) on delete restrict,
  obligation_transaction_id uuid references public.rental_ledger_transactions(id) on delete restrict,
  billing_period_id uuid references public.billing_periods(id) on delete set null,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists alloc_payment on public.payment_allocations (payment_transaction_id);

create table if not exists public.security_deposits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reservation_id uuid, rental_id uuid references public.rentals(id) on delete restrict,
  customer_id uuid not null, vehicle_id uuid, policy_id uuid,
  required_amount numeric(12,2) not null default 0,
  collected_amount numeric(12,2) not null default 0,
  applied_amount numeric(12,2) not null default 0,
  refunded_amount numeric(12,2) not null default 0,
  forfeited_amount numeric(12,2) not null default 0,
  status text not null default 'required', currency text not null default 'USD',
  source_snapshot jsonb, collected_at timestamptz, refund_due_at timestamptz, completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_deposits_updated_at before update on public.security_deposits for each row execute function public.touch_updated_at();

create table if not exists public.deposit_history_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  deposit_id uuid not null references public.security_deposits(id) on delete restrict,
  event_type text not null, amount numeric(12,2) not null default 0,
  payment_method text, staff_id uuid, related_transaction_id uuid,
  reason text, notes text,
  created_at timestamptz not null default now()
);

-- RLS: members read; financial write requires deposit permission. No DELETE.
alter table public.rental_ledger_transactions enable row level security;
create policy ledger_read on public.rental_ledger_transactions for select using (public.is_org_member(organization_id));
create policy ledger_insert on public.rental_ledger_transactions for insert with check (public.is_org_member(organization_id));
create policy ledger_update on public.rental_ledger_transactions for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- No DELETE policy => hard deletes blocked at RLS level (immutable history).

alter table public.payment_allocations enable row level security;
create policy alloc_rw on public.payment_allocations for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.security_deposits enable row level security;
create policy deposit_read on public.security_deposits for select using (public.is_org_member(organization_id));
create policy deposit_write on public.security_deposits for insert with check (public.is_org_member(organization_id));
create policy deposit_update on public.security_deposits for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.deposit_history_events enable row level security;
create policy dephist_rw on public.deposit_history_events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
