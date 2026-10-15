// Connect Pro Fleet — BillingPeriod factory + seed migration (Build #9 cleanup).
//
// Extracted from billingStore.tsx to keep that file under the size limit. Holds
// the makePeriod() factory and the non-destructive seed migration that maps
// historical weekly charges to BillingPeriods WITHOUT reposting them.

import type { BillingPeriod, BillingPeriodSource } from "./billingTypes";
import type { FinancialTransaction, RentalAgreement } from "./types";
import { periodDedupeKey } from "./billing";
import { uid, TENANT_ID } from "./store/ids";

const DAY = 86_400_000;

export function addDaysISO(iso: string, n: number): string {
  const d = new Date((iso ?? "") + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return new Date(d.getTime() + n * DAY).toISOString().slice(0, 10);
}

export function makePeriod(
  rental: RentalAgreement,
  seq: number,
  start: string,
  end: string,
  dueAt: string,
  txnId: string | null,
  source: BillingPeriodSource,
  baseAmount: number,
  frequency: BillingPeriod["billing_frequency"],
): BillingPeriod {
  const now = new Date().toISOString();
  return {
    id: uid("bp"),
    tenant_id: TENANT_ID,
    rental_id: rental.id,
    invoice_id: null,
    sequence_number: seq,
    period_start: start,
    period_end: end,
    due_at: dueAt,
    billing_frequency: frequency,
    rate_type: rental.rate_type,
    base_amount: baseAmount,
    additional_amount: 0,
    tax_amount: 0,
    fee_amount: 0,
    total_amount: baseAmount,
    status: "upcoming",
    generated_at: now,
    paid_at: null,
    dedupe_key: periodDedupeKey(rental.id, start, end),
    source,
    transaction_id: txnId,
    fee_transaction_ids: [],
    tax_transaction_ids: [],
    late_fee_applied: false,
    created_at: now,
    updated_at: now,
  };
}

/** Non-destructive migration: map historical weekly charges to BillingPeriods
 *  WITHOUT reposting them. Links the period to the existing charge. */
export function seedPeriods(
  rentals: RentalAgreement[],
  transactions: FinancialTransaction[],
): BillingPeriod[] {
  const out: BillingPeriod[] = [];
  for (const r of rentals) {
    if (["cancelled", "completed"].includes(r.status)) {
      const charge = transactions.find(
        (t) =>
          t.rental_id === r.id &&
          (t.transaction_type === "rental_charge" ||
            t.transaction_type === "weekly_rental_charge") &&
          t.status === "posted",
      );
      if (charge) {
        const start = r.checkout_date ?? charge.effective_date;
        const end = r.actual_return_date ?? r.scheduled_return_date ?? start;
        out.push(
          makePeriod(
            r,
            1,
            start,
            end,
            charge.effective_date,
            charge.id,
            "migrated",
            charge.amount,
            "weekly",
          ),
        );
      }
      continue;
    }
    const weeklyCharges = transactions
      .filter(
        (t) =>
          t.rental_id === r.id &&
          t.transaction_type === "weekly_rental_charge" &&
          t.status === "posted",
      )
      .sort((a, b) => (a.billing_period! < b.billing_period! ? -1 : 1));
    let seq = 0;
    for (const c of weeklyCharges) {
      seq++;
      const start = c.billing_period ?? c.effective_date;
      out.push(
        makePeriod(
          r,
          seq,
          start,
          addDaysISO(start, 6),
          start,
          c.id,
          "migrated",
          c.amount,
          "weekly",
        ),
      );
    }
    if (seq === 0 && r.rate_type === "weekly") {
      const start =
        r.checkout_date ?? r.next_payment_due ?? r.scheduled_return_date;
      out.push(
        makePeriod(
          r,
          1,
          start,
          addDaysISO(start, 6),
          start,
          null,
          "engine",
          r.rate_amount,
          "weekly",
        ),
      );
    }
  }
  return out;
}
