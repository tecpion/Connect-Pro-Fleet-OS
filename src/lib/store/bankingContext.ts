// Connect Pro Fleet — BankingMethods interface (Build #15).
// Extracted from storeContext to keep it under the line limit.

import type {
  AccountTransfer,
  FinancialAccount,
  FinancialStatement,
  ImportBatch,
  ImportedTransaction,
  ReconciliationEvent,
  ReconciliationMatch,
  ReconciliationTargetType,
} from "../bankingTypes";
import type { CsvColumnMapping } from "../bankingTypes";

export interface BankingMethods {
  // state arrays (read-only on the public API)
  financialAccounts: import("../bankingTypes").FinancialAccount[];
  importedTransactions: import("../bankingTypes").ImportedTransaction[];
  statements: import("../bankingTypes").FinancialStatement[];
  importBatches: import("../bankingTypes").ImportBatch[];
  reconciliationMatches: import("../bankingTypes").ReconciliationMatch[];
  accountTransfers: import("../bankingTypes").AccountTransfer[];
  reconciliationEvents: import("../bankingTypes").ReconciliationEvent[];
  // selectors
  financialAccountById: (id: string) => FinancialAccount | undefined;
  importedTransactionById: (id: string) => ImportedTransaction | undefined;
  statementById: (id: string) => FinancialStatement | undefined;
  importBatchById: (id: string) => ImportBatch | undefined;
  matchesForImport: (importedId: string) => ReconciliationMatch[];
  reconciliationEventsFor: (importedId: string) => ReconciliationEvent[];
  reconciliationEventsForStatement: (
    statementId: string,
  ) => ReconciliationEvent[];

  // accounts
  createFinancialAccount: (input: {
    name: string;
    account_type: FinancialAccount["account_type"];
    institution_name?: string | null;
    last_four?: string | null;
    opening_balance?: number | null;
  }) => string;
  updateFinancialAccount: (
    id: string,
    patch: Partial<FinancialAccount>,
  ) => void;
  deactivateFinancialAccount: (id: string) => void;

  // import
  importCsv: (input: {
    accountId: string;
    csvText: string;
    mapping: CsvColumnMapping;
    fileName: string;
    openingBalance?: number | null;
    closingBalance?: number | null;
  }) => {
    batchId: string;
    statementId: string | null;
    accepted: number;
    duplicates: number;
    errors: number;
  };

  // review actions
  confirmMatch: (input: {
    importedTransactionId: string;
    target_type: ReconciliationTargetType;
    target_id: string;
    allocated_amount: number;
    notes?: string | null;
  }) => string | null;
  unmatch: (matchId: string, reason?: string) => void;
  ignoreTransaction: (importedTransactionId: string, reason?: string) => void;
  markTransfer: (input: {
    importedTransactionId: string;
    counterpartAccountId: string;
    counterpartImportedId?: string | null;
    notes?: string | null;
  }) => string | null;
  markReviewed: (importedTransactionId: string) => void;

  // create expense from import
  createExpenseFromImport: (input: {
    importedTransactionId: string;
    description: string;
    expense_category_id: string | null;
    vehicle_id?: string | null;
    maintenance_work_order_id?: string | null;
    paid_by_type?: "company" | "owner" | "employee" | "partner" | "other";
    receipt_required?: boolean;
    memo?: string | null;
  }) => string | null;

  // statement reconciliation
  reconcileStatement: (statementId: string) => void;

  // rollback
  rollbackImportBatch: (batchId: string) => boolean;
}
