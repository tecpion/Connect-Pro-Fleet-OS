// Connect Pro Fleet — typed Database row types: Phase 9 financial/agreement/
// audit persistence (rental events, invoices, receipts, payment arrangements,
// arrangement installments, arrangement events). Build #22.
//
// Financial semantics (schema enforces NO ledger side effects):
//   invoice      = amount/document owed (not revenue by existing)
//   receipt      = payment/document evidence (not a new payment)
//   arrangement  = customer promise (not a payment, not P&L)
// The rental_ledger_transactions table remains the authoritative financial
// source of truth.

import type { Json } from "./dbTypesCore";

// ── rental events (append-only rental timeline) ────────────────────────────

export interface RentalEventRow {
  id: string;
  organization_id: string;
  rental_id: string;
  type: string;
  label: string;
  at: string;
  tone: string;
  staff_id: string | null;
  metadata: Json | null;
  created_at: string;
}

// ── invoices (document owed; not revenue) ───────────────────────────────────

export interface InvoiceRow {
  id: string;
  organization_id: string;
  invoice_number: string;
  customer_id: string;
  rental_id: string | null;
  reservation_id: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  issue_date: string;
  due_date: string;
  status: string;
  line_items: Json;
  subtotal: number;
  tax: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── receipts (payment/document evidence; not a new payment) ────────────────

export interface ReceiptRow {
  id: string;
  organization_id: string;
  receipt_number: string;
  customer_id: string;
  rental_id: string | null;
  reservation_id: string | null;
  vehicle_id: string | null;
  payment_transaction_id: string;
  amount: number;
  payment_method: string | null;
  external_transaction_id: string | null;
  applied_invoice_ids: Json;
  remaining_balance: number;
  issued_at: string;
  issued_by: string | null;
  status: string;
  created_at: string;
}

// ── payment arrangements (customer promise; not a payment, not P&L) ─────────

export interface PaymentArrangementRow {
  id: string;
  organization_id: string;
  arrangement_number: string;
  customer_id: string;
  rental_id: string | null;
  invoice_id: string | null;
  billing_period_ids: Json;
  original_outstanding_amount: number;
  arrangement_amount: number;
  status: string;
  start_date: string;
  grace_period_days: number;
  terms_summary: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  broken_at: string | null;
  cancelled_at: string | null;
}

// ── arrangement installments (single promised payment) ─────────────────────
// amount_paid is DERIVED from linked_payments; not stored to avoid duplicating
// ledger authority.

export interface PaymentArrangementInstallmentRow {
  id: string;
  organization_id: string;
  arrangement_id: string;
  sequence: number;
  amount_due: number;
  due_date: string;
  linked_payment_transaction_ids: Json;
  linked_payments: Json;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

// ── arrangement events (append-oriented audit trail) ───────────────────────

export interface PaymentArrangementEventRow {
  id: string;
  organization_id: string;
  arrangement_id: string;
  type: string;
  label: string;
  at: string;
  staff_id: string | null;
  amount: number | null;
  installment_id: string | null;
  notes: string | null;
  created_at: string;
}

// ── existing agreement/audit tables (confirmed org-scoped, reused) ──────────

export interface ActivityLogRow {
  id: string;
  organization_id: string;
  at: string;
  label: string;
  tone: string;
  staff_id: string | null;
}

export interface AgreementTemplateRow {
  id: string;
  organization_id: string;
  name: string;
  agreement_type: string;
  description: string;
  file_path: string | null;
  file_name: string | null;
  version: number;
  effective_date: string | null;
  status: string;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
}

export interface AgreementInstanceRow {
  id: string;
  organization_id: string;
  master_agreement_id: string | null;
  reservation_id: string | null;
  period_start: string | null;
  period_end: string | null;
  vehicle_id: string | null;
  mileage_start: number;
  mileage_end: number | null;
  rate: number;
  pdf_path: string | null;
  generated_at: string;
}

export interface MasterAgreementRow {
  id: string;
  organization_id: string;
  driver_id: string | null;
  signature_path: string;
  signed_at: string;
  terms_version: string;
  expires_at: string | null;
  status: string;
  rate_at_signing: number;
  vehicle_id_at_signing: string | null;
}
