// Connect Pro Fleet — Build #19 active-rental import helper.
//
// Extracted from migrationStore to keep each file focused. Creates an
// imported-legacy RentalAgreement, marks the vehicle rented, posts an
// `migration_opening_balance` ledger charge (real obligation, NOT current-
// period revenue), and migrates a held deposit as held money (no current-day
// cash collection). Future BillingPeriods anchor from the imported
// next_payment_due, not the original rental start date.

import type { FleetStore } from "./store";
import type { RentalAgreement, RentalStatus, PaymentMethod } from "./types";
import type { RentalBillingConfig } from "./billingTypes";
import type { ImportedActiveRentalInput } from "./migrationTypes";
import { TENANT_ID, uid } from "./store/ids";

const STATUS_MAP: Record<string, RentalStatus> = {
  active: "active",
  late: "late",
  overdue: "overdue",
  return_due: "return_pending",
  payment_due: "payment_due",
  completed: "completed",
  cancelled: "cancelled",
};

function mapStatus(s: string): RentalStatus {
  return STATUS_MAP[(s ?? "").toLowerCase()] ?? "active";
}

function mapPaymentMethod(m: string | null): PaymentMethod | null {
  if (!m) return null;
  const v = m.toLowerCase();
  if (v.includes("card") || v.includes("credit") || v.includes("debit"))
    return "card";
  if (v.includes("cash") && v.includes("app")) return "cashapp";
  if (v.includes("cash")) return "cash";
  if (v.includes("ach")) return "ach";
  if (v.includes("zelle")) return "zelle";
  if (v.includes("external")) return "external";
  return "other";
}

const ACTIVE_STATUSES = [
  "active",
  "late",
  "overdue",
  "payment_due",
  "return_pending",
];

export function importActiveRental(
  store: FleetStore,
  input: ImportedActiveRentalInput,
  importedAgreements: Set<string>,
  logEvent: (
    batchId: string | null,
    type: "opening_balance_created" | "deposit_migrated",
    label: string,
  ) => void,
): { ok: boolean; error?: string; rental_id?: string } {
  const extId = input.external_agreement_id;
  if (extId) {
    if (importedAgreements.has(extId)) {
      return {
        ok: false,
        error: "This external agreement was already imported.",
      };
    }
    const existing = store.rentals.find(
      (r) => r.external_agreement_id === extId,
    );
    if (existing) {
      return {
        ok: false,
        error:
          "An active rental with this external agreement ID already exists.",
      };
    }
  }
  const customer = store.customers.find((c) => c.id === input.customer_id);
  if (!customer)
    return { ok: false, error: "Customer not found in this tenant." };
  const vehicle = store.vehicles.find((v) => v.id === input.vehicle_id);
  if (!vehicle)
    return { ok: false, error: "Vehicle not found in this tenant." };
  const activeExisting = store.rentals.find(
    (r) =>
      r.vehicle_id === input.vehicle_id && ACTIVE_STATUSES.includes(r.status),
  );
  if (activeExisting) {
    return {
      ok: false,
      error: `Vehicle already has an active rental (${activeExisting.agreement_number}).`,
    };
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const agreementNumber = `AGR-${new Date().getFullYear()}-${String(
    store.rentals.length + 1,
  ).padStart(5, "0")}`;

  const billingConfig: RentalBillingConfig = {
    billing_frequency: input.billing_frequency,
    billing_anchor_date: input.next_payment_due_date ?? input.rental_start_date,
    recurring_amount: input.current_rate,
    auto_generate_periods: true,
    custom_schedule: null,
  };

  const rental: RentalAgreement = {
    id: uid("agr"),
    tenant_id: TENANT_ID,
    reservation_id: null,
    customer_id: input.customer_id,
    vehicle_id: input.vehicle_id,
    agreement_number: agreementNumber,
    status: mapStatus(input.status),
    checkout_date: input.rental_start_date,
    checkout_time: null,
    scheduled_return_date: input.current_term_end_date ?? "",
    scheduled_return_time: null,
    actual_return_date: null,
    actual_return_time: null,
    rate_type: input.rate_type,
    rate_amount: input.current_rate,
    subtotal: input.current_rate,
    tax: 0,
    fees: 0,
    discount: 0,
    deposit_amount: input.deposit_held,
    amount_paid: 0,
    balance_due: input.opening_balance,
    mileage_out: null,
    mileage_in: null,
    fuel_out: null,
    fuel_in: null,
    weekly_payment_day: null,
    next_payment_due: input.next_payment_due_date,
    payment_cutoff_time: input.next_payment_due_time,
    grace_period: 0,
    late_fee: 0,
    late_fee_applied: false,
    weeks_rented: 0,
    billing_config: billingConfig,
    pricing_snapshot: null,
    rental_origin: "imported_legacy",
    migration_cutover_at: today,
    imported_legacy_rental: true,
    external_agreement_id: extId,
    created_by: store.currentStaffId,
    created_at: now,
    updated_at: now,
  };
  store.addRental(rental);
  if (extId) importedAgreements.add(extId);
  store.updateVehicle(input.vehicle_id, { status: "rented" });

  if (input.opening_balance > 0) {
    store.postTransaction({
      rental_id: rental.id,
      customer_id: input.customer_id,
      vehicle_id: input.vehicle_id,
      transaction_type: "migration_opening_balance",
      category: "charge",
      description: `Migration opening balance — ${extId ?? agreementNumber}`,
      amount: input.opening_balance,
      direction: "charge",
      payment_method: null,
      status: "posted",
      effective_date: today,
      notes: input.notes ?? null,
      metadata: {
        migration: true,
        external_rental_id: extId,
        cutover_date: today,
      },
    });
  }

  if (input.deposit_held > 0) {
    store.migrateHeldDeposit({
      rental_id: rental.id,
      customer_id: input.customer_id,
      vehicle_id: input.vehicle_id,
      amount: input.deposit_held,
      method: mapPaymentMethod(input.payment_method) ?? "other",
      notes: "Migrated held deposit (pre-Fleet)",
    });
  }

  store.addRentalEvent({
    id: uid("rev"),
    rental_id: rental.id,
    type: "created",
    label: `Imported into Connect Pro Fleet — ${extId ?? "legacy rental"}`,
    at: now,
    tone: "neutral",
    staff_id: store.currentStaffId,
  });

  logEvent(
    null,
    "opening_balance_created",
    `Opening balance created — ${agreementNumber} ($${input.opening_balance})`,
  );
  if (input.deposit_held > 0) {
    logEvent(
      null,
      "deposit_migrated",
      `Held deposit migrated — ${agreementNumber} ($${input.deposit_held})`,
    );
  }
  return { ok: true, rental_id: rental.id };
}
