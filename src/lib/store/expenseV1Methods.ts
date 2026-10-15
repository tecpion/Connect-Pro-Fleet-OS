// Connect Pro Fleet — Expenses V1 mutation methods.
//
// Composes the existing expense ledger: category management (with delete-safe
// + archive), transaction rules, receipt inbox, recurring templates, spend
// alerts, and category budgets. These NEVER duplicate financial records —
// receipt matching links to the existing ExpenseReceipt, recurring generation
// creates ONE expense via the existing createExpense, and rule application
// only suggests/sets metadata on a new expense.

import type {
  ExpenseCategory,
  ExpenseRule,
  ExpenseTransaction,
  ReceiptInboxItem,
  RecurringExpense,
  SpendAlert,
  CategoryBudget,
} from "../expenseTypes";
import type { TenderMethod } from "../paymentMethodTypes";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";
import type { ExpenseShared } from "./expenseShared";

// Module-scoped memo of inbox items created this session, keyed by inbox id.
// `matchReceiptToExpense` and `createExpenseFromReceipt` need the file metadata
// for a just-added receipt, but within a single React render batch the
// closed-over `s.receiptInbox` snapshot is stale (the add hasn't flushed yet).
// This cache lets the match resolve deterministically without depending on
// state-flush timing — no financial data is duplicated, the authoritative
// ExpenseReceipt is still the single source of truth.
const recentReceiptInbox = new Map<string, ReceiptInboxItem>();
function rememberInbox(item: ReceiptInboxItem) {
  recentReceiptInbox.set(item.id, item);
}
function resolveInbox(
  s: StoreState,
  inboxId: string,
): ReceiptInboxItem | undefined {
  return (
    s.receiptInbox.find((i) => i.id === inboxId) ??
    recentReceiptInbox.get(inboxId)
  );
}

/** The authoritative expense-creation signature (from buildExpenseLifecycle).
 *  Injected so V1 methods reuse the single ledger path — no duplicate records. */
type CreateExpenseFn = (input: {
  description: string;
  amount: number;
  transaction_date: string;
  expense_category_id?: string | null;
  vendor_id?: string | null;
  payment_method: TenderMethod;
  vehicle_id?: string | null;
  receipt_required?: boolean;
  memo?: string | null;
}) => string;

export function buildExpenseV1Methods(
  s: StoreState,
  h: ExpenseShared,
  createExpense: CreateExpenseFn,
) {
  // --- Category management ---

  function addExpenseCategory(c: ExpenseCategory) {
    s.setExpenseCategories((cs) => [c, ...cs]);
  }

  function updateExpenseCategory(id: string, patch: Partial<ExpenseCategory>) {
    s.setExpenseCategories((cs) =>
      cs.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }

  function deactivateExpenseCategory(id: string) {
    s.setExpenseCategories((cs) =>
      cs.map((c) => (c.id === id ? { ...c, active: false } : c)),
    );
  }

  function reactivateExpenseCategory(id: string) {
    s.setExpenseCategories((cs) =>
      cs.map((c) => (c.id === id ? { ...c, active: true } : c)),
    );
  }

  function isCategoryUsed(categoryId: string): boolean {
    return s.expenses.some(
      (e) => e.expense_category_id === categoryId && e.status === "posted",
    );
  }

  function deleteExpenseCategoryIfUnused(id: string): boolean {
    if (isCategoryUsed(id)) return false;
    s.setExpenseCategories((cs) => cs.filter((c) => c.id !== id));
    return true;
  }

  function archiveExpenseCategory(id: string) {
    s.setExpenseCategories((cs) =>
      cs.map((c) => (c.id === id ? { ...c, active: false } : c)),
    );
  }

  // --- Transaction rules ---

  function addExpenseRule(rule: ExpenseRule) {
    s.setExpenseRules((rs) => [rule, ...rs]);
  }

  function updateExpenseRule(id: string, patch: Partial<ExpenseRule>) {
    s.setExpenseRules((rs) =>
      rs.map((r) =>
        r.id === id
          ? { ...r, ...patch, updated_at: new Date().toISOString() }
          : r,
      ),
    );
  }

  function deleteExpenseRule(id: string) {
    s.setExpenseRules((rs) => rs.filter((r) => r.id !== id));
  }

  function recordRuleApplied(ruleId: string) {
    s.setExpenseRules((rs) =>
      rs.map((r) =>
        r.id === ruleId
          ? {
              ...r,
              times_used: r.times_used + 1,
              last_matched_at: new Date().toISOString(),
            }
          : r,
      ),
    );
  }

  // --- Receipt inbox ---

  function addReceiptInboxItem(input: {
    file_name: string;
    file_url: string;
    mime_type?: string | null;
    amount?: number | null;
    merchant?: string | null;
    vehicle_id?: string | null;
    note?: string | null;
  }): string {
    const now = new Date().toISOString();
    const id = uid("rib");
    const item: ReceiptInboxItem = {
      id,
      tenant_id: TENANT_ID,
      file_name: input.file_name,
      file_url: input.file_url,
      mime_type: input.mime_type ?? null,
      amount: input.amount ?? null,
      merchant: input.merchant ?? null,
      vehicle_id: input.vehicle_id ?? null,
      captured_by: s.currentStaffId,
      captured_at: now,
      state: "unmatched",
      matched_expense_id: null,
      matched_imported_id: null,
      note: input.note ?? null,
      month_key: now.slice(0, 7),
    };
    s.setReceiptInbox((items) => [item, ...items]);
    rememberInbox(item);
    return id;
  }

  function setInboxState(inboxId: string, patch: Partial<ReceiptInboxItem>) {
    s.setReceiptInbox((items) =>
      items.map((i) => (i.id === inboxId ? { ...i, ...patch } : i)),
    );
  }

  function matchReceiptToExpense(inboxId: string, expenseId: string) {
    // Resolve the inbox item. Within a single React render batch the
    // closed-over `s.receiptInbox` snapshot is stale (a receipt just added in
    // the same batch hasn't flushed), so we also consult the session cache of
    // recently-added inbox items. The receipt file is attached to the expense
    // via the existing ledger path — single source of truth, no duplicate copy.
    const item = resolveInbox(s, inboxId);
    if (!item) return;
    const exp = s.expenses.find((e) => e.id === expenseId);
    if (exp) {
      s.setExpenseReceipts((rs) => [
        {
          id: uid("erct"),
          tenant_id: TENANT_ID,
          expense_id: expenseId,
          file_name: item.file_name,
          file_url: item.file_url,
          mime_type: item.mime_type,
          uploaded_by: s.currentStaffId,
          uploaded_at: new Date().toISOString(),
          note: item.note,
          voided_at: null,
        },
        ...rs,
      ]);
      s.setExpenses((es) =>
        es.map((e) =>
          e.id === expenseId
            ? {
                ...e,
                receipt_status: "attached",
                updated_at: new Date().toISOString(),
              }
            : e,
        ),
      );
    }
    setInboxState(inboxId, {
      state: "matched",
      matched_expense_id: expenseId,
      matched_imported_id: null,
    });
  }

  function matchReceiptToImported(inboxId: string, importedId: string) {
    setInboxState(inboxId, {
      state: "matched",
      matched_imported_id: importedId,
      matched_expense_id: null,
    });
  }

  function markReceiptInboxMissingInfo(inboxId: string) {
    setInboxState(inboxId, { state: "missing_info" });
  }

  function markReceiptInboxNeedsReview(inboxId: string) {
    setInboxState(inboxId, { state: "needs_review" });
  }

  function createExpenseFromReceipt(
    inboxId: string,
    input: {
      description: string;
      amount: number;
      transaction_date: string;
      expense_category_id?: string | null;
      vehicle_id?: string | null;
      payment_method: TenderMethod;
    },
  ): string {
    // Create the expense via the existing authoritative path (injected from
    // the lifecycle module) so there is a single ledger entry — no duplicate.
    const expenseId = createExpense({
      description: input.description,
      amount: input.amount,
      transaction_date: input.transaction_date,
      expense_category_id: input.expense_category_id ?? null,
      vehicle_id: input.vehicle_id ?? null,
      payment_method: input.payment_method,
      receipt_required: true,
    });
    // Attach the inbox receipt file directly. The expense was just created in
    // this same render batch, so the closed-over `s.expenses` snapshot is
    // stale — attach the receipt + flip the inbox state here instead of
    // rediscovering the expense via matchReceiptToExpense. Single source of
    // truth: one ExpenseReceipt row, no duplicate file copy.
    const item = resolveInbox(s, inboxId);
    if (item) {
      s.setExpenseReceipts((rs) => [
        {
          id: uid("erct"),
          tenant_id: TENANT_ID,
          expense_id: expenseId,
          file_name: item.file_name,
          file_url: item.file_url,
          mime_type: item.mime_type,
          uploaded_by: s.currentStaffId,
          uploaded_at: new Date().toISOString(),
          note: item.note,
          voided_at: null,
        },
        ...rs,
      ]);
      s.setExpenses((es) =>
        es.map((e) =>
          e.id === expenseId
            ? {
                ...e,
                receipt_status: "attached",
                updated_at: new Date().toISOString(),
              }
            : e,
        ),
      );
      setInboxState(inboxId, {
        state: "matched",
        matched_expense_id: expenseId,
        matched_imported_id: null,
      });
    }
    return expenseId;
  }

  // --- Recurring expenses ---

  function addRecurringExpense(r: RecurringExpense) {
    s.setRecurringExpenses((rs) => [r, ...rs]);
  }

  function updateRecurringExpense(
    id: string,
    patch: Partial<RecurringExpense>,
  ) {
    s.setRecurringExpenses((rs) =>
      rs.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function deleteRecurringExpense(id: string) {
    s.setRecurringExpenses((rs) => rs.filter((r) => r.id !== id));
  }

  function generateRecurringExpense(recurringId: string): string | null {
    const r = s.recurringExpenses.find((x) => x.id === recurringId);
    if (!r || !r.active) return null;
    const today = new Date().toISOString().slice(0, 10);
    const expenseId = createExpense({
      description: r.name,
      amount: r.amount,
      transaction_date: today,
      expense_category_id: r.category_id,
      vendor_id: r.vendor_id,
      payment_method: "ach",
      vehicle_id: r.vehicle_id,
      receipt_required: r.receipt_required,
      memo: `Generated from recurring template ${r.name}`,
    });
    s.setRecurringExpenses((rs) =>
      rs.map((x) =>
        x.id === recurringId
          ? { ...x, last_generated_at: new Date().toISOString() }
          : x,
      ),
    );
    return expenseId;
  }

  // --- Spend alerts + budgets ---

  function addSpendAlert(a: SpendAlert) {
    s.setSpendAlerts((as) => [a, ...as]);
  }

  function updateSpendAlert(id: string, patch: Partial<SpendAlert>) {
    s.setSpendAlerts((as) =>
      as.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }

  function deleteSpendAlert(id: string) {
    s.setSpendAlerts((as) => as.filter((a) => a.id !== id));
  }

  function setCategoryBudget(
    categoryId: string,
    monthKey: string,
    amount: number,
  ) {
    const existing = s.categoryBudgets.find(
      (b) => b.category_id === categoryId && b.month_key === monthKey,
    );
    if (existing) {
      s.setCategoryBudgets((bs) =>
        bs.map((b) =>
          b.id === existing.id ? { ...b, budget_amount: amount } : b,
        ),
      );
    } else {
      s.setCategoryBudgets((bs) => [
        {
          id: uid("cb"),
          tenant_id: TENANT_ID,
          category_id: categoryId,
          month_key: monthKey,
          budget_amount: amount,
          created_at: new Date().toISOString(),
        },
        ...bs,
      ]);
    }
  }

  return {
    addExpenseCategory,
    updateExpenseCategory,
    deactivateExpenseCategory,
    reactivateExpenseCategory,
    deleteExpenseCategoryIfUnused,
    archiveExpenseCategory,
    addExpenseRule,
    updateExpenseRule,
    deleteExpenseRule,
    recordRuleApplied,
    addReceiptInboxItem,
    matchReceiptToExpense,
    matchReceiptToImported,
    markReceiptInboxMissingInfo,
    markReceiptInboxNeedsReview,
    createExpenseFromReceipt,
    addRecurringExpense,
    updateRecurringExpense,
    deleteRecurringExpense,
    generateRecurringExpense,
    addSpendAlert,
    updateSpendAlert,
    deleteSpendAlert,
    setCategoryBudget,
  };
}
