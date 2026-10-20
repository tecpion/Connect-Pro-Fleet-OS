// Connect Pro Fleet — Phase 9 row ↔ domain mappers.
//
// Maps between the Phase 9 DB row types (dbTypesPhase9 + reused agreement/audit
// rows in dbTypesCore/dbTypesIntegrations) and the existing V1 domain objects.
//
// Financial safeguards (frozen V1 model):
//   invoice      = amount/document owed (NOT revenue). Mapping never synthesizes
//                 a ledger/payment row.
//   receipt      = payment/document evidence (NOT a new payment). Mapping never
//                 creates a FinancialTransaction.
//   arrangement  = customer promise (NOT a payment, NOT P&L). Mapping never
//                 alters the ledger. linked_payments are references/evidence
//                 only; amount_paid is derived, never stored.
//   deposit      = held funds, not revenue (unchanged, not mapped here).
//
// The rental_ledger_transactions table remains the authoritative financial
// source of truth. No mapper in this module writes to it or derives revenue.

import type { RentalEvent, RentalEventType } from "../types";
import type {
  Invoice,
  Receipt,
  InvoiceLineItem,
  InvoiceStatus,
  ReceiptStatus,
} from "../invoiceTypes";
import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
  ArrangementEvent,
  ArrangementStatus,
  ArrangementEventType,
  LinkedPayment,
} from "../paymentArrangementTypes";
import type { ActivityEntry } from "../store/storeContext";
import type {
  AgreementTemplate,
  AgreementTemplateStatus,
} from "../settingsTypes";
import type {
  MasterAgreement,
  AgreementInstance,
  AgreementStatus,
} from "../types";
import type {
  RentalEventRow,
  InvoiceRow,
  ReceiptRow,
  PaymentArrangementRow,
  PaymentArrangementInstallmentRow,
  PaymentArrangementEventRow,
} from "./dbTypesPhase9";
import type {
  AgreementTemplateRow,
  MasterAgreementRow,
  AgreementInstanceRow,
} from "./dbTypesCore";
import type { ActivityLogRow } from "./dbTypesIntegrations";
import { toMoney } from "./repository";

// ---------------------------------------------------------------------------
// JSON helpers — JSON columns are flexible unions; cast through unknown.
// ---------------------------------------------------------------------------

function asJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  return v as unknown as T;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function asLinkedPayments(v: unknown): LinkedPayment[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const transaction_id = o.transaction_id;
      const amount = o.amount;
      if (typeof transaction_id !== "string" || typeof amount !== "number")
        return null;
      return { transaction_id, amount } as LinkedPayment;
    })
    .filter((x): x is LinkedPayment => x !== null);
}

// ---------------------------------------------------------------------------
// Rental events — append-only rental timeline.
// ---------------------------------------------------------------------------

export function rowToRentalEvent(r: RentalEventRow): RentalEvent {
  return {
    id: r.id,
    rental_id: r.rental_id,
    type: r.type as RentalEventType,
    label: r.label,
    at: r.at,
    tone: r.tone as RentalEvent["tone"],
    staff_id: r.staff_id,
  };
}

export function rentalEventToRow(
  orgId: string,
  e: RentalEvent,
): Omit<RentalEventRow, "created_at"> {
  return {
    id: e.id,
    organization_id: orgId,
    rental_id: e.rental_id,
    type: e.type,
    label: e.label,
    at: e.at,
    tone: e.tone,
    staff_id: e.staff_id,
    metadata: null,
  };
}

// ---------------------------------------------------------------------------
// Invoices — document owed; NOT revenue. No ledger synthesis.
// ---------------------------------------------------------------------------

export function rowToInvoice(r: InvoiceRow): Invoice {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    invoice_number: r.invoice_number,
    customer_id: r.customer_id,
    rental_id: r.rental_id,
    reservation_id: r.reservation_id,
    billing_period_start: r.billing_period_start,
    billing_period_end: r.billing_period_end,
    issue_date: r.issue_date,
    due_date: r.due_date,
    status: r.status as InvoiceStatus,
    line_items: asJson<InvoiceLineItem[]>(r.line_items, []),
    subtotal: toMoney(r.subtotal),
    tax: toMoney(r.tax),
    total: toMoney(r.total),
    amount_paid: toMoney(r.amount_paid),
    balance_due: toMoney(r.balance_due),
    notes: r.notes,
    created_at: r.created_at,
    created_by: r.created_by,
  };
}

export function invoiceToRow(
  i: Invoice,
): Omit<InvoiceRow, "created_at" | "updated_at"> {
  return {
    id: i.id,
    organization_id: i.tenant_id,
    invoice_number: i.invoice_number,
    customer_id: i.customer_id,
    rental_id: i.rental_id,
    reservation_id: i.reservation_id,
    billing_period_start: i.billing_period_start,
    billing_period_end: i.billing_period_end,
    issue_date: i.issue_date,
    due_date: i.due_date,
    status: i.status,
    line_items: i.line_items as unknown as InvoiceRow["line_items"],
    subtotal: i.subtotal,
    tax: i.tax,
    total: i.total,
    amount_paid: i.amount_paid,
    balance_due: i.balance_due,
    notes: i.notes,
    created_by: i.created_by,
  };
}

export function invoicePatchToRow(
  patch: Partial<Invoice>,
): Partial<Omit<InvoiceRow, "created_at" | "updated_at">> {
  const out: Partial<Omit<InvoiceRow, "created_at" | "updated_at">> = {};
  if (patch.tenant_id !== undefined) out.organization_id = patch.tenant_id;
  if (patch.invoice_number !== undefined)
    out.invoice_number = patch.invoice_number;
  if (patch.customer_id !== undefined) out.customer_id = patch.customer_id;
  if (patch.rental_id !== undefined) out.rental_id = patch.rental_id;
  if (patch.reservation_id !== undefined)
    out.reservation_id = patch.reservation_id;
  if (patch.billing_period_start !== undefined)
    out.billing_period_start = patch.billing_period_start;
  if (patch.billing_period_end !== undefined)
    out.billing_period_end = patch.billing_period_end;
  if (patch.issue_date !== undefined) out.issue_date = patch.issue_date;
  if (patch.due_date !== undefined) out.due_date = patch.due_date;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.line_items !== undefined)
    out.line_items = patch.line_items as unknown as InvoiceRow["line_items"];
  if (patch.subtotal !== undefined) out.subtotal = patch.subtotal;
  if (patch.tax !== undefined) out.tax = patch.tax;
  if (patch.total !== undefined) out.total = patch.total;
  if (patch.amount_paid !== undefined) out.amount_paid = patch.amount_paid;
  if (patch.balance_due !== undefined) out.balance_due = patch.balance_due;
  if (patch.notes !== undefined) out.notes = patch.notes;
  if (patch.created_by !== undefined) out.created_by = patch.created_by;
  return out;
}

// ---------------------------------------------------------------------------
// Receipts — payment/document evidence; NOT a new payment. No ledger synthesis.
// ---------------------------------------------------------------------------

export function rowToReceipt(r: ReceiptRow): Receipt {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    receipt_number: r.receipt_number,
    customer_id: r.customer_id,
    rental_id: r.rental_id,
    reservation_id: r.reservation_id,
    vehicle_id: r.vehicle_id,
    payment_transaction_id: r.payment_transaction_id,
    amount: toMoney(r.amount),
    payment_method: (r.payment_method ?? "cash") as Receipt["payment_method"],
    external_transaction_id: r.external_transaction_id,
    applied_invoice_ids: asStringArray(r.applied_invoice_ids),
    remaining_balance: toMoney(r.remaining_balance),
    issued_at: r.issued_at,
    issued_by: r.issued_by,
    status: r.status as ReceiptStatus,
  };
}

export function receiptToRow(rc: Receipt): Omit<ReceiptRow, "created_at"> {
  return {
    id: rc.id,
    organization_id: rc.tenant_id,
    receipt_number: rc.receipt_number,
    customer_id: rc.customer_id,
    rental_id: rc.rental_id,
    reservation_id: rc.reservation_id,
    vehicle_id: rc.vehicle_id,
    payment_transaction_id: rc.payment_transaction_id,
    amount: rc.amount,
    payment_method: rc.payment_method,
    external_transaction_id: rc.external_transaction_id,
    applied_invoice_ids:
      rc.applied_invoice_ids as unknown as ReceiptRow["applied_invoice_ids"],
    remaining_balance: rc.remaining_balance,
    issued_at: rc.issued_at,
    issued_by: rc.issued_by,
    status: rc.status,
  };
}

// ---------------------------------------------------------------------------
// Payment arrangements — customer promise; NOT a payment, NOT P&L.
// ---------------------------------------------------------------------------

export function rowToPaymentArrangement(
  r: PaymentArrangementRow,
): PaymentArrangement {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    arrangement_number: r.arrangement_number,
    customer_id: r.customer_id,
    rental_id: r.rental_id,
    invoice_id: r.invoice_id,
    billing_period_ids: asStringArray(r.billing_period_ids),
    original_outstanding_amount: toMoney(r.original_outstanding_amount),
    arrangement_amount: toMoney(r.arrangement_amount),
    status: r.status as ArrangementStatus,
    start_date: r.start_date,
    grace_period_days: r.grace_period_days,
    terms_summary: r.terms_summary,
    reason: r.reason,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    completed_at: r.completed_at,
    broken_at: r.broken_at,
    cancelled_at: r.cancelled_at,
  };
}

export function paymentArrangementToRow(
  a: PaymentArrangement,
): Omit<PaymentArrangementRow, "created_at" | "updated_at"> {
  return {
    id: a.id,
    organization_id: a.tenant_id,
    arrangement_number: a.arrangement_number,
    customer_id: a.customer_id,
    rental_id: a.rental_id,
    invoice_id: a.invoice_id,
    billing_period_ids:
      a.billing_period_ids as unknown as PaymentArrangementRow["billing_period_ids"],
    original_outstanding_amount: a.original_outstanding_amount,
    arrangement_amount: a.arrangement_amount,
    status: a.status,
    start_date: a.start_date,
    grace_period_days: a.grace_period_days,
    terms_summary: a.terms_summary,
    reason: a.reason,
    created_by: a.created_by,
    completed_at: a.completed_at,
    broken_at: a.broken_at,
    cancelled_at: a.cancelled_at,
  };
}

export function paymentArrangementPatchToRow(
  patch: Partial<PaymentArrangement>,
): Partial<Omit<PaymentArrangementRow, "created_at" | "updated_at">> {
  const out: Partial<Omit<PaymentArrangementRow, "created_at" | "updated_at">> =
    {};
  if (patch.tenant_id !== undefined) out.organization_id = patch.tenant_id;
  if (patch.arrangement_number !== undefined)
    out.arrangement_number = patch.arrangement_number;
  if (patch.customer_id !== undefined) out.customer_id = patch.customer_id;
  if (patch.rental_id !== undefined) out.rental_id = patch.rental_id;
  if (patch.invoice_id !== undefined) out.invoice_id = patch.invoice_id;
  if (patch.billing_period_ids !== undefined)
    out.billing_period_ids =
      patch.billing_period_ids as unknown as PaymentArrangementRow["billing_period_ids"];
  if (patch.original_outstanding_amount !== undefined)
    out.original_outstanding_amount = patch.original_outstanding_amount;
  if (patch.arrangement_amount !== undefined)
    out.arrangement_amount = patch.arrangement_amount;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.start_date !== undefined) out.start_date = patch.start_date;
  if (patch.grace_period_days !== undefined)
    out.grace_period_days = patch.grace_period_days;
  if (patch.terms_summary !== undefined)
    out.terms_summary = patch.terms_summary;
  if (patch.reason !== undefined) out.reason = patch.reason;
  if (patch.created_by !== undefined) out.created_by = patch.created_by;
  if (patch.completed_at !== undefined) out.completed_at = patch.completed_at;
  if (patch.broken_at !== undefined) out.broken_at = patch.broken_at;
  if (patch.cancelled_at !== undefined) out.cancelled_at = patch.cancelled_at;
  return out;
}

// ---------------------------------------------------------------------------
// Arrangement installments — amount_paid is DERIVED from linked_payments;
// never stored. linked_payments are references/evidence only.
// ---------------------------------------------------------------------------

export function rowToPaymentArrangementInstallment(
  r: PaymentArrangementInstallmentRow,
): PaymentArrangementInstallment {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    arrangement_id: r.arrangement_id,
    sequence: r.sequence,
    amount_due: toMoney(r.amount_due),
    due_date: r.due_date,
    linked_payment_transaction_ids: asStringArray(
      r.linked_payment_transaction_ids,
    ),
    linked_payments: asLinkedPayments(r.linked_payments),
    paid_at: r.paid_at,
    notes: r.notes,
    created_at: r.created_at,
  };
}

export function paymentArrangementInstallmentToRow(
  i: PaymentArrangementInstallment,
): Omit<PaymentArrangementInstallmentRow, "created_at"> {
  return {
    id: i.id,
    organization_id: i.tenant_id,
    arrangement_id: i.arrangement_id,
    sequence: i.sequence,
    amount_due: i.amount_due,
    due_date: i.due_date,
    linked_payment_transaction_ids:
      i.linked_payment_transaction_ids as unknown as PaymentArrangementInstallmentRow["linked_payment_transaction_ids"],
    linked_payments:
      i.linked_payments as unknown as PaymentArrangementInstallmentRow["linked_payments"],
    paid_at: i.paid_at,
    notes: i.notes,
  };
}

export function paymentArrangementInstallmentPatchToRow(
  patch: Partial<PaymentArrangementInstallment>,
): Partial<Omit<PaymentArrangementInstallmentRow, "created_at">> {
  const out: Partial<Omit<PaymentArrangementInstallmentRow, "created_at">> = {};
  if (patch.tenant_id !== undefined) out.organization_id = patch.tenant_id;
  if (patch.arrangement_id !== undefined)
    out.arrangement_id = patch.arrangement_id;
  if (patch.sequence !== undefined) out.sequence = patch.sequence;
  if (patch.amount_due !== undefined) out.amount_due = patch.amount_due;
  if (patch.due_date !== undefined) out.due_date = patch.due_date;
  if (patch.linked_payment_transaction_ids !== undefined)
    out.linked_payment_transaction_ids =
      patch.linked_payment_transaction_ids as unknown as PaymentArrangementInstallmentRow["linked_payment_transaction_ids"];
  if (patch.linked_payments !== undefined)
    out.linked_payments =
      patch.linked_payments as unknown as PaymentArrangementInstallmentRow["linked_payments"];
  if (patch.paid_at !== undefined) out.paid_at = patch.paid_at;
  if (patch.notes !== undefined) out.notes = patch.notes;
  return out;
}

// ---------------------------------------------------------------------------
// Arrangement events — append-oriented audit trail.
// ---------------------------------------------------------------------------

export function rowToArrangementEvent(
  r: PaymentArrangementEventRow,
): ArrangementEvent {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    arrangement_id: r.arrangement_id,
    type: r.type as ArrangementEventType,
    label: r.label,
    at: r.at,
    staff_id: r.staff_id,
    amount: r.amount,
    installment_id: r.installment_id,
    notes: r.notes,
  };
}

export function arrangementEventToRow(
  e: ArrangementEvent,
): Omit<PaymentArrangementEventRow, "created_at"> {
  return {
    id: e.id,
    organization_id: e.tenant_id,
    arrangement_id: e.arrangement_id,
    type: e.type,
    label: e.label,
    at: e.at,
    staff_id: e.staff_id,
    amount: e.amount ?? null,
    installment_id: e.installment_id ?? null,
    notes: e.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Activity / audit history — durable append-oriented feed.
// The domain ActivityEntry carries no staff_id; the row preserves it so the
// actor/source is durable across relogin even when the in-memory feed does
// not surface it.
// ---------------------------------------------------------------------------

export function rowToActivityEntry(r: ActivityLogRow): ActivityEntry {
  return {
    id: r.id,
    at: r.at,
    label: r.label,
    tone: r.tone as ActivityEntry["tone"],
  };
}

export function activityEntryToRow(
  orgId: string,
  e: ActivityEntry,
  staffId: string | null = null,
): ActivityLogRow {
  return {
    id: e.id,
    organization_id: orgId,
    at: e.at,
    label: e.label,
    tone: e.tone,
    staff_id: staffId,
  };
}

// ---------------------------------------------------------------------------
// Agreement templates — template content/version/default/active state.
// ---------------------------------------------------------------------------

export function rowToAgreementTemplate(
  r: AgreementTemplateRow,
): AgreementTemplate {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    name: r.name,
    agreement_type: r.agreement_type,
    description: r.description,
    file_url: r.file_path ?? "",
    file_name: r.file_name ?? "",
    version: r.version,
    effective_date: r.effective_date ?? "",
    status: r.status as AgreementTemplateStatus,
    is_default: r.is_default,
    created_at: r.created_at,
    created_by: r.created_by,
  };
}

export function agreementTemplateToRow(
  t: AgreementTemplate,
): Omit<AgreementTemplateRow, "created_at"> {
  return {
    id: t.id,
    organization_id: t.tenant_id,
    name: t.name,
    agreement_type: t.agreement_type,
    description: t.description,
    file_path: t.file_url || null,
    file_name: t.file_name || null,
    version: t.version,
    effective_date: t.effective_date || null,
    status: t.status,
    is_default: t.is_default,
    created_by: t.created_by,
  };
}

// ---------------------------------------------------------------------------
// Master agreements — driver signature/path/timestamp/terms version.
// ---------------------------------------------------------------------------

export function rowToMasterAgreement(r: MasterAgreementRow): MasterAgreement {
  return {
    id: r.id,
    driver_id: r.driver_id ?? "",
    tenant_id: r.organization_id,
    signature_url: r.signature_path,
    signed_at: r.signed_at,
    terms_version: r.terms_version,
    expires_at: r.expires_at ?? "",
    status: r.status as AgreementStatus,
    rate_at_signing: toMoney(r.rate_at_signing),
    vehicle_id_at_signing: r.vehicle_id_at_signing ?? "",
  };
}

export function masterAgreementToRow(
  m: MasterAgreement,
): Omit<MasterAgreementRow, never> {
  return {
    id: m.id,
    organization_id: m.tenant_id,
    driver_id: m.driver_id || null,
    signature_path: m.signature_url,
    signed_at: m.signed_at,
    terms_version: m.terms_version,
    expires_at: m.expires_at || null,
    status: m.status,
    rate_at_signing: m.rate_at_signing,
    vehicle_id_at_signing: m.vehicle_id_at_signing || null,
  };
}

// ---------------------------------------------------------------------------
// Agreement instances — rendered agreement data for a rental/customer.
// ---------------------------------------------------------------------------

export function rowToAgreementInstance(
  r: AgreementInstanceRow,
): AgreementInstance {
  return {
    id: r.id,
    master_agreement_id: r.master_agreement_id ?? "",
    reservation_id: r.reservation_id ?? "",
    period_start: r.period_start ?? "",
    period_end: r.period_end ?? "",
    vehicle_id: r.vehicle_id ?? "",
    mileage_start: r.mileage_start,
    mileage_end: r.mileage_end,
    rate: toMoney(r.rate),
    pdf_url: r.pdf_path ?? "",
    generated_at: r.generated_at,
    tenant_id: r.organization_id,
  };
}

export function agreementInstanceToRow(
  a: AgreementInstance,
): Omit<AgreementInstanceRow, "generated_at"> {
  return {
    id: a.id,
    organization_id: a.tenant_id,
    master_agreement_id: a.master_agreement_id || null,
    reservation_id: a.reservation_id || null,
    period_start: a.period_start || null,
    period_end: a.period_end || null,
    vehicle_id: a.vehicle_id || null,
    mileage_start: a.mileage_start,
    mileage_end: a.mileage_end,
    rate: a.rate,
    pdf_path: a.pdf_url || null,
  };
}
