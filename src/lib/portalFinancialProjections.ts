// Connect Pro Fleet — Customer Portal financial projections (Build #32).
//
// Vehicle, rental, billing, and deposit projections. DERIVED from the
// authoritative billing selectors, ledger, deposit ledger, and rental
// lifecycle — never recomputed. Sensitive values masked.

import type { FleetStore } from "./store/storeContext";
import type { BillingPeriod } from "./billingTypes";
import type { PaymentArrangement } from "./paymentArrangementTypes";
import type { RentalAgreement, Vehicle, Location } from "./types";
import type {
  PortalVehicleView,
  PortalRentalView,
  PortalBillingView,
  PortalDepositView,
  PortalPaymentHistoryEntry,
  PortalBillingScheduleEntry,
  PortalChargeLine,
  PortalDepositHistoryEntry,
} from "./portalTypes";
import {
  PORTAL_RENTAL_STATUS_LABELS,
  PORTAL_DEPOSIT_STATUS_LABELS,
} from "./portalTypes";
import {
  getCustomerOutstandingBalance,
  getLateBillingPeriods,
} from "./billingSelectors";
import { isObligationLate } from "./lateEvaluator";
import { transactionTypeMeta } from "./format";
import { maskPlate, maskPaymentMethod } from "./portalMasking";

const ACTIVE_RENTAL_STATUSES = new Set([
  "active",
  "late",
  "overdue",
  "payment_due",
  "return_pending",
]);

export function projectVehicle(
  vehicle: Vehicle | undefined,
  locations: Location[],
): PortalVehicleView | null {
  if (!vehicle) return null;
  const loc = locations.find((l) => l.id === vehicle.location);
  return {
    id: vehicle.id,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    license_plate_masked: maskPlate(vehicle.license_plate),
    vehicle_type: vehicle.vehicle_type,
    current_mileage: vehicle.current_mileage ?? null,
    photo_url: vehicle.images[0]?.url ?? null,
    location_name: loc?.name ?? null,
  };
}

export function projectRental(
  rental: RentalAgreement,
  store: FleetStore,
): PortalRentalView {
  const vehicle = store.vehicles.find((v) => v.id === rental.vehicle_id);
  const locations = store.locations;
  const isOpenEnded = !rental.scheduled_return_date;
  return {
    id: rental.id,
    agreement_number: rental.agreement_number,
    status: rental.status,
    status_label: PORTAL_RENTAL_STATUS_LABELS[rental.status] ?? rental.status,
    vehicle: projectVehicle(vehicle, locations),
    checkout_date: rental.checkout_date,
    checkout_time: rental.checkout_time,
    scheduled_return_date: rental.scheduled_return_date,
    scheduled_return_time: rental.scheduled_return_time,
    is_open_ended: isOpenEnded,
    rate_type: rental.rate_type,
    rate_amount: rental.rate_amount,
    billing_cadence: rental.billing_config?.billing_frequency ?? null,
    pickup_location_name: vehicle
      ? (locations.find((l) => l.id === vehicle.location)?.name ?? null)
      : null,
    return_location_name: vehicle
      ? (locations.find((l) => l.id === vehicle.location)?.name ?? null)
      : null,
    policy_snapshot: rental.policy_snapshot ?? null,
  };
}

export function getActiveRentals(
  customerId: string,
  store: FleetStore,
): PortalRentalView[] {
  return store.rentals
    .filter(
      (r) =>
        r.customer_id === customerId && ACTIVE_RENTAL_STATUSES.has(r.status),
    )
    .map((r) => projectRental(r, store));
}

export function getPastRentals(
  customerId: string,
  store: FleetStore,
): PortalRentalView[] {
  return store.rentals
    .filter(
      (r) =>
        r.customer_id === customerId && !ACTIVE_RENTAL_STATUSES.has(r.status),
    )
    .map((r) => projectRental(r, store));
}

function periodBalance(
  p: BillingPeriod,
  transactions: FleetStore["transactions"],
  rentalId: string,
): number {
  const periodCharges = transactions
    .filter(
      (t) =>
        t.rental_id === rentalId &&
        t.category === "charge" &&
        t.status === "posted" &&
        (t.billing_period === p.id ||
          t.id === p.transaction_id ||
          p.fee_transaction_ids.includes(t.id) ||
          p.tax_transaction_ids.includes(t.id)),
    )
    .reduce((s, t) => s + t.amount, 0);
  const periodPayments = transactions
    .filter(
      (t) =>
        t.rental_id === rentalId &&
        t.category === "payment" &&
        t.status === "posted" &&
        t.billing_period === p.id,
    )
    .reduce((s, t) => s + t.amount, 0);
  const periodCredits = transactions
    .filter(
      (t) =>
        t.rental_id === rentalId &&
        (t.category === "credit" || t.category === "refund") &&
        t.status === "posted" &&
        t.billing_period === p.id,
    )
    .reduce((s, t) => s + t.amount, 0);
  return Math.max(0, periodCharges - periodPayments - periodCredits);
}

export function projectBilling(
  customerId: string,
  rental: RentalAgreement | null,
  store: FleetStore,
  billingPeriods: BillingPeriod[],
  arrangements: PaymentArrangement[],
  now: Date,
): PortalBillingView {
  const periods = billingPeriods.filter(
    (p) => p.rental_id === (rental?.id ?? "__none__"),
  );

  const currentBalance = rental
    ? getCustomerOutstandingBalance(
        customerId,
        [rental],
        periods,
        store.transactions,
      )
    : 0;

  const latePeriods = rental
    ? getLateBillingPeriods(periods, store.transactions, rental.id, rental, now)
    : [];
  const overdueAmount = latePeriods.reduce(
    (s, p) => s + periodBalance(p, store.transactions, rental!.id),
    0,
  );
  const postedLateFee = store.transactions
    .filter(
      (t) =>
        t.rental_id === rental?.id &&
        t.transaction_type === "late_fee" &&
        t.status === "posted",
    )
    .reduce((s, t) => s + t.amount, 0);

  const nextPeriod = rental
    ? periods
        .filter(
          (p) =>
            p.status !== "cancelled" &&
            p.status !== "waived" &&
            periodBalance(p, store.transactions, rental.id) > 0,
        )
        .sort((a, b) => a.due_at.localeCompare(b.due_at))[0]
    : undefined;

  const isOverdue = latePeriods.length > 0;

  const paymentTxns = store.transactions
    .filter(
      (t) =>
        t.customer_id === customerId &&
        t.category === "payment" &&
        t.status === "posted",
    )
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date));

  const paymentHistory: PortalPaymentHistoryEntry[] = paymentTxns.map((t) => {
    const r = store.rentals.find((rr) => rr.id === t.rental_id);
    const receipt = store.receipts.find(
      (rc) => rc.payment_transaction_id === t.id,
    );
    return {
      id: `pp_${t.id}`,
      date: t.effective_date,
      amount: t.amount,
      rental_agreement_number: r?.agreement_number ?? null,
      method_label: maskPaymentMethod(
        t.payment_method ?? null,
        t.external_transaction_id ?? null,
      ),
      status: "Posted",
      receipt_available: !!receipt,
    };
  });

  const billingSchedule: PortalBillingScheduleEntry[] = periods
    .filter((p) => p.status !== "cancelled" && p.status !== "waived")
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
    .map((p) => {
      const bal = periodBalance(p, store.transactions, rental?.id ?? "");
      const late = rental
        ? isObligationLate(
            {
              due_at: p.due_at,
              cutoff_time: rental.payment_cutoff_time ?? null,
              grace_period: rental.grace_period ?? 0,
            },
            now,
          ).late
        : false;
      let statusLabel = "Upcoming";
      if (bal <= 0) statusLabel = "Paid";
      else if (late) statusLabel = "Past Due";
      else if (p.status === "due") statusLabel = "Due";
      return {
        period_label: `Period ${p.sequence_number}`,
        due_date: p.due_at,
        due_time: rental?.payment_cutoff_time ?? null,
        amount: bal > 0 ? bal : p.total_amount,
        status: p.status,
        status_label: statusLabel,
      };
    });

  const chargeTxns = store.transactions
    .filter(
      (t) =>
        t.customer_id === customerId &&
        t.category === "charge" &&
        t.status === "posted",
    )
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  const chargeBreakdown: PortalChargeLine[] = chargeTxns.map((t) => ({
    description: t.description,
    category:
      transactionTypeMeta[t.transaction_type]?.label ?? t.transaction_type,
    amount: t.amount,
    date: t.effective_date,
  }));

  const totalCharges = chargeTxns.reduce((s, t) => s + t.amount, 0);
  const totalPayments = paymentTxns.reduce((s, t) => s + t.amount, 0);
  const totalCredits = store.transactions
    .filter(
      (t) =>
        t.customer_id === customerId &&
        (t.category === "credit" || t.category === "refund") &&
        t.status === "posted",
    )
    .reduce((s, t) => s + t.amount, 0);

  const arrangement = arrangements.find(
    (a) =>
      a.customer_id === customerId &&
      ["active", "broken", "pending"].includes(a.status),
  );
  // Derive the next upcoming installment from the store's arrangement
  // installments (PaymentArrangement has no next_payment_date field).
  const arrangementView = arrangement
    ? (() => {
        const inst = store.arrangementInstallments
          .filter((i) => i.arrangement_id === arrangement.id)
          .filter((i) => !i.paid_at)
          .sort((a, b) => a.due_date.localeCompare(b.due_date));
        const next = inst[0];
        return {
          status: arrangement.status,
          status_label:
            arrangement.status.charAt(0).toUpperCase() +
            arrangement.status.slice(1),
          next_payment_due: next?.due_date ?? null,
          next_payment_amount: next?.amount_due ?? null,
          is_broken: arrangement.status === "broken",
        };
      })()
    : null;

  return {
    current_balance: currentBalance,
    is_paid_up: currentBalance <= 0 && !isOverdue,
    next_payment_due_date: nextPeriod?.due_at ?? null,
    next_payment_due_time: rental?.payment_cutoff_time ?? null,
    next_payment_amount: nextPeriod
      ? periodBalance(nextPeriod, store.transactions, rental!.id)
      : null,
    is_overdue: isOverdue,
    overdue_amount: overdueAmount,
    overdue_original_due_date: latePeriods[0]?.due_at ?? null,
    posted_late_fee: postedLateFee,
    payment_history: paymentHistory,
    billing_schedule: billingSchedule,
    charge_breakdown: chargeBreakdown,
    total_charges: totalCharges,
    total_payments: totalPayments,
    total_credits: totalCredits,
    arrangement: arrangementView,
    payment_processing_available: false,
  };
}

function depositEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    required: "Deposit required",
    collected: "Deposit collected",
    held: "Deposit held",
    applied: "Deposit applied to charges",
    refund_pending: "Refund pending",
    refunded: "Deposit refunded",
    forfeited: "Deposit forfeited",
    overridden: "Deposit requirement overridden",
    cancelled: "Deposit cancelled",
    reversed: "Deposit action reversed",
  };
  return labels[eventType] ?? eventType;
}

export function projectDeposit(
  customerId: string,
  rental: RentalAgreement | null,
  store: FleetStore,
): PortalDepositView {
  const deposits = store.rentalDeposits.filter(
    (d) =>
      d.customer_id === customerId &&
      (rental ? d.rental_id === rental.id : true),
  );
  const deposit = deposits[0] ?? null;

  if (!deposit) {
    return {
      id: null,
      required_amount: rental?.deposit_amount ?? 0,
      held_amount: 0,
      applied_amount: 0,
      refunded_amount: 0,
      forfeited_amount: 0,
      status: rental?.deposit_amount ? "not_paid" : "not_required",
      status_label: rental?.deposit_amount ? "Not Paid" : "Not Required",
      history: [],
      application_reason: null,
    };
  }

  const history: PortalDepositHistoryEntry[] = store.depositHistory
    .filter((h) => h.deposit_id === deposit.id)
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((h) => ({
      event_type: h.event_type,
      label: depositEventLabel(h.event_type),
      amount: h.amount,
      at: h.at,
    }));

  const applicationReason =
    deposit.applied_amount > 0
      ? deposit.applied_amount >= deposit.collected_amount
        ? "Applied to outstanding charges"
        : "Partially applied to charges"
      : null;

  return {
    id: deposit.id,
    required_amount: deposit.required_amount,
    held_amount:
      deposit.collected_amount -
      deposit.applied_amount -
      deposit.refunded_amount -
      deposit.forfeited_amount,
    applied_amount: deposit.applied_amount,
    refunded_amount: deposit.refunded_amount,
    forfeited_amount: deposit.forfeited_amount,
    status: deposit.status,
    status_label:
      PORTAL_DEPOSIT_STATUS_LABELS[deposit.status] ?? deposit.status,
    history,
    application_reason: applicationReason,
  };
}
