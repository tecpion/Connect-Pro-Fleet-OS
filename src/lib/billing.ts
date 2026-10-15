// Connect Pro Fleet — Universal rental billing engine (Build #3).
//
// Centralized domain logic for rental billing periods. Pure functions over
// store data — no duplicate state. The FinancialTransaction ledger remains
// the financial source of truth; BillingPeriods are schedule/obligation
// context layered on top.
//
// Key responsibilities:
//   - period date math (upfront / daily / weekly / biweekly / custom)
//   - idempotent period generation (dedupe by rental + period range)
//   - FIFO payment allocation across a rental's periods
//   - period status derivation from due date + allocated ledger
//   - late-fee eligibility per period
//   - next-payment-due derivation
//
// Designed to become Supabase queries + a scheduled function later.

import type {
  BillingPeriod,
  BillingPeriodStatus,
  BillingFrequency,
  CustomScheduleInstallment,
  RentalBillingConfig,
} from "./billingTypes";
import type { FinancialTransaction, RateType, RentalAgreement } from "./types";
import { affectsRentalObligation, isDepositHeldEvent } from "./deposit";
import { isObligationLate } from "./lateEvaluator";

const DAY = 86_400_000;

export const todayStr = () => new Date().toISOString().slice(0, 10);

function addDays(iso: string, n: number): string {
  return new Date(new Date(iso + "T00:00:00").getTime() + n * DAY)
    .toISOString()
    .slice(0, 10);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Stable dedupe identity for a billing period. */
export function periodDedupeKey(
  rentalId: string,
  periodStart: string,
  periodEnd: string,
): string {
  return `${rentalId}|${periodStart}|${periodEnd}`;
}

// ---------------------------------------------------------------------------
// Billing configuration resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a rental's effective billing config. Existing weekly rentals that
 * predate Build #3 have no explicit config — we migrate them non-destructively
 * by inferring "weekly" from their rate_type / weekly fields. Non-weekly
 * rentals without a config default to "upfront" (the whole agreed price due at
 * checkout).
 */
export function resolveBillingConfig(
  rental: RentalAgreement,
): RentalBillingConfig {
  // Explicit config on the rental wins.
  if (rental.billing_config) return rental.billing_config;

  // Migration: existing weekly rentals.
  if (rental.rate_type === "weekly" || rental.weekly_payment_day) {
    return {
      billing_frequency: "weekly",
      billing_anchor_date: rental.checkout_date ?? null,
      recurring_amount: rental.rate_amount,
      auto_generate_periods: true,
      custom_schedule: null,
    };
  }

  // Default for daily / custom / mixed rentals: pay in full upfront.
  return {
    billing_frequency: "upfront",
    billing_anchor_date: rental.checkout_date ?? null,
    recurring_amount: null,
    auto_generate_periods: true,
    custom_schedule: null,
  };
}

/** Suggest a sensible default billing frequency from the rental context. */
export function suggestBillingFrequency(
  rateType: RateType,
  durationDays: number,
  isOpenEnded: boolean,
): BillingFrequency {
  if (isOpenEnded || rateType === "weekly") return "weekly";
  if (durationDays <= 7) return "upfront";
  return "weekly";
}

// ---------------------------------------------------------------------------
// Period date math
// ---------------------------------------------------------------------------

export interface PeriodSpec {
  period_start: string;
  period_end: string;
  due_at: string;
  base_amount: number;
}

/**
 * Generate the period specs that SHOULD exist for a rental, up to a controlled
 * horizon. For recurring rentals we generate forward only as far as the
 * rental term (or a short horizon for open-ended rentals) — never thousands
 * of future periods.
 *
 * This is the "what periods should exist" view; the engine then reconciles it
 * against existing BillingPeriods (dedupe) and posts missing ledger charges.
 */
export function generatePeriodSpecs(
  rental: RentalAgreement,
  config: RentalBillingConfig,
  opts: { horizonDays?: number } = {},
): PeriodSpec[] {
  const anchor =
    config.billing_anchor_date ??
    rental.checkout_date ??
    rental.scheduled_return_date ??
    todayStr();
  const horizon = opts.horizonDays ?? 14; // generate up to ~2 weeks ahead
  const horizonDate = addDays(todayStr(), horizon);
  const termEnd =
    rental.scheduled_return_date && rental.scheduled_return_date.trim() !== ""
      ? rental.scheduled_return_date
      : null;
  // Cap generation at the rental term unless open-ended.
  const hardCap = termEnd && termEnd < horizonDate ? termEnd : horizonDate;

  const specs: PeriodSpec[] = [];

  if (config.billing_frequency === "upfront") {
    const end = termEnd ?? addDays(anchor, Math.max(1, rentalTermDays(rental)));
    specs.push({
      period_start: anchor,
      period_end: end,
      due_at: anchor,
      base_amount: rental.subtotal,
    });
    return specs;
  }

  if (config.billing_frequency === "custom" && config.custom_schedule) {
    for (const inst of config.custom_schedule) {
      // Only include installments within the generation horizon.
      if (inst.due_at > hardCap && inst.due_at > horizonDate) continue;
      specs.push({
        period_start: inst.due_at,
        period_end: inst.due_at,
        due_at: inst.due_at,
        base_amount: inst.amount,
      });
    }
    return specs;
  }

  // Recurring: daily / weekly / biweekly.
  const intervalDays =
    config.billing_frequency === "daily"
      ? 1
      : config.billing_frequency === "weekly"
        ? 7
        : config.billing_frequency === "biweekly"
          ? 14
          : 0;

  if (intervalDays <= 0) return specs;

  const recurring = config.recurring_amount ?? rental.rate_amount ?? 0;
  let seq = 0;
  let cursor = anchor;
  // Safety cap to avoid runaway generation.
  const maxPeriods = 400;
  while (seq < maxPeriods) {
    const start = cursor;
    const end = addDays(start, intervalDays - 1);
    const due = start;
    // Stop once we reach/pass the rental term end (fixed-term recurring) — a
    // period starting on the return date is not billable. Use >= so a 7-day
    // weekly rental generates exactly one period, not two.
    if (termEnd && start >= termEnd) break;
    // Don't generate periods far beyond the horizon for open-ended rentals.
    if (start > horizonDate && start > hardCap) break;
    specs.push({
      period_start: start,
      period_end: end,
      due_at: due,
      base_amount: recurring,
    });
    cursor = addDays(cursor, intervalDays);
    seq++;
  }
  return specs;
}

/** Rental term length in days (1 minimum). Open-ended rentals return 0. */
export function rentalTermDays(rental: RentalAgreement): number {
  if (!rental.scheduled_return_date) return 0;
  const start = rental.checkout_date ?? rental.scheduled_return_date;
  const ms =
    new Date(rental.scheduled_return_date + "T00:00:00").getTime() -
    new Date(start + "T00:00:00").getTime();
  return Math.max(1, Math.round(ms / DAY));
}

// ---------------------------------------------------------------------------
// FIFO payment allocation
// ---------------------------------------------------------------------------

/**
 * Allocate a rental's posted payments (and credits) against its billing
 * periods in chronological order (FIFO). Returns per-period paid amounts and
 * the remaining unallocated payment (overpayment).
 *
 * Charges that back a period are attributed to that period; charges with no
 * period (ad-hoc charges, late fees) are NOT allocated against recurring
 * periods — they sit on the rental's overall ledger balance. Payments flow
 * first to the earliest period with an outstanding balance, then to ad-hoc
 * charges, then to overpayment.
 */
export interface PeriodAllocation {
  periodId: string;
  paid: number;
  balance: number;
  status: BillingPeriodStatus;
}

export interface AllocationResult {
  allocations: Map<string, PeriodAllocation>;
  /** Payments applied to non-period charges (ad-hoc / late fees). */
  appliedToAdHoc: number;
  /** Overpayment beyond all charges. */
  overpayment: number;
}

export function allocatePayments(
  periods: BillingPeriod[],
  transactions: FinancialTransaction[],
  rentalId: string,
): AllocationResult {
  const rentalTxns = transactions.filter(
    (t) => t.rental_id === rentalId && t.status === "posted",
  );

  // Build #9 cleanup — a BillingPeriod's obligation is base + per-period fees +
  // per-period taxes. Each component posts as its own ledger charge linked to
  // the period via metadata.billing_period_id. We sum ALL linked charges to
  // get the authoritative period charge, so Payments Due / settlement / the
  // dashboard never disagree with the ledger.
  const periodByTxn = new Map<string, BillingPeriod>();
  for (const p of periods) {
    if (p.transaction_id) periodByTxn.set(p.transaction_id, p);
    for (const fid of p.fee_transaction_ids ?? []) periodByTxn.set(fid, p);
    for (const tid of p.tax_transaction_ids ?? []) periodByTxn.set(tid, p);
  }

  let paymentPool = 0;
  let adHocCharges = 0;
  const periodChargeTotal = new Map<string, number>();
  for (const p of periods) periodChargeTotal.set(p.id, 0);

  for (const t of rentalTxns) {
    // Build #8 cleanup — deposit semantics: held collection/refund do NOT
    // enter the obligation pool; application acts like a payment; forfeiture
    // acts like a charge. Gate every entry through affectsRentalObligation.
    if (!affectsRentalObligation(t)) continue;
    if (t.category === "charge") {
      const p = periodByTxn.get(t.id);
      if (p) {
        // Sum the actual posted component charges (authoritative).
        periodChargeTotal.set(
          p.id,
          (periodChargeTotal.get(p.id) ?? 0) + t.amount,
        );
      } else {
        adHocCharges += t.amount;
      }
    } else if (t.category === "payment" || t.category === "credit") {
      // Includes deposit applications (category credit, affects obligation).
      paymentPool += t.amount;
    } else if (t.category === "refund") {
      adHocCharges += t.amount;
    }
  }
  void isDepositHeldEvent;

  const allocations = new Map<string, PeriodAllocation>();
  const ordered = [...periods].sort((a, b) => {
    const seqDiff = a.sequence_number - b.sequence_number;
    if (seqDiff !== 0) return seqDiff;
    return a.due_at < b.due_at ? -1 : 1;
  });

  for (const p of ordered) {
    const charge = periodChargeTotal.get(p.id) ?? p.total_amount;
    const paid = Math.min(charge, Math.max(0, paymentPool));
    paymentPool -= paid;
    allocations.set(p.id, {
      periodId: p.id,
      paid,
      balance: Math.max(0, charge - paid),
      status: periodStatus(p, paid, charge),
    });
  }

  const appliedToAdHoc = Math.min(adHocCharges, Math.max(0, paymentPool));
  paymentPool -= appliedToAdHoc;
  const overpayment = Math.max(0, paymentPool);

  return { allocations, appliedToAdHoc, overpayment };
}

/** Derive a period's status from its due date and allocated paid/balance. */
export function periodStatus(
  period: BillingPeriod,
  paid: number,
  charge: number,
): BillingPeriodStatus {
  if (period.status === "cancelled" || period.status === "waived")
    return period.status;
  const balance = Math.max(0, charge - paid);
  const today = todayStr();
  if (balance <= 0) return "paid";
  if (paid > 0) {
    return period.due_at < today ? "past_due" : "partially_paid";
  }
  // Nothing paid yet.
  if (period.due_at < today) return "past_due";
  if (period.due_at === today) return "due";
  return "upcoming";
}

// ---------------------------------------------------------------------------
// Next payment due
// ---------------------------------------------------------------------------

/**
 * Derive the next payment due date from a rental's billing periods: the
 * earliest period that is not fully paid and not cancelled. Returns null when
 * nothing is outstanding (e.g. an upfront rental that's been satisfied).
 */
export function nextPaymentDue(
  periods: BillingPeriod[],
  allocations: Map<string, PeriodAllocation>,
): string | null {
  const candidates = [...periods]
    .filter(
      (p) =>
        p.status !== "cancelled" &&
        p.status !== "waived" &&
        (allocations.get(p.id)?.balance ?? p.total_amount) > 0,
    )
    .sort((a, b) => (a.due_at < b.due_at ? -1 : 1));
  return candidates[0]?.due_at ?? null;
}

// ---------------------------------------------------------------------------
// Late-fee eligibility
// ---------------------------------------------------------------------------

export interface LateFeeEligibility {
  eligible: boolean;
  reason: string;
}

/**
 * A period is eligible for a late fee when it is authoritatively late
 * (centralized exact-time evaluator: cutoff + grace, payable THROUGH the
 * cutoff), has an outstanding balance, and no late fee has already been
 * applied to it (dedupe). Uses the rental's grace_period (hours) and
 * payment_cutoff_time ("HH:MM").
 */
export function lateFeeEligibility(
  period: BillingPeriod,
  allocation: PeriodAllocation | undefined,
  rental: RentalAgreement,
  now = new Date(),
): LateFeeEligibility {
  if (period.late_fee_applied)
    return { eligible: false, reason: "Late fee already applied." };
  if (rental.late_fee <= 0)
    return { eligible: false, reason: "No late fee configured." };
  const balance = allocation?.balance ?? period.total_amount;
  if (balance <= 0) return { eligible: false, reason: "Period is paid." };

  const result = isObligationLate(
    {
      due_at: period.due_at,
      cutoff_time: rental.payment_cutoff_time ?? null,
      grace_period: rental.grace_period ?? 0,
    },
    now,
  );
  if (!result.late)
    return { eligible: false, reason: "Still within grace window." };
  return { eligible: true, reason: "Past due beyond grace." };
}

// ---------------------------------------------------------------------------
// Rental-level late status
// ---------------------------------------------------------------------------

/**
 * Determine whether a rental should be in a late/overdue state based on its
 * billing periods, using the SAME centralized exact-time evaluator as
 * late-fee eligibility (cutoff + grace). One old unpaid late period keeps the
 * rental late even if a newer period exists.
 *
 * Returns the suggested rental status (only for late-family transitions;
 * callers decide whether to apply it).
 */
export function rentalLateStatus(
  periods: BillingPeriod[],
  allocations: Map<string, PeriodAllocation>,
  rental: RentalAgreement,
  now = new Date(),
): "late" | "overdue" | null {
  let worst: "late" | "overdue" | null = null;
  for (const p of periods) {
    if (p.status === "cancelled" || p.status === "waived") continue;
    const balance = allocations.get(p.id)?.balance ?? p.total_amount;
    if (balance <= 0) continue;
    const result = isObligationLate(
      {
        due_at: p.due_at,
        cutoff_time: rental.payment_cutoff_time ?? null,
        grace_period: rental.grace_period ?? 0,
      },
      now,
    );
    if (!result.late) continue;
    // How far past the late-since instant, in days.
    const daysLate = Math.max(
      1,
      Math.round((now.getTime() - result.late_since_ms) / DAY),
    );
    const graceDays = Math.ceil((rental.grace_period ?? 0) / 24);
    const severity: "late" | "overdue" =
      daysLate > Math.max(1, graceDays) ? "overdue" : "late";
    if (severity === "overdue") return "overdue";
    worst = severity;
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Custom schedule helpers
// ---------------------------------------------------------------------------

/** Total of a custom schedule's installments. */
export function customScheduleTotal(
  schedule: CustomScheduleInstallment[] | null,
): number {
  if (!schedule) return 0;
  return schedule.reduce((s, i) => s + i.amount, 0);
}
