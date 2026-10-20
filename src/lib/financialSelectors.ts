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
//
// Business-calendar ranges (this week, this month, a custom [start,end]) are
// evaluated in the organization's configured timezone (`tz`), never the
// machine wall clock.

import type { FinancialTransaction, MaintenanceRecord } from "./types";
import {
  affectsRentalObligation,
  isDepositHeldEvent,
  obligationSignedAmount,
} from "./deposit";
import { startOfDayInTz, startOfWeekInTz, startOfMonthInTz } from "./timezone";

const DAY = 86_400_000;

function startOfDay(d: Date, tz?: string): Date {
  if (tz) return startOfDayInTz(d, tz);
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inRange(
  t: FinancialTransaction,
  start: Date,
  end: Date,
  tz?: string,
): boolean {
  // Anchor date-only effective_date at local noon before reading org parts.
  const d = startOfDay(new Date(t.effective_date + "T12:00:00Z"), tz);
  return d >= start && d <= end;
}

/** Money actually received (posted payments) within [start, end].
 *  Excludes held deposit collections — held deposits are not rental revenue.
 *  Deposit applications are not cash received (they re-allocate held money).
 *  `tz` (org timezone) makes the range boundaries org-local. */
export function getCollectionsForRange(
  transactions: FinancialTransaction[],
  start: Date,
  end: Date,
  tz?: string,
): number {
  return transactions
    .filter(
      (t) =>
        t.category === "payment" &&
        t.status === "posted" &&
        !isDepositHeldEvent(t) &&
        inRange(t, start, end, tz),
    )
    .reduce((s, t) => s + t.amount, 0);
}

/** Rental obligations/charges generated within [start, end] (billed revenue).
 *  Excludes held deposit collections; INCLUDES forfeitures (recognized revenue).
 *  `tz` (org timezone) makes the range boundaries org-local. */
export function getChargesForRange(
  transactions: FinancialTransaction[],
  start: Date,
  end: Date,
  tz?: string,
): number {
  return transactions
    .filter(
      (t) =>
        t.category === "charge" &&
        t.status === "posted" &&
        !isDepositHeldEvent(t) &&
        inRange(t, start, end, tz),
    )
    .reduce((s, t) => s + t.amount, 0);
}

/** Rental revenue (charges) recognized within [start, end]. `tz` is the org
 *  timezone for range boundaries. */
export function getRentalRevenueForRange(
  transactions: FinancialTransaction[],
  start: Date,
  end: Date,
  tz?: string,
): number {
  return getChargesForRange(transactions, start, end, tz);
}

/** Outstanding balance across all posted transactions, applying deposit
 *  semantics. Held deposit collection/refund do not affect the obligation;
 *  deposit application reduces it; forfeiture increases it. This is the
 *  authoritative outstanding computation shared with rental settlement.
 *  No day boundary involved — a pure ledger sum, so timezone-independent. */
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

/** Collected revenue minus tracked fleet expenses (maintenance cost). `tz`
 *  (org timezone) makes the range boundaries org-local. */
export function getNetContributionForRange(
  transactions: FinancialTransaction[],
  maintenance: MaintenanceRecord[],
  start: Date,
  end: Date,
  tz?: string,
): number {
  const revenue = getCollectionsForRange(transactions, start, end, tz);
  const expenses = maintenance
    .filter((m) => {
      const d = m.completed_date ?? m.scheduled_date;
      return inRange(
        { effective_date: d } as FinancialTransaction,
        start,
        end,
        tz,
      );
    })
    .reduce((s, m) => s + (m.cost ?? 0), 0);
  return revenue - expenses;
}

/** Start of the current week (Monday), in the org timezone when `tz` is set. */
export function startOfWeek(now = new Date(), tz?: string): Date {
  if (tz) return startOfWeekInTz(now, tz);
  const day = (now.getDay() + 6) % 7; // Monday = 0
  return startOfDay(new Date(now.getTime() - day * DAY));
}

/** First day of the current month, in the org timezone when `tz` is set. */
export function startOfMonth(now = new Date(), tz?: string): Date {
  if (tz) return startOfMonthInTz(now, tz);
  return startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
}

/** Re-export for callers that need the deposit-aware obligation predicate. */
export { affectsRentalObligation };
