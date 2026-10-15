// Connect Pro Fleet — Executive Dashboard financial selectors (Build #30).
//
// DERIVED from the authoritative financial selectors (Build #5/#16) + the
// exact-time late evaluator (Build #21) + the billing selectors. Never
// recomputes balance/lateness/collections truth. Collections ≠ profit: cash
// collected and billed revenue are kept distinct. Amounts are permission-gated
// (null when the viewer lacks financial permission) BEFORE forming the answer.

import type { FinancialTransaction } from "./chargeTypes";
import type { MaintenanceRecord, RentalAgreement } from "./types";
import type { BillingPeriod } from "./billingTypes";
import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
} from "./paymentArrangementTypes";
import type { FinancialSnapshot } from "./executiveTypes";
import type { ExecutiveViewerPermissions } from "./executiveTypes";
import type { TrendDirection } from "./executiveTypes";
import {
  getCollectionsForRange,
  getChargesForRange,
  getOutstandingForRange,
} from "./financialSelectors";
import { getPaymentObligations } from "./billingSelectors";
import { isObligationLate } from "./lateEvaluator";
import {
  getBrokenArrangements,
  deriveArrangementStatus,
} from "./paymentArrangements";
import { isDepositHeldEvent } from "./deposit";

const DAY = 86_400_000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Equivalent immediately-preceding period for trend comparison. */
export function precedingRange(
  start: Date,
  end: Date,
): { start: Date; end: Date } {
  const duration = end.getTime() - start.getTime();
  return {
    start: new Date(start.getTime() - duration - DAY),
    end: new Date(start.getTime() - DAY),
  };
}

/** Safe percent change: handles prior = 0 without Infinity/NaN. */
export function safePercentChange(
  current: number,
  prior: number,
): {
  direction: TrendDirection;
  percent: number | null;
} {
  if (prior === 0) {
    return {
      direction: current > 0 ? "up" : current < 0 ? "down" : "flat",
      percent: null,
    };
  }
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  const direction: TrendDirection =
    Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down";
  return { direction, percent: Math.round(pct * 10) / 10 };
}

/** Collections — money actually received (posted payments, excl. held deposits). */
export function getCollections(
  transactions: FinancialTransaction[],
  start: Date,
  end: Date,
): number {
  return getCollectionsForRange(transactions, start, end);
}

/** Billed revenue — charges generated (excl. held deposits, incl. forfeitures). */
export function getBilledRevenue(
  transactions: FinancialTransaction[],
  start: Date,
  end: Date,
): number {
  return getChargesForRange(transactions, start, end);
}

/** Outstanding balance across all posted transactions (deposit-aware). */
export function getOutstandingBalance(
  transactions: FinancialTransaction[],
): number {
  return getOutstandingForRange(transactions);
}

/** Overdue accounts — authoritatively past cutoff + grace. Returns balance +
 *  count + oldest age. Uses the exact-time late evaluator (no new formula). */
export function getOverdueExposure(
  rentals: RentalAgreement[],
  billingPeriods: BillingPeriod[],
  transactions: FinancialTransaction[],
  asOf: Date,
): { balance: number; count: number; oldest_age_days: number } {
  const obligations = getPaymentObligations(
    rentals,
    billingPeriods,
    transactions,
    asOf,
  );
  const late = obligations.filter((o) => o.bucket === "late");
  let oldestAge = 0;
  for (const o of late) {
    const r = rentals.find((x) => x.id === o.rentalId);
    const cutoff = r?.payment_cutoff_time ?? null;
    const grace = r?.grace_period ?? 0;
    const lateResult = isObligationLate(
      { due_at: o.period.due_at, cutoff_time: cutoff, grace_period: grace },
      asOf,
    );
    if (lateResult.late) {
      const age = Math.max(
        1,
        Math.round((asOf.getTime() - lateResult.due_at_ms) / DAY),
      );
      if (age > oldestAge) oldestAge = age;
    }
  }
  return {
    balance: late.reduce((s, o) => s + o.amountDue, 0),
    count: late.length,
    oldest_age_days: oldestAge,
  };
}

/** Collection rate = collections / billed obligations due for the period.
 *  Documented definition: cash collected ÷ charges that came due. Returns null
 *  when the denominator is 0 (no obligations due) so we never divide by zero. */
export function getCollectionRate(
  transactions: FinancialTransaction[],
  start: Date,
  end: Date,
): number | null {
  const collections = getCollectionsForRange(transactions, start, end);
  const chargesDue = getChargesForRange(transactions, start, end);
  if (chargesDue === 0) return null;
  return Math.round((collections / chargesDue) * 1000) / 10;
}

/** Payments received today (positive context). Excludes reversed/voided. */
export function getPaymentsReceivedToday(
  transactions: FinancialTransaction[],
  asOf: Date,
): { count: number; amount: number } {
  const today = asOf.toISOString().slice(0, 10);
  let count = 0;
  let amount = 0;
  for (const t of transactions) {
    if (t.category !== "payment") continue;
    if (t.status !== "posted") continue;
    if (isDepositHeldEvent(t)) continue;
    if (t.effective_date !== today) continue;
    count++;
    amount += t.amount;
  }
  return { count, amount };
}

/** Arrangement metrics — active + broken + outstanding balance. */
export function getArrangementMetrics(
  arrangements: PaymentArrangement[],
  installments: PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
): {
  active_count: number;
  broken_count: number;
  balance: number;
} {
  const byArr = (id: string) =>
    installments.filter((i) => i.arrangement_id === id);
  // "Active" = arrangement not cancelled/completed/broken. Derived from the
  // authoritative installment/ledger state via deriveArrangementStatus — no
  // separate persisted status is introduced.
  const active = arrangements.filter(
    (a) => deriveArrangementStatus(a, byArr(a.id), transactions) === "active",
  );
  const broken = getBrokenArrangements(arrangements, byArr, transactions);
  let balance = 0;
  for (const a of active) {
    const insts = byArr(a.id);
    balance += insts.reduce((s, i) => s + (i.amount_due ?? 0), 0);
  }
  return { active_count: active.length, broken_count: broken.length, balance };
}

/** Build the financial snapshot — permission-gated BEFORE forming. */
export function buildFinancialSnapshot(
  transactions: FinancialTransaction[],
  maintenance: MaintenanceRecord[],
  rentals: RentalAgreement[],
  billingPeriods: BillingPeriod[],
  arrangements: PaymentArrangement[],
  installments: PaymentArrangementInstallment[],
  range: { start: Date; end: Date; as_of: Date },
  perms: ExecutiveViewerPermissions,
): FinancialSnapshot {
  const { start, end, as_of } = range;
  const canMoney = perms.canViewFinancials;

  const collections = getCollections(transactions, start, end);
  const billedRevenue = getBilledRevenue(transactions, start, end);
  const outstanding = getOutstandingBalance(transactions);
  const overdue = getOverdueExposure(
    rentals,
    billingPeriods,
    transactions,
    as_of,
  );
  const collectionRate = getCollectionRate(transactions, start, end);
  const receivedToday = getPaymentsReceivedToday(transactions, as_of);
  const arrMetrics = getArrangementMetrics(
    arrangements,
    installments,
    transactions,
  );

  // Prior-period collections for trend.
  const prior = precedingRange(start, end);
  const priorCollections = getCollections(transactions, prior.start, prior.end);
  const trend = safePercentChange(collections, priorCollections);

  return {
    collections: canMoney ? collections : null,
    billed_revenue: canMoney ? billedRevenue : null,
    outstanding_balance: canMoney ? outstanding : null,
    overdue_balance: canMoney ? overdue.balance : null,
    overdue_count: overdue.count,
    oldest_overdue_age_days: overdue.oldest_age_days,
    collection_rate: canMoney ? collectionRate : null,
    arrangement_active_count: arrMetrics.active_count,
    arrangement_broken_count: arrMetrics.broken_count,
    arrangement_balance: canMoney ? arrMetrics.balance : null,
    payments_received_today_count: receivedToday.count,
    payments_received_today_amount: canMoney ? receivedToday.amount : null,
    prior_collections: canMoney ? priorCollections : null,
    collections_trend: trend.direction,
    collections_trend_percent: trend.percent,
  };
}
