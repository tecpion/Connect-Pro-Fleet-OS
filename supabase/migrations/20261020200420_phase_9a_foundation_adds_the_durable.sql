-- Phase 9A — Remaining V1 financial/agreement/audit persistence foundation.
-- Adds durable, organization-scoped tables for:
--   rental_events, invoices, receipts, payment_arrangements,
--   payment_arrangement_installments, payment_arrangement_events
--
-- Financial semantics preserved (NO triggers that create ledger rows):
--   invoice  = amount/document owed (not revenue by existing)
--   receipt  = payment/document evidence (not a new payment)
--   arrangement = customer promise (not a payment, not P&L)
-- The rental_ledger_transactions table remains the financial source of truth.

-- ============================================================================
-- rental_events — append-only rental timeline (derived/read-only Rental Record
-- stays derived; these are the authoritative event rows).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rental_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rental_id uuid NOT NULL,
  type text NOT NULL,
  label text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  tone text NOT NULL DEFAULT 'neutral',
  staff_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rental_events_org_rental_idx
  ON public.rental_events (organization_id, rental_id, at DESC);
CREATE INDEX IF NOT EXISTS rental_events_org_at_idx
  ON public.rental_events (organization_id, at DESC);

ALTER TABLE public.rental_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_events_rw" ON public.rental_events
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_events TO authenticated;
GRANT ALL ON public.rental_events TO service_role;

-- ============================================================================
-- invoices — document owed (not revenue). Ledger remains authoritative.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  customer_id uuid NOT NULL,
  rental_id uuid,
  reservation_id uuid,
  billing_period_start text,
  billing_period_end text,
  issue_date text NOT NULL,
  due_date text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One invoice number per organization (matches V1 identity).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_number_uniq
  ON public.invoices (organization_id, invoice_number);
CREATE INDEX IF NOT EXISTS invoices_org_customer_idx
  ON public.invoices (organization_id, customer_id);
CREATE INDEX IF NOT EXISTS invoices_org_rental_idx
  ON public.invoices (organization_id, rental_id);
CREATE INDEX IF NOT EXISTS invoices_org_status_idx
  ON public.invoices (organization_id, status);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_rw" ON public.invoices
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

-- ============================================================================
-- receipts — payment/document evidence. One economic event = one authoritative
-- record. Creating a receipt must NOT create a ledger payment.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  customer_id uuid NOT NULL,
  rental_id uuid,
  reservation_id uuid,
  vehicle_id uuid,
  payment_transaction_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  external_transaction_id text,
  applied_invoice_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  remaining_balance numeric NOT NULL DEFAULT 0,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid,
  status text NOT NULL DEFAULT 'issued',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS receipts_org_number_uniq
  ON public.receipts (organization_id, receipt_number);
CREATE INDEX IF NOT EXISTS receipts_org_customer_idx
  ON public.receipts (organization_id, customer_id);
CREATE INDEX IF NOT EXISTS receipts_org_payment_idx
  ON public.receipts (organization_id, payment_transaction_id);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receipts_rw" ON public.receipts
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;

-- ============================================================================
-- payment_arrangements — customer promise to pay. NOT a payment, NOT P&L.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_arrangements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  arrangement_number text NOT NULL,
  customer_id uuid NOT NULL,
  rental_id uuid,
  invoice_id uuid,
  billing_period_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  original_outstanding_amount numeric NOT NULL DEFAULT 0,
  arrangement_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  start_date text NOT NULL,
  grace_period_days integer NOT NULL DEFAULT 0,
  terms_summary text NOT NULL DEFAULT '',
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  broken_at timestamptz,
  cancelled_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_arrangements_org_number_uniq
  ON public.payment_arrangements (organization_id, arrangement_number);
CREATE INDEX IF NOT EXISTS payment_arrangements_org_customer_idx
  ON public.payment_arrangements (organization_id, customer_id);
CREATE INDEX IF NOT EXISTS payment_arrangements_org_status_idx
  ON public.payment_arrangements (organization_id, status);

ALTER TABLE public.payment_arrangements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_arrangements_rw" ON public.payment_arrangements
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_arrangements TO authenticated;
GRANT ALL ON public.payment_arrangements TO service_role;

-- ============================================================================
-- payment_arrangement_installments — single promised payment.
-- amount_paid is DERIVED from linked payments; not stored here to avoid
-- duplicating ledger authority. linked_payments carries the allocation.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_arrangement_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  arrangement_id uuid NOT NULL REFERENCES public.payment_arrangements(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  amount_due numeric NOT NULL DEFAULT 0,
  due_date text NOT NULL,
  linked_payment_transaction_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_payments jsonb NOT NULL DEFAULT '[]'::jsonb,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One installment identity per arrangement + sequence (V1 identity rule).
CREATE UNIQUE INDEX IF NOT EXISTS payment_arrangement_installments_arr_seq_uniq
  ON public.payment_arrangement_installments (arrangement_id, sequence);
CREATE INDEX IF NOT EXISTS payment_arrangement_installments_org_arr_idx
  ON public.payment_arrangement_installments (organization_id, arrangement_id);
CREATE INDEX IF NOT EXISTS payment_arrangement_installments_org_due_idx
  ON public.payment_arrangement_installments (organization_id, due_date);

ALTER TABLE public.payment_arrangement_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_arrangement_installments_rw" ON public.payment_arrangement_installments
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_arrangement_installments TO authenticated;
GRANT ALL ON public.payment_arrangement_installments TO service_role;

-- ============================================================================
-- payment_arrangement_events — append-oriented arrangement audit trail.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_arrangement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  arrangement_id uuid NOT NULL REFERENCES public.payment_arrangements(id) ON DELETE CASCADE,
  type text NOT NULL,
  label text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  staff_id uuid,
  amount numeric,
  installment_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_arrangement_events_org_arr_idx
  ON public.payment_arrangement_events (organization_id, arrangement_id, at DESC);

ALTER TABLE public.payment_arrangement_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_arrangement_events_rw" ON public.payment_arrangement_events
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_arrangement_events TO authenticated;
GRANT ALL ON public.payment_arrangement_events TO service_role;

-- ============================================================================
-- Existing agreement/audit tables: confirm org-scoped RLS already present.
-- activity_log, agreement_templates, agreement_instances, master_agreements
-- already have organization_id + is_org_member policies (verified pre-audit).
-- No additive columns required: the domain models (ActivityEntry,
-- AgreementTemplate, AgreementInstance, MasterAgreement) are already
-- representable by the existing columns.
-- ============================================================================