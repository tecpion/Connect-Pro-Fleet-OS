// Connect Pro Fleet — customer collection selectors (Build #14 cleanup).
//
// Authoritative reporting selectors for actual customer collections, sourced
// from the rental/customer FinancialTransaction ledger (NOT the expense
// ledger). A payment is counted ONCE in total collections; grouping by tender
// or processor is classification only — never double-counted.
//
// Collection semantics (preserved from Build #8):
//   - Held security-deposit COLLECTION is NOT rental revenue → excluded.
//   - Deposit APPLICATION is re-allocated held money, not new cash → excluded.
//   - Deposit REFUND is held money out → excluded.
//   - Deposit FORFEITURE is recognized revenue (a real charge) → excluded
//     from *payment* collections (it's a charge, not a payment).
// Only posted customer PAYMENTS count as collections.
//
// Tender/processor resolution: new payments carry canonical `tender_method`
// + `processor` in transaction.metadata. Legacy payments store a legacy
// `payment_method` ("card","cash",...) which is normalized to the canonical
// set via normalizePaymentMethod so historical records keep reporting.

import type { FinancialTransaction } from "./types";
import { isDepositHeldEvent } from "./deposit";
import {
  normalizePaymentMethod,
  TENDER_METHOD_LABELS,
  PROCESSOR_LABELS,
  type TenderMethod,
  type PaymentProcessor,
} from "./paymentMethodTypes";

/** Is this transaction an actual customer payment (a collection)? */
export function isCollectionPayment(t: FinancialTransaction): boolean {
  return (
    t.category === "payment" &&
    t.status === "posted" &&
    !isDepositHeldEvent(t) &&
    // Exclude deposit applications/forfeitures (they carry category payment or
    // charge but are deposit-tagged). isDepositHeldEvent covers held events;
    // applications/forfeitures are tagged via metadata.deposit and handled by
    // the deposit selectors, not here.
    !t.metadata?.deposit
  );
}

/** Resolve the canonical tender method for a transaction (new or legacy). */
export function tenderForTransaction(t: FinancialTransaction): TenderMethod {
  const md = t.metadata as Record<string, unknown> | null;
  if (md && md.tender_method) {
    return normalizePaymentMethod(md.tender_method as string);
  }
  return normalizePaymentMethod(t.payment_method);
}

/** Resolve the processor for a transaction (null for legacy/none). */
export function processorForTransaction(
  t: FinancialTransaction,
): PaymentProcessor | null {
  const md = t.metadata as Record<string, unknown> | null;
  if (md && md.processor) {
    return md.processor as PaymentProcessor;
  }
  return null;
}

/** Total customer collections (sum of posted payments, deposit-safe). */
export function getTotalCollections(
  transactions: FinancialTransaction[],
): number {
  return transactions
    .filter(isCollectionPayment)
    .reduce((s, t) => s + t.amount, 0);
}

export interface CollectionByTender {
  tender: TenderMethod;
  label: string;
  total: number;
  count: number;
}

/** Collections grouped by canonical tender method. */
export function getCollectionsByTenderMethod(
  transactions: FinancialTransaction[],
): CollectionByTender[] {
  const map = new Map<TenderMethod, { total: number; count: number }>();
  for (const t of transactions) {
    if (!isCollectionPayment(t)) continue;
    const tender = tenderForTransaction(t);
    const cur = map.get(tender) ?? { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    map.set(tender, cur);
  }
  return Array.from(map.entries())
    .map(([tender, v]) => ({
      tender,
      label: TENDER_METHOD_LABELS[tender],
      total: v.total,
      count: v.count,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface CollectionByProcessor {
  processor: PaymentProcessor | null;
  label: string;
  total: number;
  count: number;
}

/** Collections grouped by processor/source. Legacy payments (no processor)
 *  bucket under "Manual / Unspecified". */
export function getCollectionsByProcessor(
  transactions: FinancialTransaction[],
): CollectionByProcessor[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const t of transactions) {
    if (!isCollectionPayment(t)) continue;
    const proc = processorForTransaction(t);
    const key = proc ?? "__none__";
    const cur = map.get(key) ?? { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({
      processor: key === "__none__" ? null : (key as PaymentProcessor),
      label:
        key === "__none__"
          ? "Manual / Unspecified"
          : (PROCESSOR_LABELS[key as PaymentProcessor] ?? key),
      total: v.total,
      count: v.count,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface TenderMixEntry {
  tender: TenderMethod;
  label: string;
  total: number;
  percent: number;
}

/** Tender-method mix (share of total collections by tender). */
export function getTenderMethodMix(
  transactions: FinancialTransaction[],
): TenderMixEntry[] {
  const groups = getCollectionsByTenderMethod(transactions);
  const total = groups.reduce((s, g) => s + g.total, 0);
  return groups.map((g) => ({
    tender: g.tender,
    label: g.label,
    total: g.total,
    percent: total > 0 ? (g.total / total) * 100 : 0,
  }));
}

export { normalizePaymentMethod, TENDER_METHOD_LABELS, PROCESSOR_LABELS };
