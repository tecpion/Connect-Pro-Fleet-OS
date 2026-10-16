// Connect Pro Fleet — Build #5 cleanup regression tests.
// Verifies the payment posting path (single ledger entry, derived balance,
// receipt-once, no double-post, legacy compatibility) and the atomic billing
// configuration persistence at checkout (single authoritative path, frozen
// snapshot, idempotency).

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import type { ReactNode } from "react";
import type { Customer, Reservation, Vehicle } from "@/lib/types";
import type { RentalBillingConfig } from "@/lib/billingTypes";
import { TENANT_ID } from "@/lib/store/ids";

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}

function useStoreHook() {
  return renderHook(() => useStore(), { wrapper }).result;
}

function makeVehicle(): Vehicle {
  return {
    id: "veh_test",
    vin: "TESTVIN000001",
    make: "Test",
    model: "Sedan",
    year: 2024,
    license_plate: "TST-001",
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
    insurance_policy_number: "TST-INS",
    insurance_expiry: "2027-01-01",
    registration_expiry: "2027-01-01",
    tenant_id: TENANT_ID,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

function makeCustomer(): Customer {
  return {
    id: "cus_test",
    tenant_id: TENANT_ID,
    first_name: "Test",
    last_name: "Renter",
    phone: "+1 555 0000",
    email: "test@example.com",
    date_of_birth: "1990-01-01",
    address: "1 Test St",
    city: "Miami",
    state: "FL",
    zip: "33131",
    emergency_contact_name: "Emergency",
    emergency_contact_phone: "+1 555 0001",
    customer_status: "good_standing",
    customer_source: "staff",
    notes: "",
    drivers_license_number: "TST-DL-001",
    drivers_license_state: "FL",
    drivers_license_expiry: "2029-01-01",
    drivers_license_front_url: null,
    drivers_license_back_url: null,
    insurance_company: "Geico",
    insurance_policy_number: "TST-POL",
    insurance_expiry: "2027-01-01",
    insurance_document_url: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

function makeReservation(vehicleId: string, customerId: string): Reservation {
  return {
    id: "res_test",
    vehicle_id: vehicleId,
    customer_id: customerId,
    renter_name: "Test Renter",
    renter_email: "test@example.com",
    renter_phone: "+1 555 0000",
    start_date: "2026-09-01",
    end_date: "2026-09-08",
    status: "confirmed",
    source: "manual",
    ghl_opportunity_id: null,
    total_price: 350,
    deposit_amount: 300,
    deposit_status: "held",
    amount_paid: 300,
    created_at: "2026-08-28T00:00:00Z",
    created_by: "stf_1",
    created_by_name: "Test · Owner",
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

const WEEKLY_CONFIG: RentalBillingConfig = {
  billing_frequency: "weekly",
  billing_anchor_date: "2026-09-01",
  recurring_amount: 350,
  auto_generate_periods: true,
  custom_schedule: null,
};

function setupActiveRental(r: ReturnType<typeof useStoreHook>) {
  act(() => {
    r.current.addVehicle(makeVehicle());
    r.current.addCustomer(makeCustomer());
    r.current.addReservation(makeReservation("veh_test", "cus_test"));
  });
  let rentalId = "";
  act(() => {
    rentalId = r.current.convertReservationToRental("res_test") ?? "";
  });
  // Deactivate tax/fee rules so these payment-mechanics tests stay isolated
  // from the Build #9 start-charge posting (verified in its own test suite).
  act(() => {
    r.current.taxRules.forEach((t) => r.current.deactivateTaxRule(t.id));
    r.current.feeRules.forEach((f) => r.current.deactivateFeeRule(f.id));
  });
  act(() => {
    r.current.startCheckout(rentalId, {
      mileageOut: 1000,
      fuelOut: 100,
      signed: true,
      billingConfig: WEEKLY_CONFIG,
    });
  });
  return rentalId;
}

describe("Build #5 cleanup — payment posting", () => {
  it("recordRentalPayment creates exactly one ledger payment transaction", () => {
    const r = useStoreHook();
    const rentalId = setupActiveRental(r);
    const before = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.category === "payment",
    ).length;
    act(() => {
      r.current.recordRentalPayment(rentalId, 100, "Card");
    });
    const after = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.category === "payment",
    ).length;
    expect(after - before).toBe(1);
  });

  it("recordRentalPayment derives the balance from the updated ledger, not stale state", () => {
    const r = useStoreHook();
    const rentalId = setupActiveRental(r);
    act(() => {
      r.current.postCharge(rentalId, {
        type: "rental_charge",
        amount: 350,
        description: "Weekly rental",
      });
    });
    let balance = 0;
    act(() => {
      balance = r.current.recordRentalPayment(rentalId, 100, "Card");
    });
    // 350 charge − 100 payment = 250 owed.
    expect(balance).toBe(250);
    const rental = r.current.rentals.find((x) => x.id === rentalId)!;
    expect(rental.amount_paid).toBe(100);
    expect(rental.balance_due).toBe(250);
  });

  it("partial payment leaves the correct remaining balance", () => {
    const r = useStoreHook();
    const rentalId = setupActiveRental(r);
    act(() => {
      r.current.postCharge(rentalId, {
        type: "rental_charge",
        amount: 400,
        description: "Weekly rental",
      });
    });
    act(() => {
      r.current.recordRentalPayment(rentalId, 250, "Card");
    });
    const rental = r.current.rentals.find((x) => x.id === rentalId)!;
    expect(rental.amount_paid).toBe(250);
    expect(rental.balance_due).toBe(150);
  });

  it("full payment clears the obligation and clears late status", () => {
    const r = useStoreHook();
    const rentalId = setupActiveRental(r);
    act(() => {
      r.current.postCharge(rentalId, {
        type: "rental_charge",
        amount: 400,
        description: "Weekly rental",
      });
      r.current.applyLateFee(rentalId);
    });
    // The seeded rental's late_fee is $25 (from convertReservationToRental).
    const rental0 = r.current.rentals.find((x) => x.id === rentalId)!;
    const totalOwed = 400 + rental0.late_fee;
    let balance = 0;
    act(() => {
      balance = r.current.recordRentalPayment(rentalId, totalOwed, "Card");
    });
    expect(balance).toBe(0);
    const rental = r.current.rentals.find((x) => x.id === rentalId)!;
    expect(rental.balance_due).toBe(0);
    expect(rental.late_fee_applied).toBe(false);
  });

  it("a receipt is generated exactly once per payment", () => {
    const r = useStoreHook();
    const rentalId = setupActiveRental(r);
    const before = r.current.receipts.filter(
      (rc) => rc.rental_id === rentalId,
    ).length;
    act(() => {
      r.current.recordRentalPayment(rentalId, 100, "Card");
    });
    const after = r.current.receipts.filter(
      (rc) => rc.rental_id === rentalId,
    ).length;
    expect(after - before).toBe(1);
  });

  it("repeated recordRentalPayment calls post one transaction each (no silent double-post)", () => {
    const r = useStoreHook();
    const rentalId = setupActiveRental(r);
    const before = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.category === "payment",
    ).length;
    act(() => {
      r.current.recordRentalPayment(rentalId, 100, "Card");
    });
    act(() => {
      r.current.recordRentalPayment(rentalId, 100, "Card");
    });
    const after = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.category === "payment",
    ).length;
    expect(after - before).toBe(2);
    expect(r.current.rentals.find((x) => x.id === rentalId)!.amount_paid).toBe(
      200,
    );
  });

  it("recordRentalPayment remains compatible with legacy method-label callers", () => {
    const r = useStoreHook();
    const rentalId = setupActiveRental(r);
    let balance = 0;
    expect(() => {
      act(() => {
        balance = r.current.recordRentalPayment(rentalId, 50, "Cash");
      });
    }).not.toThrow();
    expect(balance).toBe(-50);
    const txn = r.current.transactions.find(
      (t) =>
        t.rental_id === rentalId &&
        t.category === "payment" &&
        t.payment_method === "cash",
    );
    expect(txn).toBeTruthy();
  });
});

describe("Build #5 cleanup — billing config persistence", () => {
  it("checkout persists the confirmed billing config as the authoritative value", () => {
    const r = useStoreHook();
    act(() => {
      r.current.addVehicle(makeVehicle());
      r.current.addCustomer(makeCustomer());
      r.current.addReservation(makeReservation("veh_test", "cus_test"));
    });
    let rentalId = "";
    act(() => {
      rentalId = r.current.convertReservationToRental("res_test") ?? "";
    });
    const confirmed: RentalBillingConfig = {
      billing_frequency: "biweekly",
      billing_anchor_date: "2026-09-01",
      recurring_amount: 750,
      auto_generate_periods: true,
      custom_schedule: null,
    };
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: confirmed,
      });
    });
    const rental = r.current.rentals.find((x) => x.id === rentalId)!;
    expect(rental.billing_config).toEqual(confirmed);
    expect(rental.billing_config?.billing_frequency).toBe("biweekly");
    expect(rental.billing_config?.recurring_amount).toBe(750);
  });

  it("the pricing snapshot is frozen at checkout and survives later class changes", () => {
    const r = useStoreHook();
    const rentalId = setupActiveRental(r);
    const frozen = r.current.rentals.find(
      (x) => x.id === rentalId,
    )!.pricing_snapshot!;
    expect(frozen).toBeTruthy();
    expect(frozen.recommended_total).toBe(350);
    act(() => {
      r.current.updateVehicleClass("cls_midsize", { weekly_rate: 999 });
    });
    const still = r.current.rentals.find(
      (x) => x.id === rentalId,
    )!.pricing_snapshot!;
    expect(still.recommended_total).toBe(350);
    expect(still.weekly_rate).toBe(350);
  });

  it("checkout is idempotent — no duplicate rental, vehicle stays rented", () => {
    const r = useStoreHook();
    const rentalId = setupActiveRental(r);
    const eventsBefore = r.current.rentalEvents.filter(
      (e) => e.rental_id === rentalId && e.type === "checkout",
    ).length;
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1100,
        fuelOut: 90,
        signed: true,
        billingConfig: null,
      });
    });
    expect(r.current.rentals.filter((x) => x.id === rentalId)).toHaveLength(1);
    expect(r.current.vehicles.find((v) => v.id === "veh_test")?.status).toBe(
      "rented",
    );
    const eventsAfter = r.current.rentalEvents.filter(
      (e) => e.rental_id === rentalId && e.type === "checkout",
    ).length;
    expect(eventsAfter - eventsBefore).toBeLessThanOrEqual(1);
  });

  it("existing weekly rentals continue working through the shared payment path", () => {
    const r = useStoreHook();
    const rentalId = setupActiveRental(r);
    act(() => {
      r.current.postCharge(rentalId, {
        type: "weekly_rental_charge",
        amount: 350,
        description: "Weekly rental",
      });
    });
    let balance = 0;
    act(() => {
      balance = r.current.recordRentalPayment(rentalId, 350, "Card");
    });
    expect(balance).toBe(0);
    const rental = r.current.rentals.find((x) => x.id === rentalId)!;
    expect(rental.balance_due).toBe(0);
    expect(rental.status).toBe("active");
  });
});
