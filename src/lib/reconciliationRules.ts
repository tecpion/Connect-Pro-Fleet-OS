// Connect Pro Fleet — reconciliation match engine (Build #15).
//
// Deterministic matching suggestions (NO AI): scores candidate Fleet payments
// and expenses against an imported transaction using amount, date proximity,
// tender/processor consistency, external ID, and normalized name similarity.
// Returns ranked suggestions with confidence (high/medium/low). Suggestions
// never change financial state — only a confirmed match creates a
// ReconciliationMatch. Ambiguous same-amount candidates are surfaced, never
// auto-chosen.

import type { FinancialTransaction } from "./types";
import type { ExpenseTransaction } from "./expenseTypes";
import type {
  ImportedTransaction,
  MatchConfidence,
  ReconciliationTargetType,
} from "./bankingTypes";
import { normalizeDescription } from "./csvImport";
import {
  isCollectionPayment,
  tenderForTransaction,
  processorForTransaction,
} from "./collectionSelectors";

const DAY = 86_400_000;
const DATE_TOLERANCE_DAYS = 3;

export interface MatchCandidate {
  target_type: ReconciliationTargetType;
  target_id: string;
  allocated_amount: number;
  confidence: MatchConfidence;
  score: number;
  label: string;
  sublabel: string;
}

function dateDiffDays(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.abs(da - db) / DAY;
}

function nameSimilarity(a: string, b: string): number {
  const na = normalizeDescription(a);
  const nb = normalizeDescription(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // Token overlap
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const max = Math.max(ta.size, tb.size);
  return max > 0 ? shared / max : 0;
}

/** Suggest customer-payment matches for a money-in imported transaction. */
export function suggestPaymentMatches(
  imp: ImportedTransaction,
  transactions: FinancialTransaction[],
  customerName: (id: string) => string,
): MatchCandidate[] {
  if (imp.direction !== "money_in") return [];
  const candidates: MatchCandidate[] = [];
  // Only unmatched, posted collection payments.
  const pool = transactions.filter(
    (t) => isCollectionPayment(t) && !t.metadata?.reconciled_imported_id,
  );
  for (const t of pool) {
    let score = 0;
    // External ID exact -> highest.
    if (
      imp.external_transaction_id &&
      t.external_transaction_id === imp.external_transaction_id
    ) {
      score += 100;
    }
    // Amount exact.
    if (Math.abs(t.amount - imp.amount) < 0.005) score += 40;
    else continue; // amount must match for a payment suggestion
    // Date proximity.
    const dd = dateDiffDays(imp.transaction_date, t.effective_date);
    if (dd <= DATE_TOLERANCE_DAYS) score += 20 - dd * 4;
    // Tender consistency.
    const tender = tenderForTransaction(t);
    if (imp.description.toUpperCase().includes(tender.toUpperCase()))
      score += 10;
    // Name similarity (customer name vs description).
    const cn = customerName(t.customer_id).toUpperCase();
    score += Math.round(nameSimilarity(imp.description, cn) * 15);
    // Reference match.
    if (imp.reference && t.external_transaction_id === imp.reference)
      score += 15;

    const confidence: MatchConfidence =
      score >= 80 ? "high" : score >= 45 ? "medium" : "low";
    candidates.push({
      target_type: "customer_payment",
      target_id: t.id,
      allocated_amount: imp.amount,
      confidence,
      score,
      label: `Rental payment — ${customerName(t.customer_id)}`,
      sublabel: `$${t.amount.toFixed(2)} · ${t.effective_date}`,
    });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

/** Suggest expense matches for a money-out imported transaction. */
export function suggestExpenseMatches(
  imp: ImportedTransaction,
  expenses: ExpenseTransaction[],
  vendorName: (id: string | null) => string,
): MatchCandidate[] {
  if (imp.direction !== "money_out") return [];
  const candidates: MatchCandidate[] = [];
  const pool = expenses.filter(
    (e) => e.status === "posted" && !e.reversal_of && !e.reconciled_imported_id,
  );
  for (const e of pool) {
    let score = 0;
    if (Math.abs(e.amount - imp.amount) < 0.005) score += 40;
    else continue;
    const dd = dateDiffDays(imp.transaction_date, e.transaction_date);
    if (dd <= DATE_TOLERANCE_DAYS) score += 20 - dd * 4;
    const vendor = vendorName(e.vendor_id);
    score += Math.round(
      nameSimilarity(imp.description, vendor || e.description) * 20,
    );
    const confidence: MatchConfidence =
      score >= 70 ? "high" : score >= 40 ? "medium" : "low";
    candidates.push({
      target_type: "expense",
      target_id: e.id,
      allocated_amount: imp.amount,
      confidence,
      score,
      label: `${e.expense_number} — ${e.description}`,
      sublabel: `$${e.amount.toFixed(2)} · ${e.transaction_date}`,
    });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

/** Is a match deterministic enough to auto-confirm? Only exact external ID. */
export function isAutoMatchable(c: MatchCandidate): boolean {
  return c.confidence === "high" && c.score >= 100;
}

/** Check whether an imported transaction is already fully allocated by
 *  existing non-voided matches. */
export function allocatedAmount(
  matches: {
    imported_transaction_id: string;
    allocated_amount: number;
    voided_at: string | null;
  }[],
  importedId: string,
): number {
  return matches
    .filter((m) => m.imported_transaction_id === importedId && !m.voided_at)
    .reduce((s, m) => s + m.allocated_amount, 0);
}

export { DATE_TOLERANCE_DAYS };
