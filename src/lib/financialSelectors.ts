// Connect Pro Fleet — financial selectors (Build #5 / Build #8 cleanup).
//
// Period-aware financial reporting selectors so the Dashboard and future
// reports use consistent domain logic. Clearly distinguishes:
//   COLLECTIONS      = money actually received (posted payments)
//   BILLED REVENUE   = rental obligations/charges generated
//   OUTSTANDING      = earned/open obligations minus applied payments/credits
//   NET CONTRIBUTION = collected revenue minus tracked fleet expenses
//
// Build #8 cleanup — deposit semantics:
// Held deposit COLLECTION is NOT rental revenue and does NOT satisfy rental
// charges, so it's excluded from collections + outstanding. But a deposit
// APPLICATION reduces the customer's obligation (acts like a payment) and a
// FORFEITURE is recognized revenue (a real charge). We use deposit.depositKind
// / isDepositHeldEvent / affectsRentalObligation rather than blanket-excluding
// every deposit-tagged transaction.

import type { FinancialTransaction, MaintenanceRecord } from "./types";
import {
  affectsRentalObligation,
  isDepositHeldEvent,
  obligationSignedAmount,
} from "./deposit";

const DAY = 86_400_000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inRange(t: FinancialTransaction, start: Date, end: Date): boolean {
  const d = new Date(t.effective_date + "T00:00:00");
  return d >= start && d <= end;
}

/** Money actually received (posted payments) within [start, end].
 *  Excludes held deposit collections — held deposits are not rental revenue.
 *  Deposit applications are not cash received (they re-allocate held money). */
export function getCollectionsForRange(
  transactions: FinancialTransaction[],
  start: Date,
  end: Date,
): number {
  return transactions
    .filter(
      (t) =>
        t.category === "payment" &&
        t.status === "posted" &&
        !isDepositHeldEvent(t) &&
        inRange(t, start, end),
    )
    .reduce((s, t) => s + t.amount, 0);
}

/** Rental obligations/charges generated within [start, end] (billed revenue).
 *  Excludes held deposit collections; INCLUDES forfeitures (recognized revenue). */
export function getChargesForRange(
  transactions: FinancialTransaction[],
  start: Date,
  end: Date,
): number {
  return transactions
    .filter(
      (t) =>
        t.category === "charge" &&
        t.status === "posted" &&
        !isDepositHeldEvent(t) &&
        inRange(t, start, end),
    )
    .reduce((s, t) => s + t.amount, 0);
}

/** Rental revenue (charges) recognized within [start, end]. */
export function getRentalRevenueForRange(
  transactions: FinancialTransaction[],
  start: Date,
  end: Date,
): number {
  return getChargesForRange(transactions, start, end);
}

/** Outstanding balance across all posted transactions, applying deposit
 *  semantics. Held deposit collection/refund do not affect the obligation;
 *  deposit application reduces it; forfeiture increases it. This is the
 *  authoritative outstanding computation shared with rental settlement. */
export function getOutstandingForRange(
  transactions: FinancialTransaction[],
): number {
  let total = 0;
  for (const t of transactions) {
    if (t.status !== "posted") continue;
    total += obligationSignedAmount(t);
  }
  return Math.max(0, total);
}

/** Collected revenue minus tracked fleet expenses (maintenance cost). */
export function getNetContributionForRange(
  transactions: FinancialTransaction[],
  maintenance: MaintenanceRecord[],
  start: Date,
  end: Date,
): number {
  const revenue = getCollectionsForRange(transactions, start, end);
  const expenses = maintenance
    .filter((m) => {
      const d = m.completed_date ?? m.scheduled_date;
      return (
        new Date(d + "T00:00:00") >= start && new Date(d + "T00:00:00") <= end
      );
    })
    .reduce((s, m) => s + (m.cost ?? 0), 0);
  return revenue - expenses;
}

/** Start of the current week (Monday). */
export function startOfWeek(now = new Date()): Date {
  const day = (now.getDay() + 6) % 7; // Monday = 0
  return startOfDay(new Date(now.getTime() - day * DAY));
}

/** First day of the current month. */
export function startOfMonth(now = new Date()): Date {
  return startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
}

/** Re-export for callers that need the deposit-aware obligation predicate. */
export { affectsRentalObligation };
