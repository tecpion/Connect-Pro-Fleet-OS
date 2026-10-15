// Connect Pro Fleet — Banking & Reconciliation domain types (Build #15).
//
// Imported financial activity (bank/card statements) is EVIDENCE of money
// movement, NOT automatically revenue or expense. It must be matched to an
// existing Fleet payment/expense, used to create a missing accounting
// transaction, marked as a transfer, or ignored — before it affects accounting
// totals. The rental ledger and expense ledger remain the sources of truth;
// reconciliation links imported activity to them without duplicating money.
//
// Every record is tenant-scoped (RLS-ready). No live bank connections, no
// Plaid, no credentials — CSV import only.

import type { TenderMethod, PaymentProcessor } from "./paymentMethodTypes";

// ---------------------------------------------------------------------------
// Financial accounts (bank checking/savings, credit card, debit, cash ref)
// ---------------------------------------------------------------------------

export type FinancialAccountType =
  | "bank_checking"
  | "bank_savings"
  | "credit_card"
  | "debit_account"
  | "cash_account"
  | "other";

export const FINANCIAL_ACCOUNT_TYPE_LABELS: Record<
  FinancialAccountType,
  string
> = {
  bank_checking: "Bank Checking",
  bank_savings: "Bank Savings",
  credit_card: "Credit Card",
  debit_account: "Debit Account",
  cash_account: "Cash Account",
  other: "Other",
};

export interface FinancialAccount {
  id: string;
  tenant_id: string;
  name: string;
  institution_name: string | null;
  account_type: FinancialAccountType;
  account_subtype: string | null;
  last_four: string | null;
  currency: string;
  opening_balance: number | null;
  active: boolean;
  source: "manual" | "bank_feed" | "api" | "connector";
  external_account_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Imported transactions
// ---------------------------------------------------------------------------

export type ImportDirection = "money_in" | "money_out";

export type ReviewStatus = "unreviewed" | "reviewed" | "ignored";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  unreviewed: "Unreviewed",
  reviewed: "Reviewed",
  ignored: "Ignored",
};

export type MatchStatus =
  "unmatched" | "suggested" | "matched" | "split_matched";

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  unmatched: "Unmatched",
  suggested: "Suggested",
  matched: "Matched",
  split_matched: "Split Matched",
};

export type TransferStatus = "none" | "transfer";

export interface ImportedTransaction {
  id: string;
  tenant_id: string;
  financial_account_id: string;
  statement_id: string | null;
  external_transaction_id: string | null;
  transaction_date: string; // YYYY-MM-DD
  posted_date: string | null;
  description: string;
  normalized_description: string | null;
  amount: number; // always positive; direction applies the sign
  direction: ImportDirection;
  currency: string;
  running_balance: number | null;
  merchant_name: string | null;
  transaction_type: string | null;
  reference: string | null;
  raw_data: Record<string, unknown> | null;
  import_batch_id: string;
  import_fingerprint: string;
  review_status: ReviewStatus;
  match_status: MatchStatus;
  transfer_status: TransferStatus;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export type StatementReconciliationStatus =
  "not_started" | "in_progress" | "reconciled" | "needs_attention";

export const STATEMENT_RECON_STATUS_LABELS: Record<
  StatementReconciliationStatus,
  string
> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  reconciled: "Reconciled",
  needs_attention: "Needs Attention",
};

export interface FinancialStatement {
  id: string;
  tenant_id: string;
  financial_account_id: string;
  statement_start_date: string;
  statement_end_date: string;
  opening_balance: number | null;
  closing_balance: number | null;
  source_file_name: string;
  import_batch_id: string;
  imported_at: string;
  imported_by_user_id: string | null;
  reconciliation_status: StatementReconciliationStatus;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Import batches
// ---------------------------------------------------------------------------

export interface ImportBatch {
  id: string;
  tenant_id: string;
  financial_account_id: string;
  source_file_name: string;
  source: "csv" | "bank_feed" | "api" | "connector";
  imported_at: string;
  imported_by_user_id: string | null;
  row_count: number;
  accepted_rows: number;
  duplicate_rows: number;
  error_rows: number;
  errors: { row: number; reason: string }[];
  hash: string;
}

// ---------------------------------------------------------------------------
// Reconciliation matches (one imported txn -> one or more Fleet txns)
// ---------------------------------------------------------------------------

export type ReconciliationTargetType =
  | "customer_payment"
  | "expense"
  | "reimbursement"
  | "petty_cash"
  | "transfer"
  | "damage_recovery"
  | "other";

export const RECON_TARGET_LABELS: Record<ReconciliationTargetType, string> = {
  customer_payment: "Customer Payment",
  expense: "Expense",
  reimbursement: "Reimbursement",
  petty_cash: "Petty Cash",
  transfer: "Transfer",
  damage_recovery: "Damage Recovery",
  other: "Other",
};

export type MatchMethod = "auto_exact" | "auto_suggested" | "manual";

export type MatchConfidence = "high" | "medium" | "low";

export interface ReconciliationMatch {
  id: string;
  tenant_id: string;
  imported_transaction_id: string;
  target_type: ReconciliationTargetType;
  target_id: string;
  allocated_amount: number;
  match_method: MatchMethod;
  confidence: MatchConfidence;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Account transfers (link two imported txns as counterparts)
// ---------------------------------------------------------------------------

export interface AccountTransfer {
  id: string;
  tenant_id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  date: string;
  imported_transaction_ids: string[];
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Reconciliation events (append-oriented audit)
// ---------------------------------------------------------------------------

export type ReconciliationEventType =
  | "imported"
  | "match_suggested"
  | "match_confirmed"
  | "match_removed"
  | "expense_created"
  | "transfer_marked"
  | "ignored"
  | "split_created"
  | "statement_reconciled";

export const RECON_EVENT_LABELS: Record<ReconciliationEventType, string> = {
  imported: "Imported",
  match_suggested: "Match Suggested",
  match_confirmed: "Match Confirmed",
  match_removed: "Match Removed",
  expense_created: "Expense Created",
  transfer_marked: "Transfer Marked",
  ignored: "Ignored",
  split_created: "Split Created",
  statement_reconciled: "Statement Reconciled",
};

export interface ReconciliationEvent {
  id: string;
  tenant_id: string;
  imported_transaction_id: string | null;
  statement_id: string | null;
  event_type: ReconciliationEventType;
  label: string;
  actor_user_id: string | null;
  actor_is_system: boolean;
  note: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// CSV import mapping (column -> field)
// ---------------------------------------------------------------------------

export type CsvFieldKey =
  | "date"
  | "description"
  | "amount"
  | "debit"
  | "credit"
  | "posted_date"
  | "merchant"
  | "running_balance"
  | "reference"
  | "external_id";

export const CSV_FIELD_OPTIONS: { key: CsvFieldKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "description", label: "Description" },
  { key: "amount", label: "Amount (signed)" },
  { key: "debit", label: "Debit" },
  { key: "credit", label: "Credit" },
  { key: "posted_date", label: "Posted Date" },
  { key: "merchant", label: "Merchant" },
  { key: "running_balance", label: "Running Balance" },
  { key: "reference", label: "Reference" },
  { key: "external_id", label: "External Transaction ID" },
];

export interface CsvColumnMapping {
  [csvHeader: string]: CsvFieldKey | "ignore";
}

// A parsed CSV row ready for validation/import.
export interface ParsedCsvRow {
  rowIndex: number;
  raw: Record<string, string>;
  date: string | null;
  description: string | null;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  postedDate: string | null;
  merchant: string | null;
  runningBalance: number | null;
  reference: string | null;
  externalId: string | null;
}

// Result of validating parsed rows before import.
export interface ImportValidationResult {
  totalRows: number;
  validRows: ParsedCsvRow[];
  invalidRows: { row: ParsedCsvRow; reason: string }[];
  potentialDuplicates: ParsedCsvRow[];
  dateRange: { start: string | null; end: string | null };
  totalIn: number;
  totalOut: number;
}

// Result of an import operation.
export interface ImportResult {
  batchId: string;
  statementId: string | null;
  accepted: number;
  duplicates: number;
  errors: number;
}

// Default tender inferred from an account type for create-expense-from-import.
export function defaultTenderForAccount(
  account: FinancialAccount,
): TenderMethod {
  if (account.account_type === "credit_card") return "credit_card";
  if (account.account_type === "debit_account") return "debit_card";
  return "bank_transfer";
}

export function defaultProcessorForAccount(
  account: FinancialAccount,
): PaymentProcessor | null {
  if (account.account_type === "credit_card") return "manual";
  return null;
}
