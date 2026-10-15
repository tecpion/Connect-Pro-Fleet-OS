// Connect Pro Fleet — Banking attention selectors (Build #42).
//
// Pure selectors over imported transactions, matches, statements, and accounts.
// These COMPOSE authoritative banking data — they never duplicate financial
// records or alter calculations. They surface only genuine attention items:
// unreviewed transactions, suggested matches awaiting confirmation, possible
// duplicates, statements needing attention, and unmatched money in/out.
//
// Imported bank activity is EVIDENCE of money movement — NOT revenue or
// expense until matched. These selectors respect that boundary: they report
// review/match state, never financial totals as authoritative P&L.

import type {
  ImportedTransaction,
  FinancialStatement,
  ReconciliationMatch,
} from "./bankingTypes";
import {
  getUnreviewedTransactions,
  getSuggestedTransactions,
  getUnmatchedMoneyIn,
  getUnmatchedMoneyOut,
  deriveStatementStatus,
  getStatementDifference,
  getStatementTransactions,
} from "./reconciliationSelectors";

// ---------------------------------------------------------------------------
// Transaction review state labels (transparent, no opaque score)
// ---------------------------------------------------------------------------

export type TransactionAttentionReason =
  | "unreviewed"
  | "suggested_match"
  | "duplicate_suspected"
  | "unmatched_money_in"
  | "unmatched_money_out"
  | "missing_match";

export const TRANSACTION_ATTENTION_LABELS: Record<
  TransactionAttentionReason,
  string
> = {
  unreviewed: "Needs Review",
  suggested_match: "Suggested Match",
  duplicate_suspected: "Duplicate Suspected",
  unmatched_money_in: "Unmatched In",
  unmatched_money_out: "Unmatched Out",
  missing_match: "No Match",
};

export interface TransactionAttentionItem {
  imported_transaction_id: string;
  description: string;
  transaction_date: string;
  amount: number;
  direction: "money_in" | "money_out";
  account_id: string;
  account_name: string | null;
  review_status: string;
  match_status: string;
  transfer_status: string;
  reasons: TransactionAttentionReason[];
  deep_link: string | null;
}

/** Derive transparent attention reasons for a single imported transaction.
 *  Returns an empty array when the transaction needs no attention (matched,
 *  reviewed, transfer, or ignored). */
export function transactionAttentionReasons(
  txn: ImportedTransaction,
  hasActiveMatch: boolean,
): TransactionAttentionReason[] {
  if (txn.review_status === "ignored") return [];
  if (txn.transfer_status === "transfer") return [];
  if (txn.match_status === "matched" || txn.match_status === "split_matched")
    return [];
  const reasons: TransactionAttentionReason[] = [];
  if (txn.review_status === "unreviewed") reasons.push("unreviewed");
  if (txn.match_status === "suggested") reasons.push("suggested_match");
  if (txn.match_status === "unmatched") {
    reasons.push("missing_match");
    if (txn.direction === "money_in") reasons.push("unmatched_money_in");
    else reasons.push("unmatched_money_out");
  }
  // Duplicate detection is handled by duplicate detection selectors; if the
  // txn carries a duplicate flag in raw_data, surface it.
  if (
    txn.raw_data &&
    (txn.raw_data as Record<string, unknown>)?.duplicate_suspected === true
  ) {
    reasons.push("duplicate_suspected");
  }
  return reasons;
}

/** Build attention items for all transactions needing review.
 *  Excludes fully matched, transferred, and ignored transactions. */
export function getTransactionAttention(
  txns: ImportedTransaction[],
  matches: ReconciliationMatch[],
  accountName: (id: string) => string | null,
): TransactionAttentionItem[] {
  const activeMatchIds = new Set(
    matches.filter((m) => !m.voided_at).map((m) => m.imported_transaction_id),
  );
  return txns
    .map((t): TransactionAttentionItem | null => {
      const reasons = transactionAttentionReasons(t, activeMatchIds.has(t.id));
      if (reasons.length === 0) return null;
      return {
        imported_transaction_id: t.id,
        description: t.description,
        transaction_date: t.transaction_date,
        amount: t.amount,
        direction: t.direction,
        account_id: t.financial_account_id,
        account_name: accountName(t.financial_account_id),
        review_status: t.review_status,
        match_status: t.match_status,
        transfer_status: t.transfer_status,
        reasons,
        deep_link: `/finance?tab=banking&subtab=inbox&txn=${t.id}`,
      };
    })
    .filter((x): x is TransactionAttentionItem => x !== null)
    .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Statement attention
// ---------------------------------------------------------------------------

export interface StatementAttentionItem {
  statement_id: string;
  account_id: string;
  account_name: string | null;
  period_start: string;
  period_end: string;
  status: string;
  difference: number | null;
  unreviewed_count: number;
  transaction_count: number;
  reasons: string[];
  deep_link: string | null;
}

/** Statements needing attention: non-zero difference, missing ending balance,
 *  unreviewed transactions, or needs_attention status. */
export function getStatementAttention(
  statements: FinancialStatement[],
  txns: ImportedTransaction[],
  accountName: (id: string) => string | null,
): StatementAttentionItem[] {
  return statements
    .map((s): StatementAttentionItem | null => {
      const status = deriveStatementStatus(s, txns);
      const diff = getStatementDifference(s, txns);
      const stmtTxns = getStatementTransactions(txns, s.id);
      const unreviewed = stmtTxns.filter(
        (t) => t.review_status === "unreviewed",
      ).length;
      const reasons: string[] = [];
      if (diff != null && Math.abs(diff) >= 0.005)
        reasons.push("Non-zero reconciliation difference");
      if (s.closing_balance == null) reasons.push("Missing ending balance");
      if (unreviewed > 0)
        reasons.push(
          `${unreviewed} unreviewed transaction${unreviewed !== 1 ? "s" : ""}`,
        );
      if (status === "needs_attention") reasons.push("Needs attention");
      if (reasons.length === 0) return null;
      return {
        statement_id: s.id,
        account_id: s.financial_account_id,
        account_name: accountName(s.financial_account_id),
        period_start: s.statement_start_date,
        period_end: s.statement_end_date,
        status,
        difference: diff,
        unreviewed_count: unreviewed,
        transaction_count: stmtTxns.length,
        reasons,
        deep_link: `/finance?tab=banking&subtab=statements`,
      };
    })
    .filter((x): x is StatementAttentionItem => x !== null);
}

// ---------------------------------------------------------------------------
// Banking KPI summary
// ---------------------------------------------------------------------------

export interface BankingKpiSummary {
  needs_review: number;
  unmatched_in_count: number;
  unmatched_out_count: number;
  unmatched_in_amount: number;
  unmatched_out_amount: number;
  suggested_matches: number;
  statements_need_attention: number;
  matched_count: number;
  ignored_count: number;
  transfer_count: number;
}

/** Compute the banking KPI summary from imported transactions + statements.
 *  Amounts are raw (caller permission-gates display). */
export function getBankingKpiSummary(
  txns: ImportedTransaction[],
  statements: FinancialStatement[],
): BankingKpiSummary {
  const unreviewed = getUnreviewedTransactions(txns);
  const suggested = getSuggestedTransactions(txns);
  const unmatchedIn = getUnmatchedMoneyIn(txns);
  const unmatchedOut = getUnmatchedMoneyOut(txns);
  const matched = txns.filter(
    (t) => t.match_status === "matched" || t.match_status === "split_matched",
  );
  const ignored = txns.filter((t) => t.review_status === "ignored");
  const transfers = txns.filter((t) => t.transfer_status === "transfer");
  const stmtAttention = statements.filter(
    (s) => deriveStatementStatus(s, txns) === "needs_attention",
  );
  return {
    needs_review: unreviewed.length,
    unmatched_in_count: unmatchedIn.length,
    unmatched_out_count: unmatchedOut.length,
    unmatched_in_amount: unmatchedIn.reduce((s, t) => s + t.amount, 0),
    unmatched_out_amount: unmatchedOut.reduce((s, t) => s + t.amount, 0),
    suggested_matches: suggested.length,
    statements_need_attention: stmtAttention.length,
    matched_count: matched.length,
    ignored_count: ignored.length,
    transfer_count: transfers.length,
  };
}

// ---------------------------------------------------------------------------
// Duplicate detection (deterministic signals — no AI)
// ---------------------------------------------------------------------------

export interface DuplicateSuspect {
  existing: ImportedTransaction;
  candidate: ImportedTransaction;
  signals: string[];
}

/** Detect likely duplicate imported transactions using deterministic signals:
 *  same external ID, same fingerprint, or same account+date+amount+description.
 *  Does NOT silently block legitimate duplicates — returns suspects for review. */
export function detectDuplicateTransactions(
  txns: ImportedTransaction[],
): DuplicateSuspect[] {
  const suspects: DuplicateSuspect[] = [];
  for (let i = 0; i < txns.length; i++) {
    for (let j = i + 1; j < txns.length; j++) {
      const a = txns[i];
      const b = txns[j];
      const signals: string[] = [];
      if (
        a.external_transaction_id &&
        a.external_transaction_id === b.external_transaction_id
      ) {
        signals.push("Same external transaction ID");
      }
      if (a.import_fingerprint === b.import_fingerprint) {
        signals.push("Same import fingerprint");
      }
      if (
        a.financial_account_id === b.financial_account_id &&
        a.transaction_date === b.transaction_date &&
        Math.abs(a.amount - b.amount) < 0.005 &&
        a.direction === b.direction
      ) {
        signals.push("Same account, date, amount, direction");
        if (
          (a.normalized_description ?? "").toLowerCase() ===
          (b.normalized_description ?? "").toLowerCase()
        ) {
          signals.push("Same description");
        }
      }
      if (signals.length > 0) {
        suspects.push({ existing: a, candidate: b, signals });
      }
    }
  }
  return suspects;
}

/** Check whether an imported transaction is already linked to an authoritative
 *  record (has active matches). Used to prevent accidental duplicate conversion. */
export function isAlreadyMatched(
  txn: ImportedTransaction,
  matches: ReconciliationMatch[],
): boolean {
  return matches.some(
    (m) =>
      m.imported_transaction_id === txn.id &&
      !m.voided_at &&
      m.allocated_amount > 0,
  );
}

// ---------------------------------------------------------------------------
// Matched-tab row (reviewed vs matched vs reconciled distinction)
// ---------------------------------------------------------------------------

export interface MatchedTabRow {
  imported_transaction_id: string;
  description: string;
  transaction_date: string;
  amount: number;
  direction: "money_in" | "money_out";
  account_name: string | null;
  match_id: string;
  target_type: string;
  target_id: string;
  allocated_amount: number;
  match_method: string;
  confidence: string;
  matched_by: string | null;
  matched_at: string;
  statement_reconciled: boolean;
  deep_link: string | null;
}

/** Build matched-tab rows: each active match → one row with the matched record
 *  type, method, confidence, and reconciliation state. */
export function getMatchedTabRows(
  txns: ImportedTransaction[],
  matches: ReconciliationMatch[],
  statements: FinancialStatement[],
  accountName: (id: string) => string | null,
  staffName: (id: string | null) => string | null,
): MatchedTabRow[] {
  const stmtReconciled = new Set(
    statements
      .filter((s) => s.reconciliation_status === "reconciled")
      .map((s) => s.id),
  );
  return matches
    .filter((m) => !m.voided_at)
    .map((m): MatchedTabRow | null => {
      const txn = txns.find((t) => t.id === m.imported_transaction_id);
      if (!txn) return null;
      return {
        imported_transaction_id: txn.id,
        description: txn.description,
        transaction_date: txn.transaction_date,
        amount: txn.amount,
        direction: txn.direction,
        account_name: accountName(txn.financial_account_id),
        match_id: m.id,
        target_type: m.target_type,
        target_id: m.target_id,
        allocated_amount: m.allocated_amount,
        match_method: m.match_method,
        confidence: m.confidence,
        matched_by: staffName(m.created_by),
        matched_at: m.created_at,
        statement_reconciled: txn.statement_id
          ? stmtReconciled.has(txn.statement_id)
          : false,
        deep_link: `/finance?tab=banking&subtab=inbox&txn=${txn.id}`,
      };
    })
    .filter((x): x is MatchedTabRow => x !== null)
    .sort((a, b) => (a.matched_at < b.matched_at ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Transfer pair suggestion (both sides present)
// ---------------------------------------------------------------------------

export interface TransferPairSuggestion {
  out_txn: ImportedTransaction;
  in_txn: ImportedTransaction;
  amount: number;
  signals: string[];
}

/** Suggest transfer pairs when both sides are present (money-out on one
 *  account + money-in on another, same amount + close date). Deterministic. */
export function suggestTransferPairs(
  txns: ImportedTransaction[],
): TransferPairSuggestion[] {
  const outs = txns.filter(
    (t) =>
      t.direction === "money_out" &&
      t.transfer_status === "none" &&
      t.review_status !== "ignored",
  );
  const ins = txns.filter(
    (t) =>
      t.direction === "money_in" &&
      t.transfer_status === "none" &&
      t.review_status !== "ignored",
  );
  const pairs: TransferPairSuggestion[] = [];
  for (const out of outs) {
    for (const inn of ins) {
      if (out.financial_account_id === inn.financial_account_id) continue;
      if (Math.abs(out.amount - inn.amount) >= 0.005) continue;
      const dayDiff = Math.abs(
        (new Date(out.transaction_date + "T00:00:00").getTime() -
          new Date(inn.transaction_date + "T00:00:00").getTime()) /
          86_400_000,
      );
      if (dayDiff > 3) continue;
      const signals = [
        "Same amount",
        dayDiff === 0
          ? "Same date"
          : `Within ${dayDiff} day${dayDiff !== 1 ? "s" : ""}`,
        "Different accounts",
      ];
      pairs.push({ out_txn: out, in_txn: inn, amount: out.amount, signals });
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Receipt-inbox cross-reference (possible receipt match for a bank txn)
// ---------------------------------------------------------------------------

export interface ReceiptMatchSuggestion {
  receipt_inbox_id: string;
  file_name: string;
  amount: number | null;
  merchant: string | null;
  captured_at: string;
  signals: string[];
}

/** Suggest receipt-inbox items that may match an imported transaction by
 *  amount + merchant + date proximity. Deterministic — user approves. */
export function suggestReceiptMatches(
  txn: ImportedTransaction,
  inbox: {
    id: string;
    file_name: string;
    amount: number | null;
    merchant: string | null;
    captured_at: string;
    state: string;
    matched_imported_id: string | null;
  }[],
): ReceiptMatchSuggestion[] {
  const candidates = inbox.filter(
    (i) =>
      i.state !== "matched" &&
      i.state !== "attached" &&
      i.matched_imported_id !== txn.id,
  );
  const results: ReceiptMatchSuggestion[] = [];
  for (const r of candidates) {
    const signals: string[] = [];
    if (r.amount != null && Math.abs(r.amount - txn.amount) < 0.005) {
      signals.push("Same amount");
    }
    if (r.merchant && txn.merchant_name) {
      const rm = r.merchant.toLowerCase();
      const tm = txn.merchant_name.toLowerCase();
      if (rm === tm || rm.includes(tm) || tm.includes(rm)) {
        signals.push("Merchant match");
      }
    }
    const dayDiff = Math.abs(
      (new Date(txn.transaction_date + "T00:00:00").getTime() -
        new Date(r.captured_at.slice(0, 10) + "T00:00:00").getTime()) /
        86_400_000,
    );
    if (dayDiff <= 5) {
      signals.push(dayDiff === 0 ? "Same date" : `Within ${dayDiff} days`);
    }
    if (signals.length > 0) {
      results.push({
        receipt_inbox_id: r.id,
        file_name: r.file_name,
        amount: r.amount,
        merchant: r.merchant,
        captured_at: r.captured_at,
        signals,
      });
    }
  }
  return results.sort((a, b) => b.signals.length - a.signals.length);
}
