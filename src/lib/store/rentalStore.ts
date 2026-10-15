// Connect Pro Fleet — rental core lifecycle (Build #5): convert, checkout,
// return. Pricing snapshots are frozen at checkout so later Settings/Class
// changes never alter active rentals. Build #9: checkout posts start-time
// fees + taxes idempotently via the tax/fee engine. Build #14 cleanup:
// recordRentalPayment accepts a canonical TenderMethod + optional processor
// (or a legacy method label) and forwards them to the authoritative ledger
// postPayment, which persists them for collection reporting.

import { fmtMoney } from "../format";
import type { RentalAgreement, RentalEvent, PaymentMethod } from "../types";
import type { TenderMethod, PaymentProcessor } from "../paymentMethodTypes";
import type { RentalBillingConfig } from "../billingTypes";
import type { ChargeLine } from "../taxFeeTypes";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";
import { resolveSystemTasks } from "./taskResolution";
import {
  emitRentalStarted,
  emitRentalCompleted,
} from "./rentalIntegrationEmission";
import { getCompanyPoliciesRef } from "./companyPolicyRef";
import { freezeRentalPolicySnapshot } from "../companyPolicy";

const DAY = 86_400_000;

const METHOD_LABEL_TO_PAYMENT_METHOD: Record<string, PaymentMethod> = {
  Card: "card",
  Cash: "cash",
  ACH: "ach",
  Zelle: "zelle",
  "Cash App": "cashapp",
  External: "external",
  Other: "other",
};

export function buildRentalMethods(
  s: StoreState,
  ledger: {
    postPayment: (
      rentalId: string,
      amount: number,
      method: PaymentMethod | TenderMethod,
      opts?: {
        reference?: string;
        notes?: string;
        effectiveDate?: string;
        invoiceId?: string;
        processor?: PaymentProcessor | null;
        paymentSource?: string | null;
      },
    ) => number;
  },
  deposits?: {
    linkDepositToRental: (reservationId: string, rentalId: string) => void;
    markRefundPending: (depositId: string) => void;
  },
  taxFee?: {
    postStartCharges: (input: {
      rentalId: string;
      customerId: string;
      vehicleId?: string | null;
      reservationId?: string | null;
      locationId?: string | null;
      effectiveDate: string;
      baseCharges: ChargeLine[];
      taxExempt?: boolean;
    }) => { feeTxnIds: string[]; taxTxnIds: string[] };
  },
) {
  function addEvent(e: RentalEvent) {
    s.setRentalEvents((es) => [e, ...es]);
  }
  function logAct(
    label: string,
    tone: "neutral" | "available" | "maintenance" | "out" = "neutral",
  ) {
    s.setActivity((a) =>
      [
        { id: uid("act"), at: new Date().toISOString(), label, tone },
        ...a,
      ].slice(0, 30),
    );
  }

  return {
    addRental: (r: RentalAgreement) => s.setRentals((rs) => [r, ...rs]),
    updateRental: (id: string, patch: Partial<RentalAgreement>) =>
      s.setRentals((rs) =>
        rs.map((r) =>
          r.id === id
            ? { ...r, ...patch, updated_at: new Date().toISOString() }
            : r,
        ),
      ),
    addRentalEvent: addEvent,

    // Record a payment against a rental via the authoritative shared ledger
    // `postPayment` (Build #5 cleanup — no internal state cast). Build #14:
    // accepts a canonical TenderMethod (+ optional processor) OR a legacy
    // method label string ("Card", "Cash", …) from older callers. The ledger
    // persists the canonical tender/processor in metadata for reporting.
    // Returns the new balance.
    recordRentalPayment: (
      id: string,
      amount: number,
      method?: string | TenderMethod,
      opts?: {
        processor?: PaymentProcessor | null;
        reference?: string;
        notes?: string;
      },
    ): number => {
      // If the caller passed a canonical TenderMethod, use it directly.
      const isCanonical = [
        "cash",
        "zelle",
        "cash_app",
        "apple_pay",
        "venmo",
        "ach",
        "bank_transfer",
        "check",
        "debit_card",
        "credit_card",
        "paypal",
        "other",
      ].includes(method as string);
      const tender = isCanonical
        ? (method as TenderMethod)
        : (method && METHOD_LABEL_TO_PAYMENT_METHOD[method]) || "card";
      return ledger.postPayment(id, amount, tender, {
        processor: opts?.processor ?? null,
        reference: opts?.reference,
        notes: opts?.notes,
      });
    },

    convertReservationToRental: (reservationId: string): string | null => {
      const res = s.reservations.find((r) => r.id === reservationId);
      if (!res) return null;
      if (res.converted_to_rental_id) return res.converted_to_rental_id;
      if (res.status === "cancelled" || res.status === "blocked_license")
        return null;

      const vehicle = s.vehicles.find((v) => v.id === res.vehicle_id);
      const snap = res.pricing_snapshot;
      const days = Math.max(
        1,
        Math.round(
          (new Date(res.end_date).getTime() -
            new Date(res.start_date).getTime()) /
            DAY,
        ),
      );
      const isWeekly = snap
        ? snap.recommended_rate_type === "weekly" ||
          snap.recommended_rate_type === "mixed" ||
          days >= 7
        : days >= 7;
      const rateType = snap
        ? snap.recommended_rate_type === "weekly" ||
          snap.recommended_rate_type === "mixed"
          ? "weekly"
          : snap.recommended_rate_type === "daily"
            ? "daily"
            : isWeekly
              ? "weekly"
              : "daily"
        : isWeekly
          ? "weekly"
          : "daily";
      const rateAmount = snap
        ? rateType === "weekly"
          ? snap.weekly_rate || vehicle?.weekly_rate || res.total_price
          : snap.daily_rate || vehicle?.daily_rate || res.total_price
        : isWeekly
          ? (vehicle?.weekly_rate ?? res.total_price)
          : (vehicle?.daily_rate ?? res.total_price);
      const resAddons = s.addons.filter((a) => a.reservation_id === res.id);
      const addonTotal = resAddons.reduce(
        (sum, a) => sum + a.price * a.quantity,
        0,
      );
      const subtotal = res.total_price;
      const balanceDue = Math.max(0, subtotal + addonTotal - res.amount_paid);
      const rentalId = uid("rnt");
      const now = new Date().toISOString();
      const year = new Date().getFullYear();
      const seq = String(127 + s.rentals.length).padStart(6, "0");
      const agreementNumber = `AGR-${year}-${seq}`;

      // Build #23 — company policy drives the authoritative cutoff / grace /
      // late-fee terms for new rentals. The late evaluator (Build #21) consumes
      // these fields, so a company's 2 PM cutoff flows through to lateness.
      const companyPolicy = getCompanyPoliciesRef();
      const depositAmount = res.deposit_amount;
      const policySnapshot = freezeRentalPolicySnapshot(companyPolicy, {
        depositAmount,
        depositSource: "company",
        mileage: companyPolicy.mileage,
        mileageSource: "company",
        fuel: companyPolicy.fuel,
        fuelSource: "company",
      });
      const rental: RentalAgreement = {
        id: rentalId,
        tenant_id: TENANT_ID,
        reservation_id: res.id,
        customer_id:
          res.customer_id ??
          s.customers.find(
            (c) => c.email.toLowerCase() === res.renter_email.toLowerCase(),
          )?.id ??
          "",
        vehicle_id: res.vehicle_id,
        agreement_number: agreementNumber,
        status: "ready_for_checkout",
        checkout_date: null,
        checkout_time: null,
        scheduled_return_date: res.end_date,
        scheduled_return_time: "17:00",
        actual_return_date: null,
        actual_return_time: null,
        rate_type: rateType,
        rate_amount: rateAmount,
        subtotal,
        tax: 0,
        fees: addonTotal,
        discount: 0,
        deposit_amount: depositAmount,
        amount_paid: res.amount_paid,
        balance_due: balanceDue,
        mileage_out: vehicle?.current_mileage ?? null,
        mileage_in: null,
        fuel_out: null,
        fuel_in: null,
        weekly_payment_day: isWeekly ? "Monday" : null,
        next_payment_due: isWeekly
          ? new Date(new Date(res.start_date).getTime() + 7 * DAY)
              .toISOString()
              .slice(0, 10)
          : null,
        // Build #23 — seeded from company policy (cutoff + grace in minutes →
        // hours for the legacy grace_period field the evaluator reads).
        payment_cutoff_time: companyPolicy.payment.payment_cutoff_time,
        grace_period: companyPolicy.payment.grace_period_minutes / 60,
        late_fee: companyPolicy.late_fee.enabled
          ? companyPolicy.late_fee.type === "fixed"
            ? companyPolicy.late_fee.fixed_amount
            : 0
          : 0,
        late_fee_applied: false,
        weeks_rented: isWeekly ? 1 : 0,
        pricing_snapshot: snap ?? null,
        // Build #23 — frozen company policy terms so later company/class changes
        // never retroactively alter an active or historical agreement.
        policy_snapshot: policySnapshot,
        created_by: s.currentStaffId,
        created_at: now,
        updated_at: now,
      };

      s.setRentals((rs) => [rental, ...rs]);
      s.setReservations((rs) =>
        rs.map((r) =>
          r.id === res.id ? { ...r, converted_to_rental_id: rentalId } : r,
        ),
      );
      // Build #8 — link the operational deposit record to this rental.
      if (deposits) deposits.linkDepositToRental(res.id, rentalId);
      addEvent({
        id: uid("rev"),
        rental_id: rentalId,
        type: "created",
        label: `Rental agreement created from reservation ${res.id}`,
        at: now,
        tone: "neutral",
        staff_id: s.currentStaffId,
      });
      return rentalId;
    },

    startCheckout: (
      id: string,
      data: {
        mileageOut: number;
        fuelOut: number;
        signed: boolean;
        billingConfig?: RentalBillingConfig | null;
      },
    ) => {
      const rental = s.rentals.find((r) => r.id === id);
      if (!rental) return;
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const time = now.slice(11, 16);
      const snapshot = rental.pricing_snapshot ?? null;
      // Build #23 — freeze the company policy terms onto this rental so later
      // company/class policy changes never retroactively alter the agreement.
      const policySnapshot = rental.policy_snapshot ?? null;
      s.setRentals((rs) =>
        rs.map((r) =>
          r.id === id
            ? {
                ...r,
                status: "active",
                checkout_date: today,
                checkout_time: time,
                mileage_out: data.mileageOut,
                fuel_out: data.fuelOut,
                billing_config: data.billingConfig ?? r.billing_config ?? null,
                pricing_snapshot: snapshot,
                policy_snapshot: policySnapshot,
                updated_at: now,
              }
            : r,
        ),
      );
      // Build #9 cleanup — post start-time FEES only (one-time / rental_start
      // fees such as an admin fee) + their taxes. The rental BASE charge is
      // NOT posted here: for recurring rentals the billing engine posts each
      // period's base via postPeriodCharges, and for upfront rentals the
      // engine's single upfront period posts the base. Posting the full base
      // here would duplicate the first period's base obligation. Add-ons are
      // included as taxable base lines so start-time fees/taxes calculate
      // against them, but add-ons themselves are not reposted as charges here.
      if (taxFee) {
        const baseCharges: ChargeLine[] = [];
        const resAddons = s.addons.filter(
          (a) => a.reservation_id === rental.reservation_id,
        );
        for (const a of resAddons) {
          baseCharges.push({
            category: "addon",
            amount: a.price * a.quantity,
            description: "Add-on",
          });
        }
        const vehicle = s.vehicles.find((v) => v.id === rental.vehicle_id);
        taxFee.postStartCharges({
          rentalId: id,
          customerId: rental.customer_id,
          vehicleId: rental.vehicle_id,
          reservationId: rental.reservation_id,
          locationId: vehicle?.location ?? null,
          effectiveDate: today,
          baseCharges,
        });
      }
      s.setVehicles((vs) =>
        vs.map((v) =>
          v.id === rental.vehicle_id
            ? {
                ...v,
                status: "rented",
                current_mileage: data.mileageOut,
                updated_at: now,
              }
            : v,
        ),
      );
      s.setCustomers((cs) =>
        cs.map((c) =>
          c.id === rental.customer_id
            ? { ...c, customer_status: "active_renter", updated_at: now }
            : c,
        ),
      );
      if (rental.reservation_id) {
        s.setReservations((rs) =>
          rs.map((r) =>
            r.id === rental.reservation_id ? { ...r, status: "active" } : r,
          ),
        );
      }
      addEvent({
        id: uid("rev"),
        rental_id: id,
        type: "checkout",
        label: `Checkout completed — mileage ${data.mileageOut.toLocaleString()} mi, fuel ${data.fuelOut}%`,
        at: now,
        tone: "available",
        staff_id: s.currentStaffId,
      });
      if (data.signed) {
        addEvent({
          id: uid("rev"),
          rental_id: id,
          type: "signed",
          label: "Agreement signed at checkout",
          at: now,
          tone: "available",
          staff_id: s.currentStaffId,
        });
      }
      logAct(`Rental started — ${rental.agreement_number}`, "available");
      // Build #21 — emit RENTAL_STARTED so Connect Pro can map the rental +
      // begin customer automation. Idempotent per rental.
      emitRentalStarted(rental, data.billingConfig, today);
    },

    completeReturn: (
      id: string,
      data: {
        mileageIn: number;
        fuelIn: number;
        returnDate: string;
        returnTime: string;
        charges: number;
        depositRefund: number;
      },
    ) => {
      const rental = s.rentals.find((r) => r.id === id);
      if (!rental) return;
      const now = new Date().toISOString();
      s.setRentals((rs) =>
        rs.map((r) =>
          r.id === id
            ? {
                ...r,
                status: "completed",
                actual_return_date: data.returnDate,
                actual_return_time: data.returnTime,
                mileage_in: data.mileageIn,
                fuel_in: data.fuelIn,
                fees: r.fees + data.charges,
                balance_due: Math.max(0, r.balance_due + data.charges),
                updated_at: now,
              }
            : r,
        ),
      );
      s.setVehicles((vs) =>
        vs.map((v) =>
          v.id === rental.vehicle_id
            ? {
                ...v,
                status: "available",
                current_mileage: data.mileageIn,
                updated_at: now,
              }
            : v,
        ),
      );
      s.setCustomers((cs) =>
        cs.map((c) =>
          c.id === rental.customer_id
            ? { ...c, customer_status: "previous_renter", updated_at: now }
            : c,
        ),
      );
      if (rental.reservation_id) {
        s.setReservations((rs) =>
          rs.map((r) =>
            r.id === rental.reservation_id
              ? { ...r, status: "completed", deposit_status: "released" }
              : r,
          ),
        );
      }
      // Build #8 — mark any refundable held deposit as refund pending so the
      // company's obligation to return it is surfaced (refund issued later).
      if (deposits) {
        const dep = s.rentalDeposits.find(
          (d) =>
            d.rental_id === id || d.reservation_id === rental.reservation_id,
        );
        if (dep) deposits.markRefundPending(dep.id);
      }
      addEvent({
        id: uid("rev"),
        rental_id: id,
        type: "return_inspection",
        label: `Return inspection completed — mileage ${data.mileageIn.toLocaleString()} mi, fuel ${data.fuelIn}%`,
        at: now,
        tone: "available",
        staff_id: s.currentStaffId,
      });
      addEvent({
        id: uid("rev"),
        rental_id: id,
        type: "closed",
        label: `Rental closed${data.charges > 0 ? ` — ${fmtMoney(data.charges)} in charges` : ""}${data.depositRefund > 0 ? `, ${fmtMoney(data.depositRefund)} deposit refunded` : ""}`,
        at: now,
        tone: "neutral",
        staff_id: s.currentStaffId,
      });
      logAct(`Rental returned — ${rental.agreement_number}`, "neutral");
      // Build #11 — resolve any open "follow up on overdue rental" system task
      // now that the rental is completed/returned.
      resolveSystemTasks(s, "rental.overdue", "rental", id, "rental returned");
      // Build #21 — emit RENTAL_COMPLETED so Connect Pro can stop reminders.
      emitRentalCompleted(
        rental,
        s.rentals.find((r) => r.id === id)?.balance_due ?? 0,
        now,
      );
    },
  };
}
