// Connect Pro Fleet — Authoritative billing selectors (Build #4).
//
// ONE allocation path used by Dashboard, Payments Due, and Rental Detail.
// These wrap billing.ts's allocatePayments so components never re-implement
// FIFO allocation independently. Pure functions over store data — no state.
//
// Late classification (getLateBillingPeriods, getPaymentObligations) consumes
// the SAME centralized exact-time evaluator (lateEvaluator) as the billing
// engine's lateFeeEligibility / rentalLateStatus, so Payments Due can never
// disagree with the billing engine about whether an obligation is late.

import {
  allocatePayments,
  nextPaymentDue,
  type AllocationResult,
  type PeriodAllocation,
} from "./billing";
import { isObligationLate } from "./lateEvaluator";
import type { BillingPeriod } from "./billingTypes";
import type { FinancialTransaction, RentalAgreement } from "./types";

const DAY = 86_400_000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Full allocation result for a rental (delegates to the single FIFO engine). */
export function getRentalAllocation(
  periods: BillingPeriod[],
  transactions: FinancialTransaction[],
  rentalId: string,
): AllocationResult {
  return allocatePayments(periods, transactions, rentalId);
}

/** Per-period balance for a single billing period (authoritative). */
export function getBillingPeriodBalance(
  period: BillingPeriod,
  allocation: PeriodAllocation | undefined,
): number {
  return allocation?.balance ?? period.total_amount;
}

/** Next payment due for a rental (earliest outstanding, non-cancelled period). */
export function getNextPaymentDue(
  periods: BillingPeriod[],
  transactions: FinancialTransaction[],
  rentalId: string,
): string | null {
  const alloc = allocatePayments(periods, transactions, rentalId);
  return nextPaymentDue(periods, alloc.allocations);
}

/** Late billing periods for a rental (outstanding + authoritatively late via
 *  the centralized exact-time evaluator: cutoff + grace). */
export function getLateBillingPeriods(
  periods: BillingPeriod[],
  transactions: FinancialTransaction[],
  rentalId: string,
  rental?: RentalAgreement,
  now: Date = new Date(),
): BillingPeriod[] {
  const alloc = allocatePayments(periods, transactions, rentalId);
  return periods.filter((p) => {
    if (p.status === "cancelled" || p.status === "waived") return false;
    const balance = alloc.allocations.get(p.id)?.balance ?? p.total_amount;
    if (balance <= 0) return false;
    return isObligationLate(
      {
        due_at: p.due_at,
        cutoff_time: rental?.payment_cutoff_time ?? null,
        grace_period: rental?.grace_period ?? 0,
      },
      now,
    ).late;
  });
}

export interface PaymentObligation {
  rentalId: string;
  period: BillingPeriod;
  amountDue: number;
  paid: number;
  daysLate: number;
  bucket: "due_today" | "due_tomorrow" | "late" | "upcoming" | "paid_week";
}

/**
 * Authoritative payment-obligation derivation across ALL billing frequencies.
 * Uses allocatePayments (the single FIFO engine) so Dashboard, Payments Due,
 * and Rental Detail never disagree. Returns one entry per outstanding period.
 */
export function getPaymentObligations(
  rentals: RentalAgreement[],
  periods: BillingPeriod[],
  transactions: FinancialTransaction[],
  now: Date = new Date(),
): PaymentObligation[] {
  const today = startOfDay(now);
  const out: PaymentObligation[] = [];
  for (const r of rentals) {
    if (["cancelled", "completed"].includes(r.status)) continue;
    const rPeriods = periods
      .filter(
        (p) =>
          p.rental_id === r.id &&
          p.status !== "cancelled" &&
          p.status !== "waived",
      )
      .sort((a, b) =>
        a.sequence_number === b.sequence_number
          ? a.due_at < b.due_at
            ? -1
            : 1
          : a.sequence_number - b.sequence_number,
      );
    if (rPeriods.length === 0) continue;
    const alloc = allocatePayments(rPeriods, transactions, r.id);
    for (const p of rPeriods) {
      const a = alloc.allocations.get(p.id);
      const balance = a?.balance ?? p.total_amount;
      const paid = a?.paid ?? 0;
      const due = new Date(p.due_at + "T00:00:00");
      const diff = Math.round((due.getTime() - today.getTime()) / DAY);
      // Authoritative lateness uses the centralized exact-time evaluator
      // (cutoff + grace) so Payments Due agrees with the billing engine.
      const late = isObligationLate(
        {
          due_at: p.due_at,
          cutoff_time: r.payment_cutoff_time ?? null,
          grace_period: r.grace_period ?? 0,
        },
        now,
      ).late;
      let bucket: PaymentObligation["bucket"];
      if (balance <= 0) bucket = "upcoming";
      else if (late) bucket = "late";
      else if (diff < 0) bucket = "late";
      else if (diff === 0) bucket = "due_today";
      else if (diff === 1) bucket = "due_tomorrow";
      else bucket = "upcoming";
      const daysLate =
        bucket === "late"
          ? Math.max(1, Math.round((today.getTime() - due.getTime()) / DAY))
          : 0;
      out.push({
        rentalId: r.id,
        period: p,
        amountDue: balance,
        paid,
        daysLate,
        bucket,
      });
    }
  }
  return out;
}

/** A customer's outstanding balance across all their rentals' billing periods. */
export function getCustomerOutstandingBalance(
  customerId: string,
  rentals: RentalAgreement[],
  periods: BillingPeriod[],
  transactions: FinancialTransaction[],
): number {
  const customerRentals = rentals.filter((r) => r.customer_id === customerId);
  let total = 0;
  for (const r of customerRentals) {
    const rPeriods = periods.filter((p) => p.rental_id === r.id);
    const alloc = allocatePayments(rPeriods, transactions, r.id);
    for (const p of rPeriods) {
      if (p.status === "cancelled" || p.status === "waived") continue;
      total += alloc.allocations.get(p.id)?.balance ?? p.total_amount;
    }
  }
  return total;
}
