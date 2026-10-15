// Connect Pro Fleet — Payment Arrangements domain types (Build #10).
//
// A Payment Arrangement is the customer's PROMISE to pay an outstanding balance
// over time. It is NOT a payment. Creating an arrangement must NOT reduce the
// customer's actual ledger balance, mark invoices/BillingPeriods paid, count as
// collections, count as revenue, or generate a receipt.
//
// The FinancialTransaction ledger remains the financial source of truth for
// what is actually owed and what has actually been paid. The arrangement is
// operational tracking layered on top — it records what the customer promised
// to do about that balance, and links actual posted payments to installments so
// staff can see whether the promise is being kept.
//
//   Ledger            = what is actually owed and paid
//   PaymentArrangement = what the customer promised to do about that balance

// ---------------------------------------------------------------------------
// Arrangement statuses (operational lifecycle)
// ---------------------------------------------------------------------------

export type ArrangementStatus =
  "draft" | "active" | "completed" | "broken" | "cancelled";

export const ARRANGEMENT_STATUS_LABELS: Record<ArrangementStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  broken: "Broken",
  cancelled: "Cancelled",
};

export const ARRANGEMENT_STATUS_TONE: Record<
  ArrangementStatus,
  "available" | "maintenance" | "out" | "neutral"
> = {
  draft: "neutral",
  active: "available",
  completed: "available",
  broken: "out",
  cancelled: "neutral",
};

// ---------------------------------------------------------------------------
// Installment statuses (derived from due date + linked actual payments)
// ---------------------------------------------------------------------------

export type InstallmentStatus =
  | "upcoming"
  | "due_today"
  | "partially_paid"
  | "paid"
  | "late"
  | "missed"
  | "cancelled";

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  upcoming: "Upcoming",
  due_today: "Due Today",
  partially_paid: "Partially Paid",
  paid: "Paid",
  late: "Late",
  missed: "Missed",
  cancelled: "Cancelled",
};

export const INSTALLMENT_STATUS_TONE: Record<
  InstallmentStatus,
  "available" | "maintenance" | "out" | "neutral"
> = {
  upcoming: "neutral",
  due_today: "maintenance",
  partially_paid: "maintenance",
  paid: "available",
  late: "out",
  missed: "out",
  cancelled: "neutral",
};

// ---------------------------------------------------------------------------
// Schedule generation frequency
// ---------------------------------------------------------------------------

export type ScheduleFrequency = "daily" | "weekly" | "biweekly" | "custom";

export const SCHEDULE_FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 Weeks",
  custom: "Custom",
};

// ---------------------------------------------------------------------------
// Arrangement timeline event (append-oriented audit trail)
// ---------------------------------------------------------------------------

export type ArrangementEventType =
  | "created"
  | "installment_due"
  | "payment_linked"
  | "partial_payment"
  | "installment_paid"
  | "missed_promise"
  | "broken"
  | "restructured"
  | "completed"
  | "cancelled"
  | "note";

export const ARRANGEMENT_EVENT_LABELS: Record<ArrangementEventType, string> = {
  created: "Arrangement created",
  installment_due: "Installment due",
  payment_linked: "Payment linked",
  partial_payment: "Partial payment",
  installment_paid: "Installment paid",
  missed_promise: "Missed promise",
  broken: "Arrangement broken",
  restructured: "Arrangement restructured",
  completed: "Arrangement completed",
  cancelled: "Arrangement cancelled",
  note: "Note added",
};

export interface ArrangementEvent {
  id: string;
  tenant_id: string;
  arrangement_id: string;
  type: ArrangementEventType;
  label: string;
  at: string;
  staff_id: string | null;
  amount?: number | null;
  installment_id?: string | null;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Installment — a single promised payment
// ---------------------------------------------------------------------------

/** A linked actual payment and how much of it was allocated to this installment. */
export interface LinkedPayment {
  transaction_id: string;
  amount: number; // how much of the payment was allocated to this installment
}

export interface PaymentArrangementInstallment {
  id: string;
  tenant_id: string;
  arrangement_id: string;
  sequence: number;
  amount_due: number;
  due_date: string; // ISO date (YYYY-MM-DD)
  // Linked actual ledger payments + the amount allocated to this installment.
  // amount_paid is DERIVED from these (sum of allocated amounts for non-reversed
  // payments) — never manually mutated.
  linked_payment_transaction_ids: string[];
  linked_payments: LinkedPayment[];
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Payment Arrangement — the customer's promise
// ---------------------------------------------------------------------------

export interface PaymentArrangement {
  id: string;
  tenant_id: string;
  arrangement_number: string; // e.g. PA-000123
  customer_id: string;
  rental_id: string | null;
  invoice_id: string | null;
  billing_period_ids: string[];
  // The outstanding balance at the time the arrangement was created (snapshot).
  original_outstanding_amount: number;
  // The amount placed on the arrangement (may be < original outstanding).
  arrangement_amount: number;
  status: ArrangementStatus;
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
