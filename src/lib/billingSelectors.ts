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
//
// Day-boundary classification (due today / late / daysLate) is evaluated in
// the organization's configured timezone (`tz`), never the machine wall clock.

import {
  allocatePayments,
  nextPaymentDue,
  type AllocationResult,
  type PeriodAllocation,
} from "./billing";
import { isObligationLate } from "./lateEvaluator";
import type { BillingPeriod } from "./billingTypes";
import type { FinancialTransaction, RentalAgreement } from "./types";
import { startOfDayInTz, getOrgTimezone } from "./timezone";

const DAY = 86_400_000;

function startOfDay(d: Date, tz?: string): Date {
  return startOfDayInTz(d, getOrgTimezone(tz));
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
 *  the centralized exact-time evaluator: cutoff + grace). `tz` (org timezone)
 *  makes the cutoff/grace boundary org-local. */
export function getLateBillingPeriods(
  periods: BillingPeriod[],
  transactions: FinancialTransaction[],
  rentalId: string,
  rental?: RentalAgreement,
  now: Date = new Date(),
  tz?: string,
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
      tz,
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
 * `tz` (org timezone) makes the due-day boundary org-local.
 */
export function getPaymentObligations(
  rentals: RentalAgreement[],
  periods: BillingPeriod[],
  transactions: FinancialTransaction[],
  now: Date = new Date(),
  tz?: string,
): PaymentObligation[] {
  const today = startOfDay(now, tz);
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
      // Anchor the date-only due day at local noon before reading org parts.
      const due = startOfDay(new Date(p.due_at + "T12:00:00Z"), tz);
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
        tz,
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
