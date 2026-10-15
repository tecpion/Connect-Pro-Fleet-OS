// Connect Pro Fleet — Banking review selector helpers (Build #42).
//
// Pure functions that COMPOSE authoritative banking/expense data for the
// Review Transaction flow. They never duplicate financial records or alter
// calculations. An imported bank transaction is EVIDENCE of money movement —
// NOT revenue or expense until matched or converted by an authorized user.
//
// Responsibilities:
//  - duplicate-expense detection (before Create New Expense)
//  - manual record search (expenses / payments) by amount, merchant, ref
//  - expense-rule candidate resolution (assists classification, never creates)
//  - fast-filter classification for the inbox chips

import type { ImportedTransaction } from "./bankingTypes";
import type { ExpenseTransaction, RuleCandidate } from "./expenseTypes";
import type { FinancialTransaction } from "./types";

// ---------------------------------------------------------------------------
// Duplicate-expense detection (runs before Create New Expense)
// ---------------------------------------------------------------------------

export interface DuplicateExpenseSuspect {
  expense: ExpenseTransaction;
  signals: string[];
}

/** Find likely duplicate expenses for a money-out imported transaction.
 *  Signals: exact amount, date within 3 days, same merchant/description.
 *  Does NOT block legitimate duplicates — returns suspects for review. */
export function findDuplicateExpenses(
  txn: ImportedTransaction,
  expenses: ExpenseTransaction[],
): DuplicateExpenseSuspect[] {
  if (txn.direction !== "money_out") return [];
  const DAY = 86_400_000;
  const txnTime = new Date(txn.transaction_date + "T00:00:00").getTime();
  const results: DuplicateExpenseSuspect[] = [];
  for (const e of expenses) {
    if (e.status !== "posted") continue;
    if (e.reversal_of) continue;
    const signals: string[] = [];
    const amountMatch = Math.abs(e.amount - txn.amount) < 0.005;
    if (!amountMatch) continue;
    signals.push("Same amount");
    const eTime = new Date(e.transaction_date + "T00:00:00").getTime();
    const dayDiff = Math.abs(eTime - txnTime) / DAY;
    if (dayDiff <= 3) {
      signals.push(
        dayDiff === 0
          ? "Same date"
          : `Within ${Math.round(dayDiff)} day${dayDiff !== 1 ? "s" : ""}`,
      );
    }
    const desc = (e.description ?? "").toLowerCase();
    const merchant = (txn.merchant_name ?? txn.description ?? "").toLowerCase();
    if (merchant && (desc.includes(merchant) || merchant.includes(desc))) {
      signals.push("Merchant/description match");
    }
    if (e.reconciled_imported_id === txn.id) {
      signals.push("Already linked to this transaction");
    }
    results.push({ expense: e, signals });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Manual record search (expenses / payments)
// ---------------------------------------------------------------------------

export interface ManualSearchResult {
  target_type: "expense" | "customer_payment";
  target_id: string;
  allocated_amount: number;
  label: string;
  sublabel: string;
}

/** Search posted, unmatched expenses by amount, merchant, description, or
 *  expense number. Returns up to `limit` results. */
export function searchExpenses(
  query: string,
  txn: ImportedTransaction,
  expenses: ExpenseTransaction[],
  limit = 5,
): ManualSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return expenses
    .filter(
      (e) =>
        e.status === "posted" &&
        !e.reversal_of &&
        !e.reconciled_imported_id &&
        (e.description.toLowerCase().includes(q) ||
          e.expense_number.toLowerCase().includes(q) ||
          Math.abs(e.amount - txn.amount) < 0.005),
    )
    .slice(0, limit)
    .map((e) => ({
      target_type: "expense" as const,
      target_id: e.id,
      allocated_amount: txn.amount,
      label: `${e.expense_number} — ${e.description}`,
      sublabel: `$${e.amount.toFixed(2)} · ${e.transaction_date}`,
    }));
}

/** Search posted, unmatched collection payments by amount, customer, or
 *  description. Returns up to `limit` results. */
export function searchPayments(
  query: string,
  txn: ImportedTransaction,
  transactions: FinancialTransaction[],
  customerName: (id: string) => string,
  isCollectionPayment: (t: FinancialTransaction) => boolean,
  limit = 5,
): ManualSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return transactions
    .filter(
      (t) =>
        isCollectionPayment(t) &&
        t.status === "posted" &&
        !t.metadata?.reconciled_imported_id &&
        (t.description.toLowerCase().includes(q) ||
          customerName(t.customer_id).toLowerCase().includes(q) ||
          Math.abs(t.amount - txn.amount) < 0.005),
    )
    .slice(0, limit)
    .map((t) => ({
      target_type: "customer_payment" as const,
      target_id: t.id,
      allocated_amount: txn.amount,
      label: `Rental payment — ${customerName(t.customer_id)}`,
      sublabel: `$${t.amount.toFixed(2)} · ${t.effective_date}`,
    }));
}

// ---------------------------------------------------------------------------
// Expense-rule candidate resolution
// ---------------------------------------------------------------------------

/** Build a RuleCandidate from an imported transaction (money-out only).
 *  The rule assists classification — it NEVER creates an expense. */
export function ruleCandidateFromTxn(
  txn: ImportedTransaction,
): RuleCandidate | null {
  if (txn.direction !== "money_out") return null;
  return {
    merchant: txn.merchant_name ?? txn.description,
    description: txn.description,
    amount: txn.amount,
    account_id: txn.financial_account_id,
    transaction_type: txn.transaction_type,
  };
}

// ---------------------------------------------------------------------------
// Inbox fast-filter classification
// ---------------------------------------------------------------------------

export type InboxFilter =
  | "all"
  | "money_in"
  | "money_out"
  | "needs_review"
  | "suggested"
  | "matched"
  | "transfers"
  | "ignored"
  | "duplicate_suspected";

export const INBOX_FILTER_LABELS: Record<InboxFilter, string> = {
  all: "All",
  money_in: "Money In",
  money_out: "Money Out",
  needs_review: "Needs Review",
  suggested: "Suggested Matches",
  matched: "Matched",
  transfers: "Transfers",
  ignored: "Ignored",
  duplicate_suspected: "Duplicate Suspected",
};

/** Apply an inbox fast-filter to a transaction list. */
export function applyInboxFilter(
  txns: ImportedTransaction[],
  filter: InboxFilter,
  duplicateTxnIds: Set<string>,
): ImportedTransaction[] {
  switch (filter) {
    case "money_in":
      return txns.filter((t) => t.direction === "money_in");
    case "money_out":
      return txns.filter((t) => t.direction === "money_out");
    case "needs_review":
      return txns.filter((t) => t.review_status === "unreviewed");
    case "suggested":
      return txns.filter((t) => t.match_status === "suggested");
    case "matched":
      return txns.filter(
        (t) =>
          t.match_status === "matched" || t.match_status === "split_matched",
      );
    case "transfers":
      return txns.filter((t) => t.transfer_status === "transfer");
    case "ignored":
      return txns.filter((t) => t.review_status === "ignored");
    case "duplicate_suspected":
      return txns.filter((t) => duplicateTxnIds.has(t.id));
    default:
      return txns;
  }
}

/** Search imported transactions by merchant, description, reference, or
 *  amount string. */
export function searchImportedTransactions(
  txns: ImportedTransaction[],
  query: string,
): ImportedTransaction[] {
  const q = query.trim().toLowerCase();
  if (!q) return txns;
  return txns.filter(
    (t) =>
      t.description.toLowerCase().includes(q) ||
      (t.merchant_name ?? "").toLowerCase().includes(q) ||
      (t.reference ?? "").toLowerCase().includes(q) ||
      t.amount.toFixed(2).includes(q),
  );
}
