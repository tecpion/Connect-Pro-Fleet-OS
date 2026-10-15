// Connect Pro Fleet — ExpenseMethods interface (Build #14).
// Extracted from storeContext to keep it under the line limit.

import type {
  CashAccount,
  CashEntry,
  ExpenseCategory,
  ExpenseEvent,
  ExpenseLineItem,
  ExpenseReceipt,
  ExpenseReimbursement,
  ExpenseRule,
  ExpenseTransaction,
  PaidByType,
  ReceiptInboxItem,
  RecurringExpense,
  ReimbursementStatus,
  SpendAlert,
  CategoryBudget,
} from "../expenseTypes";
import type { TenderMethod, PaymentProcessor } from "../paymentMethodTypes";

export interface ExpenseMethods {
  // selectors
  expenseById: (id: string) => ExpenseTransaction | undefined;
  expenseEventsFor: (expenseId: string) => ExpenseEvent[];
  expenseReceiptsFor: (expenseId: string) => ExpenseReceipt[];
  allExpenseReceiptsFor: (expenseId: string) => ExpenseReceipt[];
  expenseLineItemsFor: (expenseId: string) => ExpenseLineItem[];
  expenseReimbursement: (expenseId: string) => ExpenseReimbursement | undefined;
  categoryById: (id: string) => ExpenseCategory | undefined;
  cashAccountById: (id: string) => CashAccount | undefined;
  cashAccountEntries: (accountId: string) => CashEntry[];

  // lifecycle
  createExpense: (input: {
    description: string;
    amount: number;
    transaction_date: string;
    expense_category_id?: string | null;
    vendor_id?: string | null;
    payment_method: TenderMethod;
    payment_source?: string | null;
    processor?: PaymentProcessor | null;
    paid_by_type?: PaidByType;
    paid_by_user_id?: string | null;
    location_id?: string | null;
    vehicle_id?: string | null;
    rental_id?: string | null;
    maintenance_work_order_id?: string | null;
    receipt_required?: boolean;
    no_receipt_reason?: string | null;
    memo?: string | null;
    line_items?: Omit<ExpenseLineItem, "id" | "expense_id">[];
    create_reimbursement?: boolean;
    cash_account_id?: string | null;
  }) => string;
  updateExpenseMetadata: (
    id: string,
    patch: Partial<
      Pick<
        ExpenseTransaction,
        | "description"
        | "memo"
        | "vendor_id"
        | "location_id"
        | "no_receipt_reason"
      >
    >,
  ) => void;
  reverseExpense: (id: string, reason: string) => string | null;
  addExpenseReceipt: (input: {
    expense_id: string;
    file_name: string;
    file_url: string;
    mime_type?: string | null;
    note?: string | null;
  }) => string;
  voidExpenseReceipt: (receiptId: string, reason?: string) => void;
  addExpenseNote: (expenseId: string, text: string) => void;

  // reimbursements
  approveReimbursement: (reimbursementId: string) => void;
  markReimbursementPaid: (
    reimbursementId: string,
    method: TenderMethod,
  ) => void;
  cancelReimbursement: (reimbursementId: string, reason?: string) => void;

  // categories
  addExpenseCategory: (c: ExpenseCategory) => void;
  updateExpenseCategory: (id: string, patch: Partial<ExpenseCategory>) => void;
  deactivateExpenseCategory: (id: string) => void;
  reactivateExpenseCategory: (id: string) => void;
  /** Permanently delete a category ONLY if it has never been used by an
   *  expense. Returns true if deleted; false if it must be archived instead. */
  deleteExpenseCategoryIfUnused: (id: string) => boolean;
  /** Archive (deactivate) a category that is already in use. */
  archiveExpenseCategory: (id: string) => void;

  // Expenses V1 — transaction rules
  addExpenseRule: (rule: ExpenseRule) => void;
  updateExpenseRule: (id: string, patch: Partial<ExpenseRule>) => void;
  deleteExpenseRule: (id: string) => void;
  /** Record that a rule was applied (increments times_used + last_matched_at).
   *  Does NOT change previously categorized transactions. */
  recordRuleApplied: (ruleId: string) => void;

  // Expenses V1 — receipt inbox
  addReceiptInboxItem: (input: {
    file_name: string;
    file_url: string;
    mime_type?: string | null;
    amount?: number | null;
    merchant?: string | null;
    vehicle_id?: string | null;
    note?: string | null;
  }) => string;
  matchReceiptToExpense: (inboxId: string, expenseId: string) => void;
  matchReceiptToImported: (inboxId: string, importedId: string) => void;
  markReceiptInboxMissingInfo: (inboxId: string) => void;
  markReceiptInboxNeedsReview: (inboxId: string) => void;
  createExpenseFromReceipt: (
    inboxId: string,
    input: {
      description: string;
      amount: number;
      transaction_date: string;
      expense_category_id?: string | null;
      vehicle_id?: string | null;
      payment_method: TenderMethod;
    },
  ) => string;

  // Expenses V1 — recurring expenses
  addRecurringExpense: (r: RecurringExpense) => void;
  updateRecurringExpense: (
    id: string,
    patch: Partial<RecurringExpense>,
  ) => void;
  deleteRecurringExpense: (id: string) => void;
  /** Generate a one-off expense from a recurring template (review-first; does
   *  not auto-create unless the template's auto_create is true). Updates
   *  last_generated_at so the next occurrence is computed correctly. */
  generateRecurringExpense: (recurringId: string) => string | null;

  // Expenses V1 — spend alerts + budgets
  addSpendAlert: (a: SpendAlert) => void;
  updateSpendAlert: (id: string, patch: Partial<SpendAlert>) => void;
  deleteSpendAlert: (id: string) => void;
  setCategoryBudget: (
    categoryId: string,
    monthKey: string,
    amount: number,
  ) => void;

  // petty cash
  createCashAccount: (input: {
    name: string;
    location_id?: string | null;
    opening_balance?: number;
  }) => string;
  recordCashIn: (input: {
    cash_account_id: string;
    amount: number;
    description: string;
  }) => void;
  recordCashAdjustment: (input: {
    cash_account_id: string;
    amount: number;
    description: string;
  }) => void;

  // maintenance sync — idempotent generation of work-order expenses. The
  // optional completedWo override lets completeWorkOrder pass the merged
  // completed work order so the sync doesn't read stale s.workOrders state
  // inside the same batched act().
  syncWorkOrderExpense: (
    workOrderId: string,
    completedWo?: import("../maintenanceTypes").MaintenanceWorkOrder,
  ) => string | null;

  /** Merge metadata into a posted expense (e.g. tag a repair expense with
   *  damage_claim_id). Non-destructive: existing keys are preserved. */
  tagExpenseMetadata: (
    expenseId: string,
    meta: Record<string, unknown>,
  ) => void;
}
