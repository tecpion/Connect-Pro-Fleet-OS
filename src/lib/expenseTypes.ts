// Connect Pro Fleet — Accounting Expense Ledger domain types (Build #14).
//
// The Accounting Expense Ledger is SEPARATE from the Rental Financial Ledger.
// The rental ledger tracks customer money (charges, payments, deposits,
// credits, refunds). The expense ledger tracks business spending (vehicle
// expenses, company overhead, maintenance costs, cash purchases,
// reimbursements, petty cash). Both later feed profitability reports but
// never share a transaction record.
//
// A posted expense is never hard-deleted. Corrections use a reversal
// (opposite-signed) that references the original via `reversal_of`. Maintenance
// work-order costs generate linked ExpenseTransactions (idempotent) so bank
// reconciliation (Build #15) has a real transaction to match — and so
// maintenance cost is counted exactly ONCE across work-order totals, expense
// totals, and future P&L.

import type { TenderMethod, PaymentProcessor } from "./paymentMethodTypes";

export type ExpenseStatus = "posted" | "voided";

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  posted: "Posted",
  voided: "Voided",
};

/** Accounting scope — what the spend relates to. Never inferred from category. */
export type ExpenseScope =
  | "vehicle"
  | "company_overhead"
  | "maintenance_work_order"
  | "rental"
  | "mixed";

export const EXPENSE_SCOPE_LABELS: Record<ExpenseScope, string> = {
  vehicle: "Vehicle",
  company_overhead: "Company Overhead",
  maintenance_work_order: "Maintenance",
  rental: "Rental",
  mixed: "Mixed / Split",
};

/** Category type drives reporting buckets (vehicle-direct vs overhead). */
export type ExpenseCategoryType =
  "vehicle_direct" | "company_overhead" | "maintenance" | "other";

export const EXPENSE_CATEGORY_TYPE_LABELS: Record<ExpenseCategoryType, string> =
  {
    vehicle_direct: "Vehicle / Direct",
    company_overhead: "Company Overhead",
    maintenance: "Maintenance",
    other: "Other",
  };

export interface ExpenseCategory {
  id: string;
  tenant_id: string;
  name: string;
  type: ExpenseCategoryType;
  parent_category_id: string | null;
  active: boolean;
  created_at: string;
  /** Expenses V1 — category group for UI grouping (Vehicle / Overhead). Derived
   *  from `type` when absent so legacy seeded categories remain valid. */
  group?: ExpenseCategoryGroup;
  /** Default allocation scope suggested when categorizing with this category. */
  default_scope?: ExpenseScope | "any";
  /** Receipt requirement default for expenses using this category. */
  receipt_required_default?: "required" | "optional" | "not_required";
  /** Whether recurring expense templates may use this category. */
  recurring_allowed?: boolean;
  /** Whether multi-vehicle allocation is permitted for this category. */
  multi_vehicle_allowed?: boolean;
}

/** UI grouping for the category library. */
export type ExpenseCategoryGroup = "vehicle" | "overhead";

/** A split line inside an expense (one vendor receipt can contain parts +
 *  labor + tax, or span multiple vehicles). Line items must sum to the
 *  expense amount. */
export interface ExpenseLineItem {
  id: string;
  expense_id: string;
  description: string;
  category_id: string | null;
  amount: number;
  vehicle_id: string | null;
  work_order_id: string | null;
  notes: string | null;
}

export type PaidByType = "company" | "owner" | "employee" | "partner" | "other";

export const PAID_BY_LABELS: Record<PaidByType, string> = {
  company: "Company",
  owner: "Owner",
  employee: "Employee",
  partner: "Partner",
  other: "Other",
};

export type ReimbursementStatus =
  "not_required" | "owed" | "approved" | "paid" | "cancelled";

export const REIMBURSEMENT_STATUS_LABELS: Record<ReimbursementStatus, string> =
  {
    not_required: "Not Required",
    owed: "Owed",
    approved: "Approved",
    paid: "Paid",
    cancelled: "Cancelled",
  };

export interface ExpenseReimbursement {
  id: string;
  tenant_id: string;
  expense_id: string;
  payee_type: PaidByType;
  payee_user_id: string | null;
  amount: number;
  status: ReimbursementStatus;
  requested_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  payment_method: TenderMethod | null;
  notes: string | null;
  created_at: string;
}

export type ReceiptStatus = "attached" | "missing" | "not_required";

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  attached: "Attached",
  missing: "Missing",
  not_required: "Not Required",
};

export interface ExpenseReceipt {
  id: string;
  tenant_id: string;
  expense_id: string;
  file_name: string;
  file_url: string;
  mime_type: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  note: string | null;
  /** Voided receipts remain in history (never hard-deleted). */
  voided_at: string | null;
}

export type ExpenseEventType =
  | "created"
  | "receipt_added"
  | "receipt_voided"
  | "reimbursement_created"
  | "reimbursement_approved"
  | "reimbursement_paid"
  | "corrected"
  | "reversed"
  | "note_added";

export interface ExpenseEvent {
  id: string;
  tenant_id: string;
  expense_id: string;
  event_type: ExpenseEventType;
  label: string;
  actor_user_id: string | null;
  actor_is_system: boolean;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: string;
}

export type ExpenseSource =
  "manual" | "maintenance_work_order" | "csv_import" | "bank_feed" | "api";

export const EXPENSE_SOURCE_LABELS: Record<ExpenseSource, string> = {
  manual: "Manual",
  maintenance_work_order: "Maintenance Work Order",
  csv_import: "CSV Import",
  bank_feed: "Bank Feed",
  api: "API",
};

/** One business spending transaction. May be split across vehicles/overhead
 *  via line items. Reversals reference the original via `reversal_of`. */
export interface ExpenseTransaction {
  id: string;
  tenant_id: string;
  expense_number: string; // EXP-2026-000001
  transaction_date: string; // accounting period date (YYYY-MM-DD)
  entered_at: string; // audit metadata
  entered_by_user_id: string | null;
  description: string;
  memo: string | null;
  amount: number; // always positive; reversals carry reversal_of
  currency: string;
  expense_category_id: string | null;
  vendor_id: string | null;
  payment_method: TenderMethod;
  payment_source: string | null; // "Chase Ink ending 4821", "Petty Cash", etc.
  processor: PaymentProcessor | null;
  paid_by_type: PaidByType;
  paid_by_user_id: string | null;
  reimbursement_status: ReimbursementStatus;
  location_id: string | null;
  vehicle_id: string | null;
  rental_id: string | null;
  maintenance_work_order_id: string | null;
  receipt_status: ReceiptStatus;
  receipt_required: boolean;
  no_receipt_reason: string | null;
  status: ExpenseStatus;
  /** For a reversal expense: the id of the original expense it reverses. */
  reversal_of: string | null;
  source: ExpenseSource;
  /** Stable dedupe key for work-order-generated expenses (idempotent sync). */
  dedupe_key: string | null;
  /** Build #15 — id of the imported transaction this expense was reconciled to
   *  (set when created from a bank/card import, or when manually matched). */
  reconciled_imported_id?: string | null;
  /** Build #17 — arbitrary metadata (e.g. damage_claim_id for repair expenses). */
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Petty cash
// ---------------------------------------------------------------------------

export interface CashAccount {
  id: string;
  tenant_id: string;
  name: string;
  location_id: string | null;
  opening_balance: number;
  active: boolean;
  created_at: string;
}

export type CashEntryType = "cash_in" | "cash_out" | "adjustment";

export const CASH_ENTRY_TYPE_LABELS: Record<CashEntryType, string> = {
  cash_in: "Cash In",
  cash_out: "Cash Out",
  adjustment: "Adjustment",
};

export interface CashEntry {
  id: string;
  tenant_id: string;
  cash_account_id: string;
  entry_type: CashEntryType;
  amount: number; // positive; sign applied by entry_type
  expense_id: string | null; // links a cash_out to its ExpenseTransaction
  description: string;
  entered_by_user_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Expenses V1 — Transaction Rules
// ---------------------------------------------------------------------------

/** A rule match condition field. */
export type RuleConditionField =
  | "merchant_equals"
  | "merchant_contains"
  | "description_contains"
  | "amount_equals"
  | "amount_min"
  | "amount_max"
  | "account_id"
  | "transaction_type";

export type RuleConditionOp = "equals" | "contains" | "range" | "gte" | "lte";

export interface RuleCondition {
  field: RuleConditionField;
  op: RuleConditionOp;
  value: string | number;
}

/** What a rule sets when it matches. */
export interface RuleAction {
  category_id: string | null;
  scope: ExpenseScope | "any";
  vehicle_id: string | null;
  /** When true + scope=vehicle, the rule flags for manual vehicle selection
   *  rather than auto-assigning a single vehicle. */
  require_vehicle_selection: boolean;
  multi_vehicle_ids: string[] | null;
  allocation_method: "equal_split" | "custom" | null;
  receipt_required: "required" | "optional" | "not_required" | null;
  review_state: "needs_review" | "recorded" | null;
  notes: string | null;
}

export type RuleMode = "suggest" | "auto_apply";

export interface ExpenseRule {
  id: string;
  tenant_id: string;
  name: string;
  conditions: RuleCondition[];
  action: RuleAction;
  mode: RuleMode;
  active: boolean;
  times_used: number;
  last_matched_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A candidate transaction shape rules evaluate against (bank import or
 *  manual entry). Vendor/merchant are resolved by the caller. */
export interface RuleCandidate {
  merchant: string | null;
  description: string;
  amount: number;
  account_id: string | null;
  transaction_type: string | null;
}

export type RuleMatchResult =
  | { matched: false }
  | { matched: true; ruleId: string; mode: RuleMode; ambiguous: boolean };

// ---------------------------------------------------------------------------
// Expenses V1 — Receipt Inbox (unmatched receipts awaiting linkage)
// ---------------------------------------------------------------------------

export type ReceiptInboxState =
  "unmatched" | "matched" | "missing_info" | "needs_review" | "attached";

export const RECEIPT_INBOX_STATE_LABELS: Record<ReceiptInboxState, string> = {
  unmatched: "Unmatched",
  matched: "Matched",
  missing_info: "Missing Info",
  needs_review: "Needs Review",
  attached: "Attached",
};

/** A receipt captured before its owning expense/transaction is known. Lives in
 *  the Receipt Inbox until matched. Once matched it links to an expense (the
 *  ExpenseReceipt record remains the single source of truth — the inbox item
 *  references it, no duplicate file copy). */
export interface ReceiptInboxItem {
  id: string;
  tenant_id: string;
  file_name: string;
  file_url: string;
  mime_type: string | null;
  amount: number | null;
  merchant: string | null;
  vehicle_id: string | null;
  captured_by: string | null;
  captured_at: string;
  state: ReceiptInboxState;
  matched_expense_id: string | null;
  matched_imported_id: string | null;
  note: string | null;
  /** Month bucket key (YYYY-MM) derived from captured_at for grouping. */
  month_key: string;
}

// ---------------------------------------------------------------------------
// Expenses V1 — Recurring expense templates
// ---------------------------------------------------------------------------

export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export interface RecurringExpense {
  id: string;
  tenant_id: string;
  name: string;
  amount: number;
  vendor_id: string | null;
  category_id: string | null;
  scope: ExpenseScope;
  vehicle_id: string | null;
  vehicle_ids: string[] | null;
  allocation_method: "equal_split" | "custom" | null;
  frequency: RecurringFrequency;
  start_date: string;
  end_date: string | null;
  receipt_required: boolean;
  auto_create: boolean;
  active: boolean;
  last_generated_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Expenses V1 — Review / approval state (separate from posted/voided status)
// ---------------------------------------------------------------------------

export type ExpenseReviewState =
  "draft" | "recorded" | "needs_review" | "approved" | "reversed";

export const EXPENSE_REVIEW_LABELS: Record<ExpenseReviewState, string> = {
  draft: "Draft",
  recorded: "Recorded",
  needs_review: "Needs Review",
  approved: "Approved",
  reversed: "Reversed",
};

// ---------------------------------------------------------------------------
// Expenses V1 — Spend alerts + category budgets
// ---------------------------------------------------------------------------

export interface SpendAlert {
  id: string;
  tenant_id: string;
  name: string;
  /** Metric the threshold applies to. */
  metric:
    | "single_expense"
    | "maintenance_expense"
    | "vehicle_expense"
    | "category_spend";
  threshold: number;
  category_id: string | null;
  active: boolean;
  created_at: string;
}

export interface CategoryBudget {
  id: string;
  tenant_id: string;
  category_id: string;
  month_key: string; // YYYY-MM
  budget_amount: number;
  created_at: string;
}
