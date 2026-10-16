// Connect Pro Fleet — Build #5 store lifecycle + regression tests.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import type { ReactNode } from "react";
import type {
  Customer,
  Reservation,
  Vehicle,
  RentalAgreement,
} from "@/lib/types";
import { TENANT_ID, uid } from "@/lib/store/ids";
import type { RentalDeposit } from "@/lib/depositTypes";
import { getRentalSettlement } from "@/lib/rentalSettlement";
import {
  getCollectionsForRange,
  getOutstandingForRange,
  startOfWeek,
} from "@/lib/financialSelectors";

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

describe("Build #5 — store lifecycle", () => {
  it("converts a reservation to a rental and carries the pricing snapshot", () => {
    const r = useStoreHook();
    act(() => {
      r.current.addVehicle(makeVehicle());
      r.current.addCustomer(makeCustomer());
      r.current.addReservation(makeReservation("veh_test", "cus_test"));
    });
    let rentalId: string | null = null;
    act(() => {
      rentalId = r.current.convertReservationToRental("res_test");
    });
    expect(rentalId).toBeTruthy();
    const rental = r.current.rentals.find(
      (x) => x.id === rentalId,
    ) as RentalAgreement;
    expect(rental.status).toBe("ready_for_checkout");
    // Pricing snapshot carried from the reservation quote.
    expect(rental.pricing_snapshot?.recommended_total).toBe(350);
    expect(rental.pricing_snapshot?.vehicle_class_name).toBe("Midsize");
    // Reservation marked converted.
    expect(
      r.current.reservations.find((x) => x.id === "res_test")
        ?.converted_to_rental_id,
    ).toBe(rentalId);
  });

  it("starts checkout atomically with a billing config and freezes the snapshot", () => {
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
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: {
          billing_frequency: "weekly",
          billing_anchor_date: "2026-09-01",
          recurring_amount: 350,
          auto_generate_periods: true,
          custom_schedule: null,
        },
      });
    });
    const rental = r.current.rentals.find((x) => x.id === rentalId)!;
    expect(rental.status).toBe("active");
    expect(rental.billing_config?.billing_frequency).toBe("weekly");
    expect(rental.billing_config?.recurring_amount).toBe(350);
    expect(rental.pricing_snapshot?.recommended_total).toBe(350);
    // Vehicle rented, customer active.
    expect(r.current.vehicles.find((v) => v.id === "veh_test")?.status).toBe(
      "rented",
    );
    expect(
      r.current.customers.find((c) => c.id === "cus_test")?.customer_status,
    ).toBe("active_renter");
  });

  it("records a payment and derives the balance from the ledger", () => {
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
    // Deactivate tax/fee rules to isolate this payment-mechanics test (Build #9).
    act(() => {
      r.current.taxRules.forEach((t) => r.current.deactivateTaxRule(t.id));
      r.current.feeRules.forEach((f) => r.current.deactivateFeeRule(f.id));
    });
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: null,
      });
    });
    let balance = 0;
    act(() => {
      balance = r.current.recordLedgerPayment(rentalId, 100, "card");
    });
    // A payment is recorded and the rental's amount_paid is synced from the
    // ledger. With no charges posted yet, the $100 is an overpayment (negative
    // balance = account credit) — the ledger never clamps real payments.
    const rental = r.current.rentals.find((x) => x.id === rentalId)!;
    expect(rental.amount_paid).toBe(100);
    expect(balance).toBe(-100); // overpayment tracked, not clamped
  });

  it("changes an active rental rate and logs an audit event", () => {
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
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: {
          billing_frequency: "weekly",
          billing_anchor_date: "2026-09-01",
          recurring_amount: 350,
          auto_generate_periods: true,
          custom_schedule: null,
        },
      });
    });
    const before = r.current.rentals.find(
      (x) => x.id === rentalId,
    )!.rate_amount;
    act(() => {
      r.current.changeRentalRate({
        rentalId,
        newRate: 375,
        effectiveDate: "2026-09-08",
        reason: "Seasonal adjustment",
      });
    });
    const after = r.current.rentals.find((x) => x.id === rentalId)!;
    expect(after.rate_amount).toBe(375);
    expect(after.billing_config?.recurring_amount).toBe(375);
    // Audit entry recorded with old/new values.
    const audit = r.current.settingsAudit.find(
      (a) => a.action === "Rental rate changed",
    );
    expect(audit).toBeTruthy();
    expect(audit?.old_value).toBe(String(before));
    expect(audit?.new_value).toBe("375");
  });

  it("exchanges a vehicle without ending the rental and preserves history", () => {
    const r = useStoreHook();
    const veh2: Vehicle = {
      ...makeVehicle(),
      id: "veh_test2",
      license_plate: "TST-002",
      current_mileage: 2000,
    };
    act(() => {
      r.current.addVehicle(makeVehicle());
      r.current.addVehicle(veh2);
      r.current.addCustomer(makeCustomer());
      r.current.addReservation(makeReservation("veh_test", "cus_test"));
    });
    let rentalId = "";
    act(() => {
      rentalId = r.current.convertReservationToRental("res_test") ?? "";
    });
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: null,
      });
    });
    act(() => {
      r.current.exchangeVehicle({
        rentalId,
        newVehicleId: "veh_test2",
        reason: "Mechanical issue",
        oldMileageIn: 1500,
        oldFuelIn: 80,
        newMileageOut: 2000,
        newFuelOut: 100,
        newVehicleDisposition: "maintenance",
      });
    });
    const rental = r.current.rentals.find((x) => x.id === rentalId)!;
    // Rental stays active, vehicle swapped.
    expect(rental.status).toBe("active");
    expect(rental.vehicle_id).toBe("veh_test2");
    expect(rental.rate_amount).toBe(350); // unchanged
    // History recorded.
    const history = r.current.vehicleExchanges(rentalId);
    expect(history).toHaveLength(1);
    expect(history[0].old_vehicle_id).toBe("veh_test");
    expect(history[0].new_vehicle_id).toBe("veh_test2");
    expect(history[0].old_vehicle_disposition).toBe("maintenance");
    // Old vehicle disposition applied.
    expect(r.current.vehicles.find((v) => v.id === "veh_test")?.status).toBe(
      "maintenance",
    );
    expect(r.current.vehicles.find((v) => v.id === "veh_test2")?.status).toBe(
      "rented",
    );
  });

  it("extends a rental and advances the scheduled return date", () => {
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
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: null,
      });
    });
    const before = r.current.rentals.find(
      (x) => x.id === rentalId,
    )!.scheduled_return_date;
    act(() => {
      r.current.extendRental(rentalId, 7);
    });
    const after = r.current.rentals.find((x) => x.id === rentalId)!;
    expect(after.scheduled_return_date).not.toBe(before);
    // Extension event logged.
    expect(
      r.current.rentalEvents.some(
        (e) => e.rental_id === rentalId && e.type === "extended",
      ),
    ).toBe(true);
  });

  it("completes a return and marks the rental + vehicle + customer correctly", () => {
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
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: null,
      });
    });
    act(() => {
      r.current.completeReturn(rentalId, {
        mileageIn: 2500,
        fuelIn: 60,
        returnDate: "2026-09-08",
        returnTime: "10:00",
        charges: 50,
        depositRefund: 250,
      });
    });
    const rental = r.current.rentals.find((x) => x.id === rentalId)!;
    expect(rental.status).toBe("completed");
    expect(rental.actual_return_date).toBe("2026-09-08");
    expect(rental.mileage_in).toBe(2500);
    expect(r.current.vehicles.find((v) => v.id === "veh_test")?.status).toBe(
      "available",
    );
    expect(
      r.current.customers.find((c) => c.id === "cus_test")?.customer_status,
    ).toBe("previous_renter");
  });

  it("is idempotent: converting twice returns the same rental id", () => {
    const r = useStoreHook();
    act(() => {
      r.current.addVehicle(makeVehicle());
      r.current.addCustomer(makeCustomer());
      r.current.addReservation(makeReservation("veh_test", "cus_test"));
    });
    let first: string | null = null;
    let second: string | null = null;
    act(() => {
      first = r.current.convertReservationToRental("res_test");
    });
    act(() => {
      second = r.current.convertReservationToRental("res_test");
    });
    expect(first).toBe(second);
    expect(
      r.current.rentals.filter((x) => x.reservation_id === "res_test"),
    ).toHaveLength(1);
  });

  it("derives a final settlement from the ledger", () => {
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
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: null,
      });
      r.current.postCharge(rentalId, {
        type: "damage_charge",
        amount: 200,
        description: "Bumper damage",
      });
      r.current.recordLedgerPayment(rentalId, 150, "card");
    });
    const rental = r.current.rentals.find((x) => x.id === rentalId)!;
    // Build #8: settlement derives deposit handling from the RentalDeposit record.
    const deposit = {
      id: "dep_test",
      tenant_id: TENANT_ID,
      reservation_id: "res_test",
      rental_id: rentalId,
      customer_id: "cus_test",
      vehicle_id: "veh_test",
      policy_id: null,
      required_amount: 300,
      collected_amount: 300,
      applied_amount: 100,
      refunded_amount: 200,
      forfeited_amount: 0,
      status: "partially_refunded" as const,
      currency: "USD",
      source_snapshot: { source: "manual" as const },
      collected_at: null,
      refund_due_at: null,
      completed_at: null,
      notes: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
      created_by: null,
    } satisfies RentalDeposit;
    const settlement = getRentalSettlement(
      rental,
      r.current.transactions,
      deposit,
    );
    expect(settlement.damageCharges).toBe(200);
    expect(settlement.payments).toBe(150);
    expect(settlement.depositCollected).toBe(300);
    expect(settlement.depositApplied).toBe(100);
    expect(settlement.depositRefunded).toBe(200);
  });

  it("financial selectors distinguish collections from billed revenue", () => {
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
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: null,
      });
      r.current.recordLedgerPayment(rentalId, 200, "card");
    });
    const weekStart = startOfWeek(new Date());
    // Collections = money actually received this week (includes seeded payments
    // from other rentals, plus this rental's $200). Outstanding = open obligations.
    const collectedBefore = getCollectionsForRange(
      r.current.transactions.filter((t) => t.rental_id !== rentalId),
      weekStart,
      new Date(),
    );
    const collectedAfter = getCollectionsForRange(
      r.current.transactions,
      weekStart,
      new Date(),
    );
    expect(collectedAfter - collectedBefore).toBe(200); // the test payment
    const outstanding = getOutstandingForRange(r.current.transactions);
    expect(outstanding).toBeGreaterThanOrEqual(0);
  });
});
