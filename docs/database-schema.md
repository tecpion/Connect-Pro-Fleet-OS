# Connect Pro Fleet — Database Schema (Build #22)

Connect Pro Fleet uses Supabase (PostgreSQL + Auth + Storage) for production
persistence. The schema mirrors the existing TypeScript domain model so the
mock store can be swapped for Supabase-backed repositories without changing
business semantics. SQL lives in `supabase/migrations/`.

## Tenancy & Auth

- **`organizations`** — one row per company (the "tenant"). `id` is the
  `organization_id` referenced by every tenant-scoped table.
- **`profiles`** — one row per auth user (`id = auth.users.id`). No passwords
  stored here; Supabase Auth owns identity.
- **`roles`** — system roles (Owner/Manager/User, `organization_id` null) and
  org-specific custom roles.
- **`permissions`** + **`role_permissions`** — the canonical permission catalog
  (mirrors `permissionCatalog.ts`).
- **`organization_memberships`** — `(organization_id, user_id)` unique. A user
  may belong to multiple organizations.
- **`organization_invitations`** — pending team invites.

## Core Operational (all `organization_id`-scoped)

`customers`, `vehicles`, `vehicle_classes`, `locations`, `reservations`,
`rentals`, `rental_vehicle_exchanges`, `billing_periods`.

- UUIDs are primary keys; human-readable numbers (`agreement_number`,
  `work_order_number`, `claim_number`, `expense_number`) are separate unique
  columns, not PKs.
- `rentals` preserves `payment_cutoff_time`, `grace_period`, `rental_origin`,
  `migration_cutover_at`, `imported_legacy_rental`, `external_agreement_id` —
  the exact-time late policy (Build #21) and legacy-rental cutover (Build #19)
  survive persistence.
- `rental_vehicle_exchanges` keeps effective-date vehicle history for
  exchange-aware profitability (Build #16).

## Financial Ledger (immutable, append-oriented)

- **`rental_ledger_transactions`** — the authoritative rental ledger. No DELETE
  RLS policy → hard deletes are blocked. Reversals are appended rows
  (`related_transaction_id`, `status='voided'`).
- **`payment_allocations`** — durable FIFO allocation rows so historical
  payment allocation is never recomputed from mutable charge ordering.
- Unique indexes enforce external-payment idempotency:
  `(organization_id, external_payment_id)` and
  `(organization_id, external_transaction_id)` for payments.
- **`security_deposits`** + **`deposit_history_events`** — held money, never
  revenue. Migration-origin deposits carry `source_snapshot` metadata.

## Expenses / Banking (separate from rental ledger)

`expense_transactions`, `expense_line_items`, `expense_categories`,
`expense_receipts`, `expense_reimbursements`, `cash_accounts`, `cash_entries`,
`financial_accounts`, `imported_transactions`, `financial_statements`,
`import_batches`, `reconciliation_matches`, `account_transfers`,
`reconciliation_events`.

- Money is `numeric(12,2)`; repository layer normalizes string↔number.
- `imported_transactions.import_fingerprint` unique index → idempotent CSV import.
- Imported transactions are evidence only — never revenue/expense.

## Maintenance / Damage

`maintenance_work_orders`, `maintenance_vendors`, `maintenance_receipts`,
`maintenance_work_order_events`, `damage_claims`, `damage_evidence`,
`damage_claim_events`, `damage_insurance_claims`, `damage_recoveries`.

- `blocks_vehicle_use` is an explicit flag (not inferred from status).
- Damage financial truth stays in ledger/expenses/deposits + recovery records.

## Tasks / Notifications / Investor / Migration / Integration

`tasks`, `task_events`, `task_notes`, `notifications`, `notification_deliveries`,
`notification_preferences`, `investors`, `investor_vehicles`,
`partnership_expense_rules`, `investor_settlements`, `migration_import_batches`,
`migration_issues`, `historical_financial_periods`,
`connect_pro_integration_configs`, `integration_events`,
`external_entity_references`, `integration_review_items`.

- `integration_events.(organization_id, integration, event_key)` unique →
  durable outbox idempotency that survives refresh.
- `external_entity_references` unique by
  `(organization_id, system, entity_type, external_id)`.
- `historical_financial_periods` is reporting-only — never merged into ledger.

## Infrastructure

- **`idempotency_keys`** — `(organization_id, scope, request_key)` unique;
  financial RPCs record request keys so duplicate submits across devices yield
  one effect.
- **`document_sequences`** — atomic human-readable numbering via the
  `next_document_number` RPC (concurrency-safe `INSERT ... ON CONFLICT`).
- **`activity_log`**, **`file_objects`** — operational audit + file metadata.

## Transactional RPCs

- **`post_payment(...)`** — atomic payment post: validates membership, enforces
  external-payment-id + request-key idempotency, inserts the ledger payment,
  records the idempotency key. Allocation rows are written by the repository
  after computing FIFO (the atomic write boundary is the RPC; allocation math
  stays in TypeScript to avoid a divergent SQL FIFO).
- **`next_document_number(...)`** — atomic sequence generation for rental/WO/
  claim/expense numbers.

## Source-of-truth boundaries

- Revenue, payments, deposits, late fees, allocation, investor economics, and
  damage recovery remain defined by the TypeScript domain layer. Supabase is
  durable persistence + authorization + storage — it does not redefine what
  revenue is.
