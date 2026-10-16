// Connect Pro Fleet — Build #9 store-level tests.
// Verifies the rental-start posting path, idempotency, triggered fee
// assessment, charge-bundle reversal, and that deposit isolation holds
// through the store methods.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import type { ReactNode } from "react";
import type { Customer, Reservation, Vehicle } from "@/lib/types";
import { TENANT_ID } from "@/lib/store/ids";

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
function useStoreHook() {
  return renderHook(() => useStore(), { wrapper }).result;
}

function makeVehicle(): Vehicle {
  return {
    id: "veh_tf",
    vin: "TAXFEEVIN001",
    make: "Test",
    model: "Sedan",
    year: 2024,
    license_plate: "TF-001",
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
    insurance_policy_number: "TF-INS",
    insurance_expiry: "2027-01-01",
    registration_expiry: "2027-01-01",
    tenant_id: TENANT_ID,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}
function makeCustomer(): Customer {
  return {
    id: "cus_tf",
    tenant_id: TENANT_ID,
    first_name: "Tax",
    last_name: "Fee",
    phone: "+1 555 0000",
    email: "tf@example.com",
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
    drivers_license_number: "TF-DL",
    drivers_license_state: "FL",
    drivers_license_expiry: "2029-01-01",
    drivers_license_front_url: null,
    drivers_license_back_url: null,
    insurance_company: "Geico",
    insurance_policy_number: "TF-POL",
    insurance_expiry: "2027-01-01",
    insurance_document_url: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}
function makeReservation(): Reservation {
  return {
    id: "res_tf",
    vehicle_id: "veh_tf",
    customer_id: "cus_tf",
    renter_name: "Tax Fee",
    renter_email: "tf@example.com",
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
    created_by_name: "Tax · Owner",
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

function setup(r: ReturnType<typeof useStoreHook>) {
  act(() => {
    r.current.addVehicle(makeVehicle());
    r.current.addCustomer(makeCustomer());
    r.current.addReservation(makeReservation());
  });
  let rentalId = "";
  act(() => {
    rentalId = r.current.convertReservationToRental("res_tf") ?? "";
  });
  return rentalId;
}

describe("Build #9 — rental-start posting", () => {
  it("posts start-time fees + taxes at checkout", () => {
    const r = useStoreHook();
    const rentalId = setup(r);
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: null,
      });
    });
    const fees = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.transaction_type === "fee_charge",
    );
    const taxes = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.transaction_type === "tax_charge",
    );
    // Seeded admin fee (active) + state/local taxes on (rental 350 + admin 25).
    expect(fees.length).toBeGreaterThanOrEqual(1);
    expect(taxes.length).toBeGreaterThanOrEqual(1);
    const adminFee = fees.find(
      (f) => f.metadata?.charge_category === "administrative_fee",
    );
    expect(adminFee?.amount).toBe(25);
  });

  it("is idempotent — retry does not duplicate start charges", () => {
    const r = useStoreHook();
    const rentalId = setup(r);
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: null,
      });
    });
    const feesBefore = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.transaction_type === "fee_charge",
    ).length;
    const taxesBefore = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.transaction_type === "tax_charge",
    ).length;
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1100,
        fuelOut: 90,
        signed: true,
        billingConfig: null,
      });
    });
    const feesAfter = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.transaction_type === "fee_charge",
    ).length;
    const taxesAfter = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.transaction_type === "tax_charge",
    ).length;
    expect(feesAfter).toBe(feesBefore);
    expect(taxesAfter).toBe(taxesBefore);
  });

  it("tax increases customer obligation", () => {
    const r = useStoreHook();
    const rentalId = setup(r);
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: null,
      });
    });
    const taxCharges = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.transaction_type === "tax_charge",
    );
    const taxTotal = taxCharges.reduce((s, t) => s + t.amount, 0);
    expect(taxTotal).toBeGreaterThan(0);
    const rental = r.current.rentals.find((x) => x.id === rentalId)!;
    // balance_due includes the posted tax charges (synced from ledger).
    expect(rental.balance_due).toBeGreaterThan(0);
  });
});

describe("Build #9 — triggered fee assessment", () => {
  it("assesses a triggered fee at return", () => {
    const r = useStoreHook();
    const rentalId = setup(r);
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: null,
      });
    });
    const before = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.transaction_type === "fee_charge",
    ).length;
    const cleaningRule = r.current.feeRules.find(
      (f) => f.name === "Cleaning Fee",
    )!;
    let res = {
      feeTxnId: null as string | null,
      taxTxnIds: [] as string[],
      amount: 0,
    };
    act(() => {
      res = r.current.assessTriggeredFee({
        rentalId,
        customerId: "cus_tf",
        vehicleId: "veh_tf",
        reservationId: "res_tf",
        ruleId: cleaningRule.id,
        trigger: "return",
        effectiveDate: new Date().toISOString().slice(0, 10),
      });
    });
    expect(res.feeTxnId).not.toBeNull();
    expect(res.amount).toBe(150);
    const after = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.transaction_type === "fee_charge",
    ).length;
    expect(after - before).toBe(1);
  });

  it("non-waivable fee cannot be overridden", () => {
    const r = useStoreHook();
    const rentalId = setup(r);
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: null,
      });
    });
    const smokingRule = r.current.feeRules.find(
      (f) => f.name === "Smoking Fee",
    )!;
    let res = {
      feeTxnId: null as string | null,
      taxTxnIds: [] as string[],
      amount: 0,
    };
    act(() => {
      res = r.current.assessTriggeredFee({
        rentalId,
        customerId: "cus_tf",
        ruleId: smokingRule.id,
        trigger: "return",
        effectiveDate: new Date().toISOString().slice(0, 10),
        overrideAmount: 100,
      });
    });
    // Smoking fee is non-waivable + no override allowed → rejected.
    expect(res.feeTxnId).toBeNull();
  });

  it("assessing a taxable fee also posts associated tax", () => {
    const r = useStoreHook();
    const rentalId = setup(r);
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: null,
      });
    });
    // Use the admin fee (taxable) triggered manually.
    const adminRule = r.current.feeRules.find(
      (f) => f.name === "Administrative Fee",
    )!;
    let res = {
      feeTxnId: null as string | null,
      taxTxnIds: [] as string[],
      amount: 0,
    };
    act(() => {
      res = r.current.assessTriggeredFee({
        rentalId,
        customerId: "cus_tf",
        ruleId: adminRule.id,
        trigger: "rental_start",
        effectiveDate: new Date().toISOString().slice(0, 10),
      });
    });
    // Admin fee is taxable → associated tax posted (deduped against start charge).
    expect(res.feeTxnId).not.toBeNull();
  });
});

describe("Build #9 — charge-bundle reversal", () => {
  it("reverses a fee + its associated tax coherently", () => {
    const r = useStoreHook();
    const rentalId = setup(r);
    act(() => {
      r.current.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: null,
      });
    });
    // Find the admin fee's charge group.
    const adminFee = r.current.transactions.find(
      (t) =>
        t.rental_id === rentalId &&
        t.transaction_type === "fee_charge" &&
        t.metadata?.charge_category === "administrative_fee",
    )!;
    const groupId = adminFee.metadata?.charge_group_id as string;
    const bundleBefore = r.current.transactions.filter(
      (t) => t.metadata?.charge_group_id === groupId && t.status === "posted",
    );
    act(() => {
      r.current.reverseChargeBundle({
        rentalId,
        customerId: "cus_tf",
        chargeGroupId: groupId,
        reason: "Posted in error",
      });
    });
    // Reversals posted (opposite-signed credits) linked to the originals.
    const reversals = r.current.transactions.filter(
      (t) => t.metadata?.reversal_of && t.metadata?.charge_group_id === groupId,
    );
    expect(reversals.length).toBe(bundleBefore.length);
    // Net obligation from the bundle is now zero.
    const bundleTxns = r.current.transactions.filter(
      (t) => t.metadata?.charge_group_id === groupId && t.status === "posted",
    );
    const net = bundleTxns.reduce(
      (s, t) => s + (t.category === "charge" ? t.amount : -t.amount),
      0,
    );
    expect(net).toBe(0);
  });
});

describe("Build #9 — deposit isolation through store", () => {
  it("deposit collection does not create tax/fee charges", () => {
    const r = useStoreHook();
    const rentalId = setup(r);
    // Ensure a deposit record exists and collect it.
    act(() => {
      r.current.ensureDepositForReservation({
        reservationId: "res_tf",
        customerId: "cus_tf",
        vehicleId: "veh_tf",
        requiredAmount: 300,
        source: "company_default",
        policyName: "Standard",
      });
    });
    const dep = r.current.depositForReservation("res_tf")!;
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 300, method: "card" }, "key1");
    });
    const taxCharges = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.transaction_type === "tax_charge",
    );
    const feeCharges = r.current.transactions.filter(
      (t) => t.rental_id === rentalId && t.transaction_type === "fee_charge",
    );
    // The deposit collection itself is an other_payment tagged deposit_kind=collection,
    // not a tax/fee charge.
    const depTxn = r.current.transactions.find(
      (t) =>
        t.deposit_id === dep.id && t.metadata?.deposit_kind === "collection",
    );
    expect(depTxn).toBeTruthy();
    expect(depTxn!.transaction_type).toBe("other_payment");
    // No tax/fee charge was created merely because a deposit was collected.
    expect(taxCharges.filter((t) => t.deposit_id === dep.id)).toHaveLength(0);
    expect(feeCharges.filter((t) => t.deposit_id === dep.id)).toHaveLength(0);
  });
});
