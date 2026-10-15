// Connect Pro Fleet — banking & reconciliation store (Build #15).
// Composes accounts, import, matching, transfers, expense-from-import, and
// statement reconciliation. The imported activity itself has ZERO effect on
// rental revenue or expense totals — only a confirmed match (reconciliation
// status only) or an explicit create-expense / record-payment action changes
// financial state. Split across bankingImport / bankingMatch / bankingReview
// to stay under the line limit.

import type { ReconciliationEvent, ReconciliationMatch } from "../bankingTypes";
import type { StoreState } from "./storeState";
import type { CreateExpenseRef } from "./bankingRef";
import { buildBankingImport } from "./bankingImport";
import { buildBankingMatch } from "./bankingMatch";
import { buildBankingReview } from "./bankingReview";

export function buildBankingMethods(
  s: StoreState,
  deps: { createExpense: CreateExpenseRef },
) {
  const imp = buildBankingImport(s);
  const match = buildBankingMatch(s, deps.createExpense);
  const review = buildBankingReview(s);

  return {
    // --- selectors ---------------------------------------------------------
    financialAccountById: (id: string) =>
      s.financialAccounts.find((a) => a.id === id),
    importedTransactionById: (id: string) =>
      s.importedTransactions.find((t) => t.id === id),
    statementById: (id: string) => s.statements.find((st) => st.id === id),
    importBatchById: (id: string) => s.importBatches.find((b) => b.id === id),
    matchesForImport: (importedId: string): ReconciliationMatch[] =>
      s.reconciliationMatches.filter(
        (m) => m.imported_transaction_id === importedId && !m.voided_at,
      ),
    reconciliationEventsFor: (importedId: string): ReconciliationEvent[] =>
      s.reconciliationEvents
        .filter((e) => e.imported_transaction_id === importedId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    reconciliationEventsForStatement: (
      statementId: string,
    ): ReconciliationEvent[] =>
      s.reconciliationEvents
        .filter((e) => e.statement_id === statementId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),

    // --- import -----------------------------------------------------------
    importCsv: imp.importCsv,
    rollbackImportBatch: imp.rollbackImportBatch,

    // --- matching ---------------------------------------------------------
    confirmMatch: match.confirmMatch,
    unmatch: match.unmatch,
    createExpenseFromImport: match.createExpenseFromImport,

    // --- review / transfer / accounts -------------------------------------
    ignoreTransaction: review.ignoreTransaction,
    markReviewed: review.markReviewed,
    markTransfer: review.markTransfer,
    reconcileStatement: review.reconcileStatement,
    createFinancialAccount: review.createFinancialAccount,
    updateFinancialAccount: review.updateFinancialAccount,
    deactivateFinancialAccount: review.deactivateFinancialAccount,
  };
}
