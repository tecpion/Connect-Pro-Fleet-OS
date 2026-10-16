// Connect Pro Fleet — Build #9 cleanup test fixtures (shared).
// Extracted so the recurring-billing test suites stay under the file size limit.
//
// IMPORTANT: useStore() and useBilling() must come from the SAME provider tree
// so they share one store instance. We expose a single useHooks() that renders
// both hooks in one renderHook call (shared wrapper/provider).
//
// DATE DETERMINISM: these suites exercise tax/fee integration, NOT late-fee
// timing. The fixture rentals are due 2026-09-01 with a 14:00 cutoff, so when
// run on/after that date the period is genuinely past due and a late fee would
// post — making the assertions date-dependent. We freeze the wall clock to
// 2026-09-01 10:00 (before the cutoff) so the period is never late and no late
// fee interferes with the tax/fee assertions. This changes no billing/tax/fee
// semantics; it only removes real-wall-clock dependence.

import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";
import { StoreProvider, useStore } from "@/lib/store";
import { BillingProvider, useBilling } from "@/lib/billingStore";
import type { ReactNode } from "react";
import type { Customer, Reservation, Vehicle } from "@/lib/types";
import type { RentalBillingConfig } from "@/lib/billingTypes";
import { TENANT_ID } from "@/lib/store/ids";

/** Freeze the wall clock to 2026-09-01 10:00 local — before the fixture
 *  rentals' 14:00 payment cutoff — so no period is ever "late" in these
 *  tax/fee integration suites. Call in beforeAll. */
export function freezeBillingClock() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 1, 10, 0, 0));
}

/** Restore real timers. Call in afterAll. */
export function restoreBillingClock() {
  vi.useRealTimers();
}

export function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <BillingProvider>{children}</BillingProvider>
    </StoreProvider>
  );
}

/** Render both hooks in ONE renderHook call so they share a single provider
 *  tree (and therefore a single store instance). */
export function useHooks() {
  return renderHook(() => ({ store: useStore(), billing: useBilling() }), {
    wrapper,
  }).result;
}

/** Convenience: get a store-only hook (for tests that don't need billing). */
export function useStoreHook() {
  return renderHook(() => useStore(), { wrapper }).result;
}

/** Read the latest store + billing from a hooks result (call after acts). */
export function fresh(h: ReturnType<typeof useHooks>) {
  return { store: h.current.store, billing: h.current.billing };
}

export function makeVehicle(): Vehicle {
  return {
    id: "veh_rb",
    vin: "RBVIN000001",
    make: "Test",
    model: "Sedan",
    year: 2024,
    license_plate: "RB-001",
    status: "available",
    location: "Miami Downtown",
    vehicle_type: "car",
    vehicle_class_id: "cls_midsize",
    pricing_override: false,
    min_rental_days_override: null,
    deposit_override: false,
    daily_rate: 50,
    weekly_rate: 350,
    deposit_amount: 300,
    images: [],
    documents: [],
    purchase_date: "2024-01-01",
    purchase_price: 25000,
    current_mileage: 1000,
    insurance_policy_number: "RB-INS",
    insurance_expiry: "2027-01-01",
    registration_expiry: "2027-01-01",
    tenant_id: TENANT_ID,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

export function makeCustomer(): Customer {
  return {
    id: "cus_rb",
    tenant_id: TENANT_ID,
    first_name: "Recurring",
    last_name: "Billing",
    phone: "+1 555 0000",
    email: "rb@example.com",
    date_of_birth: "1990-01-01",
    address: "1 St",
    city: "Miami",
    state: "FL",
    zip: "33131",
    emergency_contact_name: "Em",
    emergency_contact_phone: "+1 555 0001",
    customer_status: "good_standing",
    customer_source: "staff",
    notes: "",
    drivers_license_number: "RB-DL",
    drivers_license_state: "FL",
    drivers_license_expiry: "2029-01-01",
    drivers_license_front_url: null,
    drivers_license_back_url: null,
    insurance_company: "Geico",
    insurance_policy_number: "RB-POL",
    insurance_expiry: "2027-01-01",
    insurance_document_url: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

export function makeReservation(
  vehicleId: string,
  customerId: string,
  start: string,
  end: string,
): Reservation {
  return {
    id: "res_rb",
    vehicle_id: vehicleId,
    customer_id: customerId,
    renter_name: "Recurring Billing",
    renter_email: "rb@example.com",
    renter_phone: "+1 555 0000",
    start_date: start,
    end_date: end,
    status: "confirmed",
    source: "manual",
    ghl_opportunity_id: null,
    total_price: 350,
    deposit_amount: 300,
    deposit_status: "held",
    amount_paid: 300,
    created_at: "2026-08-28T00:00:00Z",
    created_by: "stf_1",
    created_by_name: "Recurring · Owner",
    tenant_id: TENANT_ID,
    pricing_snapshot: {
      vehicle_class_id: "cls_midsize",
      vehicle_class_name: "Midsize",
      daily_rate: 50,
      weekly_rate: 350,
      minimum_rental_duration: 3,
      duration_days: 7,
      recommended_total: 350,
      recommended_rate_type: "weekly",
      components: [{ type: "weekly", quantity: 1, rate: 350, total: 350 }],
    },
  };
}

export const WEEKLY_CONFIG: RentalBillingConfig = {
  billing_frequency: "weekly",
  billing_anchor_date: "2026-09-01",
  recurring_amount: 350,
  auto_generate_periods: true,
  custom_schedule: null,
};

export function setupWeeklyRental(h: ReturnType<typeof useHooks>) {
  // Re-read h.current.store inside each act so we always use the latest store
  // (its methods close over the latest state). Capturing it once would freeze
  // stale state reads.
  act(() => {
    const r = h.current.store;
    r.addVehicle(makeVehicle());
    r.addCustomer(makeCustomer());
    r.addReservation(
      makeReservation("veh_rb", "cus_rb", "2026-09-01", "2026-09-08"),
    );
  });
  let rentalId = "";
  act(() => {
    rentalId = h.current.store.convertReservationToRental("res_rb") ?? "";
  });
  act(() => {
    h.current.store.startCheckout(rentalId, {
      mileageOut: 1000,
      fuelOut: 100,
      signed: true,
      billingConfig: WEEKLY_CONFIG,
    });
  });
  return rentalId;
}

/** A per-billing-period flat fee rule factory for tests. */
export function perPeriodFeeRule(
  id: string,
  amount: number,
  opts: { taxable?: boolean; includeInVehicleRevenue?: boolean } = {},
) {
  return {
    id,
    tenant_id: TENANT_ID,
    name: "Period Fee",
    description: "",
    calculation_type: "flat" as const,
    amount,
    rate: 0,
    percentage_base: [],
    frequency: "per_billing_period" as const,
    trigger: "billing_period" as const,
    charge_category: "administrative_fee" as const,
    taxable: opts.taxable ?? true,
    waivable: true,
    amount_override_allowed: true,
    location_ids: [],
    include_in_vehicle_revenue: opts.includeInVehicleRevenue ?? false,
    active: true,
    effective_date: "2026-01-01",
    end_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: "stf_1",
  };
}
