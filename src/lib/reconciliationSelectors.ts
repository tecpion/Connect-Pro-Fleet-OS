// Connect Pro Fleet — reconciliation selectors (Build #15).
//
// Pure selectors over imported transactions, matches, transfers, statements,
// and accounts. Derived reconciliation state (unreviewed, matched, unmatched
// money in/out, statement difference, account last balance) is computed here
// rather than scattered across components. The imported activity itself has
// ZERO effect on rental revenue or expense totals — only a confirmed match
// (which changes reconciliation status only) or an explicit create-expense /
// record-payment action changes financial state.

import type {
  AccountTransfer,
  FinancialAccount,
  FinancialStatement,
  ImportedTransaction,
  ReconciliationMatch,
  StatementReconciliationStatus,
} from "./bankingTypes";

const DAY = 86_400_000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inRange(date: string, start: Date, end: Date): boolean {
  const d = new Date(date + "T00:00:00");
  return d >= start && d <= end;
}

/** Unreviewed imported transactions (review_status = unreviewed). */
export function getUnreviewedTransactions(
  txns: ImportedTransaction[],
): ImportedTransaction[] {
  return txns.filter((t) => t.review_status === "unreviewed");
}

/** Imported transactions with a suggested (not yet confirmed) match. */
export function getSuggestedTransactions(
  txns: ImportedTransaction[],
): ImportedTransaction[] {
  return txns.filter((t) => t.match_status === "suggested");
}

/** Imported transactions with at least one active match. */
export function getMatchedTransactions(
  txns: ImportedTransaction[],
): ImportedTransaction[] {
  return txns.filter(
    (t) => t.match_status === "matched" || t.match_status === "split_matched",
  );
}

/** Unmatched money-in (unreviewed, no match, money_in). */
export function getUnmatchedMoneyIn(
  txns: ImportedTransaction[],
): ImportedTransaction[] {
  return txns.filter(
    (t) =>
      t.direction === "money_in" &&
      t.review_status !== "ignored" &&
      t.match_status === "unmatched" &&
      t.transfer_status === "none",
  );
}

/** Unmatched money-out (unreviewed, no match, money_out). */
export function getUnmatchedMoneyOut(
  txns: ImportedTransaction[],
): ImportedTransaction[] {
  return txns.filter(
    (t) =>
      t.direction === "money_out" &&
      t.review_status !== "ignored" &&
      t.match_status === "unmatched" &&
      t.transfer_status === "none",
  );
}

/** Transactions for a specific statement. */
export function getStatementTransactions(
  txns: ImportedTransaction[],
  statementId: string,
): ImportedTransaction[] {
  return txns
    .filter((t) => t.statement_id === statementId)
    .sort((a, b) => (a.transaction_date < b.transaction_date ? -1 : 1));
}

/** Active (non-voided) matches for an imported transaction. */
export function matchesForImport(
  matches: ReconciliationMatch[],
  importedId: string,
): ReconciliationMatch[] {
  return matches.filter(
    (m) => m.imported_transaction_id === importedId && !m.voided_at,
  );
}

/** Total allocated amount across active matches for an imported transaction. */
export function getMatchedAmount(
  matches: ReconciliationMatch[],
  importedId: string,
): number {
  return matchesForImport(matches, importedId).reduce(
    (s, m) => s + m.allocated_amount,
    0,
  );
}

/** Remaining unmatched amount on an imported transaction. */
export function getRemainingUnmatchedAmount(
  imp: ImportedTransaction,
  matches: ReconciliationMatch[],
): number {
  return Math.max(0, imp.amount - getMatchedAmount(matches, imp.id));
}

/** Is an imported transaction fully allocated (matched amount >= amount)? */
export function isFullyMatched(
  imp: ImportedTransaction,
  matches: ReconciliationMatch[],
): boolean {
  return getMatchedAmount(matches, imp.id) >= imp.amount - 0.005;
}

/** Calculate the statement's expected closing balance from its transactions.
 *  opening + sum(money_in) - sum(money_out). */
export function calculateStatementClosing(
  statement: FinancialStatement,
  txns: ImportedTransaction[],
): number | null {
  const stmtTxns = getStatementTransactions(txns, statement.id);
  const opening = statement.opening_balance ?? 0;
  const net = stmtTxns.reduce((s, t) => {
    if (t.review_status === "ignored") return s;
    return s + (t.direction === "money_in" ? t.amount : -t.amount);
  }, 0);
  return opening + net;
}

/** Difference between calculated closing and the statement's reported closing. */
export function getStatementDifference(
  statement: FinancialStatement,
  txns: ImportedTransaction[],
): number | null {
  if (statement.closing_balance == null) return null;
  const calc = calculateStatementClosing(statement, txns);
  if (calc == null) return null;
  return statement.closing_balance - calc;
}

/** Derived reconciliation status for a statement. */
export function deriveStatementStatus(
  statement: FinancialStatement,
  txns: ImportedTransaction[],
): StatementReconciliationStatus {
  const stmtTxns = getStatementTransactions(txns, statement.id);
  if (stmtTxns.length === 0) return "not_started";
  const diff = getStatementDifference(statement, txns);
  const balanced = diff == null || Math.abs(diff) < 0.005;
  const allReviewed = stmtTxns.every((t) => t.review_status !== "unreviewed");
  if (balanced && allReviewed) return "reconciled";
  if (allReviewed || !balanced) return "in_progress";
  return "needs_attention";
}

/** Is a statement reconciled (balanced + all reviewed)? */
export function isStatementReconciled(
  statement: FinancialStatement,
  txns: ImportedTransaction[],
): boolean {
  return deriveStatementStatus(statement, txns) === "reconciled";
}

/** Last imported balance for an account (from the most recent statement). */
export function getAccountLastImportedBalance(
  account: FinancialAccount,
  statements: FinancialStatement[],
): { balance: number | null; date: string | null } {
  const acctStmts = statements
    .filter((s) => s.financial_account_id === account.id)
    .sort((a, b) => (a.statement_end_date < b.statement_end_date ? 1 : -1));
  if (acctStmts.length === 0) return { balance: null, date: null };
  const latest = acctStmts[0];
  return { balance: latest.closing_balance, date: latest.statement_end_date };
}

/** Count of unreviewed transactions for an account. */
export function getAccountUnreviewedCount(
  accountId: string,
  txns: ImportedTransaction[],
): number {
  return txns.filter(
    (t) =>
      t.financial_account_id === accountId && t.review_status === "unreviewed",
  ).length;
}

/** Transactions for an account, newest first. */
export function getAccountTransactions(
  accountId: string,
  txns: ImportedTransaction[],
): ImportedTransaction[] {
  return txns
    .filter((t) => t.financial_account_id === accountId)
    .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1));
}

/** Search imported transactions by description, merchant, amount, reference. */
export function searchImported(
  txns: ImportedTransaction[],
  query: string,
): ImportedTransaction[] {
  const q = query.trim().toLowerCase();
  if (!q) return txns;
  return txns.filter((t) => {
    if (t.description.toLowerCase().includes(q)) return true;
    if ((t.merchant_name ?? "").toLowerCase().includes(q)) return true;
    if ((t.reference ?? "").toLowerCase().includes(q)) return true;
    if (t.amount.toFixed(2).includes(q)) return true;
    return false;
  });
}

/** Filter imported transactions by account, direction, review/match/transfer. */
export function filterImported(
  txns: ImportedTransaction[],
  opts: {
    accountId?: string | null;
    statementId?: string | null;
    direction?: string | null;
    reviewStatus?: string | null;
    matchStatus?: string | null;
    transfer?: boolean | null;
  },
): ImportedTransaction[] {
  return txns.filter((t) => {
    if (opts.accountId && t.financial_account_id !== opts.accountId)
      return false;
    if (opts.statementId && t.statement_id !== opts.statementId) return false;
    if (opts.direction && t.direction !== opts.direction) return false;
    if (opts.reviewStatus && t.review_status !== opts.reviewStatus)
      return false;
    if (opts.matchStatus && t.match_status !== opts.matchStatus) return false;
    if (opts.transfer === true && t.transfer_status !== "transfer")
      return false;
    if (opts.transfer === false && t.transfer_status === "transfer")
      return false;
    return true;
  });
}

/** Transfers involving a given imported transaction. */
export function transfersForImport(
  transfers: AccountTransfer[],
  importedId: string,
): AccountTransfer[] {
  return transfers.filter((t) =>
    t.imported_transaction_ids.includes(importedId),
  );
}

export { startOfDay, DAY, inRange };
