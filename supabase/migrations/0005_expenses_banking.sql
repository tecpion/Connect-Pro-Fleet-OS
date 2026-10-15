-- Connect Pro Fleet — Build #22 migration 0005: expenses, petty cash,
-- banking/reconciliation. Separate from rental ledger. Money numeric(12,2).

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, type text not null, parent_category_id uuid,
  active boolean not null default true, default_scope text,
  created_at timestamptz not null default now()
);

create table if not exists public.expense_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  expense_number text not null,
  transaction_date text not null, entered_at timestamptz not null default now(),
  entered_by_user_id uuid, description text not null, memo text,
  amount numeric(12,2) not null default 0, currency text not null default 'USD',
  expense_category_id uuid not null references public.expense_categories(id) on delete restrict,
  expense_subcategory_id uuid, vendor_id uuid,
  payment_method text, payment_source text,
  paid_by_type text not null default 'company', paid_by_user_id uuid,
  reimbursement_status text, location_id uuid, vehicle_id uuid, rental_id uuid,
  maintenance_work_order_id uuid, ownership_context text,
  receipt_status text not null default 'missing', receipt_required boolean not null default false,
  no_receipt_reason text, status text not null default 'posted', reversal_of uuid,
  source text not null default 'manual', metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists expenses_org_number on public.expense_transactions (organization_id, expense_number);
create index if not exists expenses_org_date on public.expense_transactions (organization_id, transaction_date);
create index if not exists expenses_org_vehicle on public.expense_transactions (organization_id, vehicle_id);
create trigger trg_expenses_updated_at before update on public.expense_transactions for each row execute function public.touch_updated_at();

create table if not exists public.expense_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  expense_id uuid not null references public.expense_transactions(id) on delete restrict,
  description text, category_id uuid references public.expense_categories(id) on delete set null,
  amount numeric(12,2) not null default 0, vehicle_id uuid, work_order_id uuid, notes text
);

create table if not exists public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  expense_id uuid not null references public.expense_transactions(id) on delete restrict,
  file_name text not null, storage_path text not null, mime_type text not null default '',
  amount numeric(12,2), vendor_id uuid, receipt_type text not null default 'receipt',
  uploaded_by uuid, uploaded_at timestamptz not null default now(),
  voided_at timestamptz, note text
);

create table if not exists public.expense_reimbursements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  expense_id uuid not null references public.expense_transactions(id) on delete restrict,
  payee_type text not null, payee_user_id uuid, amount numeric(12,2) not null default 0,
  status text not null default 'owed', requested_at timestamptz, approved_at timestamptz,
  paid_at timestamptz, payment_method text, notes text
);

create table if not exists public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, location_id uuid, opening_balance numeric(12,2) not null default 0,
  active boolean not null default true, created_at timestamptz not null default now()
);

create table if not exists public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  entry_type text not null, amount numeric(12,2) not null default 0,
  expense_id uuid references public.expense_transactions(id) on delete set null,
  notes text, created_at timestamptz not null default now()
);

-- Banking / reconciliation.
create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, institution_name text, account_type text not null,
  account_subtype text, last_four text, currency text not null default 'USD',
  opening_balance numeric(12,2), active boolean not null default true,
  source text, external_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_fin_accts_updated_at before update on public.financial_accounts for each row execute function public.touch_updated_at();

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_type text not null, source_name text not null, source_file_name text,
  imported_by_user_id uuid not null, imported_at timestamptz not null default now(),
  row_count int not null default 0, success_count int not null default 0,
  skipped_count int not null default 0, warning_count int not null default 0,
  error_count int not null default 0, rollback_status text not null default 'available',
  metadata jsonb
);

create table if not exists public.financial_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  financial_account_id uuid not null references public.financial_accounts(id) on delete cascade,
  statement_start_date text not null, statement_end_date text not null,
  opening_balance numeric(12,2), closing_balance numeric(12,2),
  source_file_name text, import_batch_id uuid references public.import_batches(id) on delete set null,
  imported_at timestamptz not null default now(), imported_by_user_id uuid,
  reconciliation_status text not null default 'not_started', notes text
);

create table if not exists public.imported_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  financial_account_id uuid not null references public.financial_accounts(id) on delete cascade,
  statement_id uuid references public.financial_statements(id) on delete set null,
  external_transaction_id text, transaction_date text not null, posted_date text,
  description text not null, normalized_description text,
  amount numeric(12,2) not null default 0, direction text not null, currency text not null default 'USD',
  running_balance numeric(12,2), merchant_name text, transaction_type text, reference text,
  raw_data jsonb, import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  import_fingerprint text not null,
  review_status text not null default 'unreviewed', match_status text not null default 'unmatched',
  transfer_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists imported_org_fingerprint on public.imported_transactions (organization_id, import_fingerprint);
create index if not exists imported_org_date on public.imported_transactions (organization_id, transaction_date);
create trigger trg_imported_txn_updated_at before update on public.imported_transactions for each row execute function public.touch_updated_at();

create table if not exists public.reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  imported_transaction_id uuid not null references public.imported_transactions(id) on delete restrict,
  target_type text not null, target_id uuid, allocated_amount numeric(12,2) not null default 0,
  match_method text not null, confidence text, created_by uuid,
  created_at timestamptz not null default now(), voided_at timestamptz, notes text
);

create table if not exists public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  from_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  to_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  amount numeric(12,2) not null default 0, date text not null,
  imported_transaction_ids jsonb, notes text
);

create table if not exists public.reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_type text not null, entity_id uuid, actor_user_id uuid, note text,
  created_at timestamptz not null default now()
);

-- RLS. Financial tables: read gated by expenses.view / banking.view where
-- sensitive; write by membership. Banking balances require banking.view.
alter table public.expense_categories enable row level security;
create policy expcat_rw on public.expense_categories for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.expense_transactions enable row level security;
create policy exp_read on public.expense_transactions for select using (public.is_org_member(organization_id));
create policy exp_write on public.expense_transactions for insert with check (public.is_org_member(organization_id));
create policy exp_update on public.expense_transactions for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.expense_line_items enable row level security;
create policy expli_rw on public.expense_line_items for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.expense_receipts enable row level security;
create policy exprec_rw on public.expense_receipts for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.expense_reimbursements enable row level security;
create policy reim_rw on public.expense_reimbursements for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.cash_accounts enable row level security;
create policy cash_rw on public.cash_accounts for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.cash_entries enable row level security;
create policy cashentry_rw on public.cash_entries for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.financial_accounts enable row level security;
create policy finacct_read on public.financial_accounts for select using (public.has_permission(organization_id, 'banking.view'));
create policy finacct_write on public.financial_accounts for all using (public.has_permission(organization_id, 'banking.manage_accounts')) with check (public.has_permission(organization_id, 'banking.manage_accounts'));

alter table public.import_batches enable row level security;
create policy impbatch_rw on public.import_batches for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.financial_statements enable row level security;
create policy stmt_rw on public.financial_statements for all using (public.has_permission(organization_id, 'banking.view')) with check (public.is_org_member(organization_id));

alter table public.imported_transactions enable row level security;
create policy imptxn_read on public.imported_transactions for select using (public.has_permission(organization_id, 'banking.view'));
create policy imptxn_write on public.imported_transactions for insert with check (public.is_org_member(organization_id));
create policy imptxn_update on public.imported_transactions for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.reconciliation_matches enable row level security;
create policy recmatch_rw on public.reconciliation_matches for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.account_transfers enable row level security;
create policy acctran_rw on public.account_transfers for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.reconciliation_events enable row level security;
create policy recevt_rw on public.reconciliation_events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
