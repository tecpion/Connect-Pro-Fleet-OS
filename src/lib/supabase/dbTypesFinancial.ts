// Connect Pro Fleet — typed Database row types: financial ledger + deposits
// + expenses + banking (Build #22).

import type { Json } from "./dbTypesCore";

export interface RentalLedgerTransactionRow {
  id: string;
  organization_id: string;
  rental_id: string;
  reservation_id: string | null;
  customer_id: string;
  vehicle_id: string | null;
  invoice_id: string | null;
  deposit_id: string | null;
  transaction_type: string;
  category: string;
  description: string;
  amount: number;
  direction: string;
  payment_method: string | null;
  tender_method: string | null;
  processor: string | null;
  payment_source: string | null;
  external_transaction_id: string | null;
  external_payment_id: string | null;
  integration_event_id: string | null;
  status: string;
  effective_date: string;
  related_transaction_id: string | null;
  billing_period: string | null;
  charge_group_id: string | null;
  metadata: Json | null;
  created_at: string;
  created_by: string | null;
  notes: string | null;
}

export interface PaymentAllocationRow {
  id: string;
  organization_id: string;
  payment_transaction_id: string;
  obligation_transaction_id: string | null;
  billing_period_id: string | null;
  amount: number;
  created_at: string;
}

export interface SecurityDepositRow {
  id: string;
  organization_id: string;
  reservation_id: string | null;
  rental_id: string | null;
  customer_id: string;
  vehicle_id: string | null;
  policy_id: string | null;
  required_amount: number;
  collected_amount: number;
  applied_amount: number;
  refunded_amount: number;
  forfeited_amount: number;
  status: string;
  currency: string;
  source_snapshot: Json | null;
  collected_at: string | null;
  refund_due_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DepositHistoryEventRow {
  id: string;
  organization_id: string;
  deposit_id: string;
  event_type: string;
  amount: number;
  payment_method: string | null;
  staff_id: string | null;
  related_transaction_id: string | null;
  reason: string | null;
  notes: string | null;
  request_key: string | null;
  created_at: string;
}

export interface ExpenseTransactionRow {
  id: string;
  organization_id: string;
  expense_number: string;
  transaction_date: string;
  entered_at: string;
  entered_by_user_id: string | null;
  description: string;
  memo: string | null;
  amount: number;
  currency: string;
  expense_category_id: string;
  expense_subcategory_id: string | null;
  vendor_id: string | null;
  payment_method: string | null;
  payment_source: string | null;
  paid_by_type: string;
  paid_by_user_id: string | null;
  reimbursement_status: string | null;
  location_id: string | null;
  vehicle_id: string | null;
  rental_id: string | null;
  maintenance_work_order_id: string | null;
  ownership_context: string | null;
  receipt_status: string;
  receipt_required: boolean;
  no_receipt_reason: string | null;
  status: string;
  reversal_of: string | null;
  source: string;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseLineItemRow {
  id: string;
  organization_id: string;
  expense_id: string;
  description: string;
  category_id: string;
  amount: number;
  vehicle_id: string | null;
  work_order_id: string | null;
  notes: string | null;
}

export interface ExpenseCategoryRow {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  parent_category_id: string | null;
  active: boolean;
  default_scope: string | null;
  created_at: string;
}

export interface ExpenseReceiptRow {
  id: string;
  organization_id: string;
  expense_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  amount: number | null;
  vendor_id: string | null;
  receipt_type: string;
  uploaded_by: string | null;
  uploaded_at: string;
  voided_at: string | null;
  note: string | null;
}

export interface ExpenseReimbursementRow {
  id: string;
  organization_id: string;
  expense_id: string;
  payee_type: string;
  payee_user_id: string | null;
  amount: number;
  status: string;
  requested_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  notes: string | null;
}

export interface CashAccountRow {
  id: string;
  organization_id: string;
  name: string;
  location_id: string | null;
  opening_balance: number;
  active: boolean;
  created_at: string;
}

export interface CashEntryRow {
  id: string;
  organization_id: string;
  cash_account_id: string;
  entry_type: string;
  amount: number;
  expense_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface FinancialAccountRow {
  id: string;
  organization_id: string;
  name: string;
  institution_name: string | null;
  account_type: string;
  account_subtype: string | null;
  last_four: string | null;
  currency: string;
  opening_balance: number | null;
  active: boolean;
  source: string | null;
  external_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportedTransactionRow {
  id: string;
  organization_id: string;
  financial_account_id: string;
  statement_id: string | null;
  external_transaction_id: string | null;
  transaction_date: string;
  posted_date: string | null;
  description: string;
  normalized_description: string | null;
  amount: number;
  direction: string;
  currency: string;
  running_balance: number | null;
  merchant_name: string | null;
  transaction_type: string | null;
  reference: string | null;
  raw_data: Json | null;
  import_batch_id: string;
  import_fingerprint: string;
  review_status: string;
  match_status: string;
  transfer_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialStatementRow {
  id: string;
  organization_id: string;
  financial_account_id: string;
  statement_start_date: string;
  statement_end_date: string;
  opening_balance: number | null;
  closing_balance: number | null;
  source_file_name: string | null;
  import_batch_id: string;
  imported_at: string;
  imported_by_user_id: string | null;
  reconciliation_status: string;
  notes: string | null;
}

export interface ImportBatchRow {
  id: string;
  organization_id: string;
  import_type: string;
  source_name: string;
  source_file_name: string | null;
  imported_by_user_id: string;
  imported_at: string;
  row_count: number;
  success_count: number;
  skipped_count: number;
  warning_count: number;
  error_count: number;
  rollback_status: string;
  metadata: Json | null;
}

export interface ReconciliationMatchRow {
  id: string;
  organization_id: string;
  imported_transaction_id: string;
  target_type: string;
  target_id: string;
  allocated_amount: number;
  match_method: string;
  confidence: string | null;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  notes: string | null;
}

export interface AccountTransferRow {
  id: string;
  organization_id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  date: string;
  imported_transaction_ids: Json | null;
  notes: string | null;
}

export interface ReconciliationEventRow {
  id: string;
  organization_id: string;
  event_type: string;
  entity_id: string | null;
  actor_user_id: string | null;
  note: string | null;
  created_at: string;
}
