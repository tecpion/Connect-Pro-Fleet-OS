// Connect Pro Fleet — expense store (Build #14).
// Composes the lifecycle + aux methods into the ExpenseMethods interface.
// Split across expenseShared / expenseLifecycle / expenseAux / expenseV1Methods
// to stay under the line limit. The public API matches ExpenseMethods.

import type { StoreState } from "./storeState";
import { buildExpenseShared } from "./expenseShared";
import { buildExpenseLifecycle } from "./expenseLifecycle";
import { buildExpenseAux } from "./expenseAux";
import { buildExpenseV1Methods } from "./expenseV1Methods";
import {
  expenseEventsFor,
  activeReceiptsFor,
  allReceiptsFor,
  lineItemsFor,
  reimbursementFor,
} from "../expenseSelectors";

export function buildExpenseMethods(s: StoreState) {
  const shared = buildExpenseShared(s);
  const lifecycle = buildExpenseLifecycle(s, shared);
  const aux = buildExpenseAux(s, shared);
  // Pass the authoritative lifecycle createExpense into the V1 methods so
  // receipt→expense creation and recurring generation reuse the single
  // authoritative path (no duplicate financial records). The raw StoreState
  // has no createExpense, so it must be injected explicitly.
  const v1 = buildExpenseV1Methods(s, shared, lifecycle.createExpense);

  return {
    // --- selectors ----------------------------------------------------------
    expenseById: (id: string) => s.expenses.find((e) => e.id === id),
    expenseEventsFor: (expenseId: string) =>
      expenseEventsFor(s.expenseEvents, expenseId),
    expenseReceiptsFor: (expenseId: string) =>
      activeReceiptsFor(s.expenseReceipts, expenseId),
    allExpenseReceiptsFor: (expenseId: string) =>
      allReceiptsFor(s.expenseReceipts, expenseId),
    expenseLineItemsFor: (expenseId: string) =>
      lineItemsFor(s.expenseLineItems, expenseId),
    expenseReimbursement: (expenseId: string) =>
      reimbursementFor(s.expenseReimbursements, expenseId),
    categoryById: (id: string) => s.expenseCategories.find((c) => c.id === id),
    cashAccountById: (id: string) => s.cashAccounts.find((c) => c.id === id),
    cashAccountEntries: (accountId: string) =>
      s.cashEntries
        .filter((e) => e.cash_account_id === accountId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),

    // --- lifecycle ---------------------------------------------------------
    createExpense: lifecycle.createExpense,
    updateExpenseMetadata: lifecycle.updateExpenseMetadata,
    reverseExpense: lifecycle.reverseExpense,
    approveReimbursement: lifecycle.approveReimbursement,
    markReimbursementPaid: lifecycle.markReimbursementPaid,
    cancelReimbursement: lifecycle.cancelReimbursement,

    // --- aux ---------------------------------------------------------------
    addExpenseReceipt: aux.addExpenseReceipt,
    voidExpenseReceipt: aux.voidExpenseReceipt,
    addExpenseNote: aux.addExpenseNote,
    addExpenseCategory: aux.addExpenseCategory,
    updateExpenseCategory: aux.updateExpenseCategory,
    deactivateExpenseCategory: aux.deactivateExpenseCategory,
    createCashAccount: aux.createCashAccount,
    recordCashIn: aux.recordCashIn,
    recordCashAdjustment: aux.recordCashAdjustment,
    syncWorkOrderExpense: aux.syncWorkOrderExpense,
    tagExpenseMetadata: aux.tagExpenseMetadata,

    // --- Expenses V1 -------------------------------------------------------
    reactivateExpenseCategory: v1.reactivateExpenseCategory,
    deleteExpenseCategoryIfUnused: v1.deleteExpenseCategoryIfUnused,
    archiveExpenseCategory: v1.archiveExpenseCategory,
    addExpenseRule: v1.addExpenseRule,
    updateExpenseRule: v1.updateExpenseRule,
    deleteExpenseRule: v1.deleteExpenseRule,
    recordRuleApplied: v1.recordRuleApplied,
    addReceiptInboxItem: v1.addReceiptInboxItem,
    matchReceiptToExpense: v1.matchReceiptToExpense,
    matchReceiptToImported: v1.matchReceiptToImported,
    markReceiptInboxMissingInfo: v1.markReceiptInboxMissingInfo,
    markReceiptInboxNeedsReview: v1.markReceiptInboxNeedsReview,
    createExpenseFromReceipt: v1.createExpenseFromReceipt,
    addRecurringExpense: v1.addRecurringExpense,
    updateRecurringExpense: v1.updateRecurringExpense,
    deleteRecurringExpense: v1.deleteRecurringExpense,
    generateRecurringExpense: v1.generateRecurringExpense,
    addSpendAlert: v1.addSpendAlert,
    updateSpendAlert: v1.updateSpendAlert,
    deleteSpendAlert: v1.deleteSpendAlert,
    setCategoryBudget: v1.setCategoryBudget,
  };
}
