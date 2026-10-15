// Connect Pro Fleet — banking match engine store (Build #15).
// Suggestion generation, auto-confirm (exact ID only), manual confirm,
// unmatch (void-safe), and create-expense-from-import. Matching changes
// reconciliation status ONLY — never creates new revenue or expenses. Split
// from bankingStore to stay under the line limit.

import type {
  ImportedTransaction,
  ReconciliationMatch,
  ReconciliationTargetType,
} from "../bankingTypes";
import type { StoreState } from "./storeState";
import type { CreateExpenseRef } from "./bankingRef";
import { TENANT_ID, uid } from "./ids";
import {
  suggestPaymentMatches,
  suggestExpenseMatches,
  isAutoMatchable,
} from "../reconciliationRules";
import {
  logReconEvent,
  defaultTenderForAccount,
  defaultProcessorForAccount,
} from "./bankingShared";

/** Run suggestions for a single imported transaction (auto-confirm exact ID). */
export function runSuggestionsFor(s: StoreState, txn: ImportedTransaction) {
  if (txn.review_status === "ignored" || txn.transfer_status === "transfer")
    return;
  const customerName = (id: string) => {
    const c = s.customers.find((x) => x.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "—";
  };
  const vendorName = (id: string | null) => {
    if (!id) return "";
    const v = s.maintenanceVendors.find((x) => x.id === id);
    return v ? v.name : "";
  };
  const candidates =
    txn.direction === "money_in"
      ? suggestPaymentMatches(txn, s.transactions, customerName)
      : suggestExpenseMatches(txn, s.expenses, vendorName);
  if (candidates.length === 0) return;
  const best = candidates[0];
  if (isAutoMatchable(best)) {
    doConfirmMatch(s, {
      importedTransactionId: txn.id,
      target_type: best.target_type,
      target_id: best.target_id,
      allocated_amount: best.allocated_amount,
      method: "auto_exact",
      confidence: best.confidence,
    });
  } else {
    s.setImportedTransactions((t) =>
      t.map((x) => (x.id === txn.id ? { ...x, match_status: "suggested" } : x)),
    );
    logReconEvent(s, {
      imported_transaction_id: txn.id,
      event_type: "match_suggested",
      label: `Suggested match: ${best.label}`,
      actorIsSystem: true,
    });
  }
}

function doConfirmMatch(
  s: StoreState,
  input: {
    importedTransactionId: string;
    target_type: ReconciliationTargetType;
    target_id: string;
    allocated_amount: number;
    method: "auto_exact" | "auto_suggested" | "manual";
    confidence: "high" | "medium" | "low";
    notes?: string | null;
  },
): string {
  const imp = s.importedTransactions.find(
    (t) => t.id === input.importedTransactionId,
  );
  if (!imp) return "";
  const already = s.reconciliationMatches
    .filter(
      (m) =>
        m.imported_transaction_id === input.importedTransactionId &&
        !m.voided_at,
    )
    .reduce((sum, m) => sum + m.allocated_amount, 0);
  const remaining = imp.amount - already;
  if (input.allocated_amount > remaining + 0.005) return "";
  const match: ReconciliationMatch = {
    id: uid("rmatch"),
    tenant_id: TENANT_ID,
    imported_transaction_id: input.importedTransactionId,
    target_type: input.target_type,
    target_id: input.target_id,
    allocated_amount: input.allocated_amount,
    match_method: input.method,
    confidence: input.confidence,
    created_by: input.method === "auto_exact" ? null : s.currentStaffId,
    created_at: new Date().toISOString(),
    voided_at: null,
    notes: input.notes ?? null,
  };
  s.setReconciliationMatches((m) => [match, ...m]);
  const newAllocated = already + input.allocated_amount;
  const fullyMatched = newAllocated >= imp.amount - 0.005;
  s.setImportedTransactions((t) =>
    t.map((x) =>
      x.id === input.importedTransactionId
        ? {
            ...x,
            match_status: fullyMatched ? "matched" : "split_matched",
            review_status: fullyMatched ? "reviewed" : x.review_status,
          }
        : x,
    ),
  );
  // Tag the matched Fleet transaction so it isn't matched again.
  if (input.target_type === "customer_payment") {
    s.setTransactions((ts) =>
      ts.map((t) =>
        t.id === input.target_id
          ? {
              ...t,
              metadata: {
                ...(t.metadata ?? {}),
                reconciled_imported_id: input.importedTransactionId,
              },
            }
          : t,
      ),
    );
  } else if (input.target_type === "expense") {
    s.setExpenses((es) =>
      es.map((e) =>
        e.id === input.target_id
          ? { ...e, reconciled_imported_id: input.importedTransactionId }
          : e,
      ),
    );
  }
  logReconEvent(s, {
    imported_transaction_id: input.importedTransactionId,
    event_type: "match_confirmed",
    label: `Matched to ${input.target_type} (${input.confidence})`,
    note: input.notes ?? null,
  });
  return match.id;
}

export function buildBankingMatch(
  s: StoreState,
  createExpense: CreateExpenseRef,
) {
  function confirmMatch(input: {
    importedTransactionId: string;
    target_type: ReconciliationTargetType;
    target_id: string;
    allocated_amount: number;
    notes?: string | null;
  }): string | null {
    return (
      doConfirmMatch(s, {
        ...input,
        method: "manual",
        confidence: "high",
      }) || null
    );
  }

  function unmatch(matchId: string, reason?: string) {
    const match = s.reconciliationMatches.find((m) => m.id === matchId);
    if (!match || match.voided_at) return;
    s.setReconciliationMatches((m) =>
      m.map((x) =>
        x.id === matchId ? { ...x, voided_at: new Date().toISOString() } : x,
      ),
    );
    const imp = s.importedTransactions.find(
      (t) => t.id === match.imported_transaction_id,
    );
    if (imp) {
      const remaining = s.reconciliationMatches
        .filter(
          (m) =>
            m.imported_transaction_id === imp.id &&
            !m.voided_at &&
            m.id !== matchId,
        )
        .reduce((sum, m) => sum + m.allocated_amount, 0);
      s.setImportedTransactions((t) =>
        t.map((x) =>
          x.id === imp.id
            ? {
                ...x,
                match_status:
                  remaining >= imp.amount - 0.005 ? "matched" : "unmatched",
                review_status:
                  remaining >= imp.amount - 0.005 ? "reviewed" : "unreviewed",
              }
            : x,
        ),
      );
    }
    if (match.target_type === "customer_payment") {
      s.setTransactions((ts) =>
        ts.map((t) =>
          t.id === match.target_id
            ? {
                ...t,
                metadata: {
                  ...(t.metadata ?? {}),
                  reconciled_imported_id: undefined,
                },
              }
            : t,
        ),
      );
    } else if (match.target_type === "expense") {
      s.setExpenses((es) =>
        es.map((e) =>
          e.id === match.target_id ? { ...e, reconciled_imported_id: null } : e,
        ),
      );
    }
    logReconEvent(s, {
      imported_transaction_id: match.imported_transaction_id,
      event_type: "match_removed",
      label: `Match removed${reason ? ` — ${reason}` : ""}`,
    });
  }

  function createExpenseFromImport(input: {
    importedTransactionId: string;
    description: string;
    expense_category_id: string | null;
    vehicle_id?: string | null;
    maintenance_work_order_id?: string | null;
    paid_by_type?: "company" | "owner" | "employee" | "partner" | "other";
    receipt_required?: boolean;
    memo?: string | null;
  }): string | null {
    const imp = s.importedTransactions.find(
      (t) => t.id === input.importedTransactionId,
    );
    if (!imp || imp.direction !== "money_out") return null;
    const account = s.financialAccounts.find(
      (a) => a.id === imp.financial_account_id,
    );
    const expenseId = createExpense({
      description: input.description,
      amount: imp.amount,
      transaction_date: imp.transaction_date,
      expense_category_id: input.expense_category_id,
      payment_method: account
        ? defaultTenderForAccount(account)
        : "bank_transfer",
      payment_source: account ? account.name : null,
      processor: account ? defaultProcessorForAccount(account) : null,
      paid_by_type: input.paid_by_type ?? "company",
      vehicle_id: input.vehicle_id ?? null,
      maintenance_work_order_id: input.maintenance_work_order_id ?? null,
      receipt_required: input.receipt_required ?? false,
      memo: input.memo ?? null,
    });
    if (!expenseId) return null;
    doConfirmMatch(s, {
      importedTransactionId: imp.id,
      target_type: "expense",
      target_id: expenseId,
      allocated_amount: imp.amount,
      method: "manual",
      confidence: "high",
    });
    logReconEvent(s, {
      imported_transaction_id: imp.id,
      event_type: "expense_created",
      label: `Expense created from import — ${input.description}`,
    });
    return expenseId;
  }

  return { confirmMatch, unmatch, createExpenseFromImport };
}
