// Connect Pro Fleet — banking review/transfer/accounts store (Build #15).
// Ignore, mark reviewed, mark transfer, statement reconciliation, and account
// CRUD. Split from bankingStore to stay under the line limit.

import type { AccountTransfer, FinancialAccount } from "../bankingTypes";
import type { StoreState } from "./storeState";
import { TENANT_ID, uid } from "./ids";
import { logReconEvent } from "./bankingShared";
import {
  persistAccountTransferInsert,
  persistFinancialAccountInsert,
} from "../supabase/phase5StoreSync";

export function buildBankingReview(s: StoreState) {
  function ignoreTransaction(importedTransactionId: string, reason?: string) {
    s.setImportedTransactions((t) =>
      t.map((x) =>
        x.id === importedTransactionId ? { ...x, review_status: "ignored" } : x,
      ),
    );
    logReconEvent(s, {
      imported_transaction_id: importedTransactionId,
      event_type: "ignored",
      label: `Ignored${reason ? ` — ${reason}` : ""}`,
    });
  }

  function markReviewed(importedTransactionId: string) {
    s.setImportedTransactions((t) =>
      t.map((x) =>
        x.id === importedTransactionId
          ? { ...x, review_status: "reviewed" }
          : x,
      ),
    );
  }

  function markTransfer(input: {
    importedTransactionId: string;
    counterpartAccountId: string;
    counterpartImportedId?: string | null;
    notes?: string | null;
  }): string | null {
    const imp = s.importedTransactions.find(
      (t) => t.id === input.importedTransactionId,
    );
    if (!imp) return null;
    const transferId = uid("xfer");
    const transfer: AccountTransfer = {
      id: transferId,
      tenant_id: TENANT_ID,
      from_account_id:
        imp.direction === "money_out"
          ? imp.financial_account_id
          : input.counterpartAccountId,
      to_account_id:
        imp.direction === "money_in"
          ? imp.financial_account_id
          : input.counterpartAccountId,
      amount: imp.amount,
      date: imp.transaction_date,
      imported_transaction_ids: input.counterpartImportedId
        ? [imp.id, input.counterpartImportedId]
        : [imp.id],
      notes: input.notes ?? null,
      created_by: s.currentStaffId,
      created_at: new Date().toISOString(),
    };
    s.setAccountTransfers((tr) => [transfer, ...tr]);
    persistAccountTransferInsert(transfer);
    const ids = input.counterpartImportedId
      ? [imp.id, input.counterpartImportedId]
      : [imp.id];
    s.setImportedTransactions((t) =>
      t.map((x) =>
        ids.includes(x.id)
          ? {
              ...x,
              transfer_status: "transfer",
              review_status: "reviewed",
              match_status: "unmatched",
            }
          : x,
      ),
    );
    logReconEvent(s, {
      imported_transaction_id: imp.id,
      event_type: "transfer_marked",
      label: `Marked as transfer between accounts`,
      note: input.notes ?? null,
    });
    return transferId;
  }

  function reconcileStatement(statementId: string) {
    const stmt = s.statements.find((st) => st.id === statementId);
    if (!stmt) return;
    s.setStatements((st) =>
      st.map((x) =>
        x.id === statementId
          ? { ...x, reconciliation_status: "reconciled" }
          : x,
      ),
    );
    logReconEvent(s, {
      statement_id: statementId,
      event_type: "statement_reconciled",
      label: `Statement reconciled`,
    });
  }

  // --- accounts -----------------------------------------------------------
  function createFinancialAccount(input: {
    name: string;
    account_type: FinancialAccount["account_type"];
    institution_name?: string | null;
    last_four?: string | null;
    opening_balance?: number | null;
  }): string {
    const now = new Date().toISOString();
    const id = uid("fac");
    const account: FinancialAccount = {
      id,
      tenant_id: TENANT_ID,
      name: input.name,
      institution_name: input.institution_name ?? null,
      account_type: input.account_type,
      account_subtype: null,
      last_four: input.last_four ?? null,
      currency: "USD",
      opening_balance: input.opening_balance ?? null,
      active: true,
      source: "manual",
      external_account_id: null,
      created_at: now,
      updated_at: now,
    };
    s.setFinancialAccounts((a) => [account, ...a]);
    persistFinancialAccountInsert(account);
    return id;
  }
  function updateFinancialAccount(
    id: string,
    patch: Partial<FinancialAccount>,
  ) {
    s.setFinancialAccounts((a) =>
      a.map((x) =>
        x.id === id
          ? { ...x, ...patch, updated_at: new Date().toISOString() }
          : x,
      ),
    );
  }
  function deactivateFinancialAccount(id: string) {
    s.setFinancialAccounts((a) =>
      a.map((x) => (x.id === id ? { ...x, active: false } : x)),
    );
  }

  return {
    ignoreTransaction,
    markReviewed,
    markTransfer,
    reconcileStatement,
    createFinancialAccount,
    updateFinancialAccount,
    deactivateFinancialAccount,
  };
}
