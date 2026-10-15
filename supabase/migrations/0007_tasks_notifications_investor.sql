-- Connect Pro Fleet — Build #22 migration 0007: tasks, notifications,
-- investor/JV, migration, integration, infrastructure.

-- Tasks.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  task_number text not null, title text not null, description text,
  status text not null default 'open', priority text not null default 'normal',
  source_type text not null default 'manual', source_event text, dedupe_key text,
  assigned_to_user_id uuid, assigned_by_user_id uuid, created_by_user_id uuid,
  due_date text, due_time text, completed_at timestamptz, completed_by_user_id uuid,
  cancelled_at timestamptz, cancelled_by_user_id uuid, cancellation_reason text,
  entity_type text, entity_id uuid, entity_label text, location_id uuid,
  category text not null default 'other', tags jsonb, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tasks_org_number on public.tasks (organization_id, task_number);
create unique index if not exists tasks_org_dedupe on public.tasks (organization_id, dedupe_key) where dedupe_key is not null;
create index if not exists tasks_org_assignee on public.tasks (organization_id, assigned_to_user_id, status, due_date);
create trigger trg_tasks_updated_at before update on public.tasks for each row execute function public.touch_updated_at();

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  task_id uuid not null references public.tasks(id) on delete restrict,
  event_type text not null, actor_user_id uuid, actor_is_system boolean not null default false,
  old_value text, new_value text, note text,
  created_at timestamptz not null default now()
);

create table if not exists public.task_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  task_id uuid not null references public.tasks(id) on delete restrict,
  author_user_id uuid not null, text text not null,
  created_at timestamptz not null default now()
);

-- Notifications.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  recipient_user_id uuid not null, notification_type text not null, category text not null,
  priority text not null default 'normal', title text not null, message text not null,
  entity_type text, entity_id uuid, entity_label text, action_url text,
  source_event text not null, source_event_id text, dedupe_key text, actor_user_id uuid,
  read_at timestamptz, archived_at timestamptz, expires_at timestamptz, metadata jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists notif_org_dedupe on public.notifications (organization_id, recipient_user_id, dedupe_key) where dedupe_key is not null;
create index if not exists notif_recipient on public.notifications (recipient_user_id, read_at, archived_at);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  notification_id uuid not null references public.notifications(id) on delete restrict,
  recipient_user_id uuid not null, channel text not null, destination text,
  status text not null default 'pending', provider text, provider_message_id text,
  attempt_count int not null default 0, last_attempt_at timestamptz, sent_at timestamptz,
  failed_at timestamptz, failure_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null, category text not null,
  in_app_enabled boolean not null default true, email_enabled boolean not null default true,
  connect_pro_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, category)
);

-- Investor / JV.
create table if not exists public.investors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null, partner_type text not null default 'individual',
  contact_name text, email text not null default '', phone text, address text,
  status text not null default 'active', notes text, external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists investors_org_ext on public.investors (organization_id, external_id) where external_id is not null;
create trigger trg_investors_updated_at before update on public.investors for each row execute function public.touch_updated_at();

create table if not exists public.investor_vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  investor_id uuid not null references public.investors(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  status text not null default 'active', effective_date text not null, end_date text,
  compensation_type text not null, percentage numeric(5,2), basis text,
  fixed_amount numeric(12,2), fixed_frequency text,
  guaranteed_when_not_rented boolean, guaranteed_during_downtime boolean,
  custom_terms text, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_invveh_updated_at before update on public.investor_vehicles for each row execute function public.touch_updated_at();

create table if not exists public.partnership_expense_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  pairing_id uuid not null references public.investor_vehicles(id) on delete cascade,
  category text not null, treatment text not null, responsible_party text,
  deduct_before_split boolean not null default false, notes text
);

create table if not exists public.investor_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  investor_id uuid not null references public.investors(id) on delete restrict,
  pairing_id uuid, vehicle_id uuid, period_start text not null, period_end text not null,
  status text not null default 'draft', gross_revenue numeric(12,2) not null default 0,
  expenses numeric(12,2) not null default 0, investor_amount numeric(12,2) not null default 0,
  operator_amount numeric(12,2) not null default 0, finalized_at timestamptz, finalized_by uuid,
  paid_at timestamptz, notes text,
  created_at timestamptz not null default now()
);

-- Migration.
create table if not exists public.migration_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_type text not null, source_name text not null, source_file_name text,
  imported_by_user_id uuid not null, imported_at timestamptz not null default now(),
  row_count int not null default 0, success_count int not null default 0,
  skipped_count int not null default 0, warning_count int not null default 0,
  error_count int not null default 0, rollback_status text not null default 'available',
  metadata jsonb
);

create table if not exists public.migration_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null references public.migration_import_batches(id) on delete cascade,
  row_number int, entity_type text, severity text not null, code text not null,
  message text not null, resolution text, resolved_at timestamptz
);

create table if not exists public.historical_financial_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start text not null, period_end text not null, granularity text not null,
  source_system text not null, revenue numeric(14,2) not null default 0,
  collections numeric(14,2), expenses numeric(14,2), net_profit numeric(14,2),
  rental_count int, vehicle_count int, notes text, import_batch_id uuid,
  created_at timestamptz not null default now()
);

-- Integration.
create table if not exists public.connect_pro_integration_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  enabled boolean not null default false, connection_status text not null default 'not_connected',
  external_location_id text, default_sync_enabled boolean not null default true,
  payment_sync_enabled boolean not null default true, billing_event_sync_enabled boolean not null default true,
  customer_sync_enabled boolean not null default true, webhook_secret_status text not null default 'missing',
  last_successful_sync_at timestamptz, last_error_at timestamptz, last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cp_config_org on public.connect_pro_integration_configs (organization_id);
create trigger trg_cp_config_updated_at before update on public.connect_pro_integration_configs for each row execute function public.touch_updated_at();

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  integration text not null, event_type text not null, direction text not null,
  entity_type text, entity_id uuid, external_entity_id text,
  payload jsonb not null, event_key text not null, schema_version int not null default 1,
  origin_system text not null default 'fleet', origin_event_id text, caused_by_event_id uuid,
  status text not null default 'pending', attempts int not null default 0,
  last_attempt_at timestamptz, processed_at timestamptz, error_code text, error_message text,
  created_at timestamptz not null default now()
);
create unique index if not exists intevt_org_key on public.integration_events (organization_id, integration, event_key);
create index if not exists intevt_org_status on public.integration_events (organization_id, status);

create table if not exists public.external_entity_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  system text not null, entity_type text not null, internal_id uuid not null,
  external_id text not null, external_parent_id text, status text not null default 'active',
  metadata jsonb, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists extref_org_sys on public.external_entity_references (organization_id, system, entity_type, external_id);
create unique index if not exists extref_org_internal on public.external_entity_references (organization_id, system, entity_type, internal_id);
create trigger trg_extref_updated_at before update on public.external_entity_references for each row execute function public.touch_updated_at();

create table if not exists public.integration_review_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.integration_events(id) on delete restrict,
  review_type text not null, severity text not null default 'warning', status text not null default 'open',
  reason text not null, candidate_entity_ids jsonb, resolution text, resolved_by uuid, resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Infrastructure.
create table if not exists public.idempotency_keys (
  organization_id uuid not null, scope text not null, request_key text not null,
  entity_id uuid, created_at timestamptz not null default now(),
  primary key (organization_id, scope, request_key)
);

create table if not exists public.document_sequences (
  organization_id uuid not null, sequence_type text not null, year int not null,
  current_value int not null default 0,
  primary key (organization_id, sequence_type, year)
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  at timestamptz not null default now(), label text not null, tone text not null default 'neutral',
  staff_id uuid
);

create table if not exists public.file_objects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  bucket text not null, storage_path text not null, file_name text not null,
  mime_type text not null default '', size_bytes bigint,
  entity_type text, entity_id uuid, uploaded_by uuid,
  created_at timestamptz not null default now()
);

-- RLS.
alter table public.tasks enable row level security;
create policy task_rw on public.tasks for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
alter table public.task_events enable row level security;
create policy taskevt_rw on public.task_events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
alter table public.task_notes enable row level security;
create policy tasknote_rw on public.task_notes for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.notifications enable row level security;
create policy notif_rw on public.notifications for all using (organization_id in (select m.organization_id from public.organization_memberships m where m.user_id = auth.uid()) and recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());
alter table public.notification_deliveries enable row level security;
create policy notifdel_rw on public.notification_deliveries for all using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());
alter table public.notification_preferences enable row level security;
create policy notifpref_rw on public.notification_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.investors enable row level security;
create policy inv_rw on public.investors for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
alter table public.investor_vehicles enable row level security;
create policy invveh_rw on public.investor_vehicles for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
alter table public.partnership_expense_rules enable row level security;
create policy per_rw on public.partnership_expense_rules for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
alter table public.investor_settlements enable row level security;
create policy invset_rw on public.investor_settlements for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.migration_import_batches enable row level security;
create policy migbatch_rw on public.migration_import_batches for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
alter table public.migration_issues enable row level security;
create policy migissue_rw on public.migration_issues for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
alter table public.historical_financial_periods enable row level security;
create policy histfin_rw on public.historical_financial_periods for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.connect_pro_integration_configs enable row level security;
create policy cpconfig_rw on public.connect_pro_integration_configs for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
alter table public.integration_events enable row level security;
create policy intevt_rw on public.integration_events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
alter table public.external_entity_references enable row level security;
create policy extref_rw on public.external_entity_references for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
alter table public.integration_review_items enable row level security;
create policy intrev_rw on public.integration_review_items for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

alter table public.idempotency_keys enable row level security;
create policy idem_rw on public.idempotency_keys for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
alter table public.document_sequences enable row level security;
create policy docseq_rw on public.document_sequences for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
alter table public.activity_log enable row level security;
create policy actlog_rw on public.activity_log for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
alter table public.file_objects enable row level security;
create policy fileobj_rw on public.file_objects for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
