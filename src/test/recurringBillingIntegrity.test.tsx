// Connect Pro Fleet — Build #9 cleanup: initial-charge integrity + effective
// dates + deposit application on period obligations.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { act } from "@testing-library/react";
import {
  useHooks,
  fresh,
  setupWeeklyRental,
  makeVehicle,
  makeCustomer,
  makeReservation,
  perPeriodFeeRule,
  freezeBillingClock,
  restoreBillingClock,
} from "./recurringBillingFixtures";

// These suites exercise billing integrity, not late-fee timing. Freeze the
// clock before the fixture rentals' 14:00 cutoff so no period is ever "late".
beforeAll(freezeBillingClock);
afterAll(restoreBillingClock);

describe("Build #9 cleanup — initial-charge integrity", () => {
  it("weekly billing does not post full rental base + first-period base", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).store.deactivateFeeRule("fee_admin"));
    act(() => fresh(h).billing.processRentalBilling());
    const f = fresh(h);
    const baseCharges = f.store.transactions.filter(
      (t) =>
        t.rental_id === rentalId &&
        t.transaction_type === "rental_charge" &&
        t.status === "posted",
    );
    const periods = f.billing.rentalPeriods(rentalId);
    expect(baseCharges.length).toBe(periods.length);
  });

  it("first period is not duplicated by checkout + billing processor", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).billing.processRentalBilling());
    const n1 = fresh(h).billing.rentalPeriods(rentalId).length;
    act(() => fresh(h).billing.processRentalBilling());
    expect(fresh(h).billing.rentalPeriods(rentalId).length).toBe(n1);
  });

  it("start-time one-time fee posts once at checkout", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    const f0 = fresh(h);
    const adminFees = f0.store.transactions.filter(
      (t) =>
        t.rental_id === rentalId &&
        t.metadata?.charge_category === "administrative_fee" &&
        t.transaction_type === "fee_charge" &&
        t.status === "posted",
    );
    expect(adminFees.length).toBe(1);
    act(() => fresh(h).billing.processRentalBilling());
    const f1 = fresh(h);
    const adminFeesAfter = f1.store.transactions.filter(
      (t) =>
        t.rental_id === rentalId &&
        t.metadata?.charge_category === "administrative_fee" &&
        t.transaction_type === "fee_charge" &&
        t.status === "posted",
    );
    expect(adminFeesAfter.length).toBe(1);
  });

  it("checkout estimate does not itself become a base obligation", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).store.deactivateFeeRule("fee_admin"));
    const baseBefore = fresh(h).store.transactions.filter(
      (t) =>
        t.rental_id === rentalId &&
        t.transaction_type === "rental_charge" &&
        t.status === "posted",
    ).length;
    expect(baseBefore).toBe(0);
    act(() => fresh(h).billing.processRentalBilling());
    const baseAfter = fresh(h).store.transactions.filter(
      (t) =>
        t.rental_id === rentalId &&
        t.transaction_type === "rental_charge" &&
        t.status === "posted",
    ).length;
    expect(baseAfter).toBeGreaterThan(0);
  });

  it("upfront billing posts the base once via the engine, not at checkout", () => {
    const h = useHooks();
    act(() => {
      const r = fresh(h).store;
      r.addVehicle(makeVehicle());
      r.addCustomer(makeCustomer());
      r.addReservation(
        makeReservation("veh_rb", "cus_rb", "2026-09-01", "2026-09-04"),
      );
    });
    let rentalId = "";
    act(() => {
      rentalId = fresh(h).store.convertReservationToRental("res_rb") ?? "";
    });
    act(() => {
      const r = fresh(h).store;
      r.deactivateFeeRule("fee_admin");
      r.startCheckout(rentalId, {
        mileageOut: 1000,
        fuelOut: 100,
        signed: true,
        billingConfig: {
          billing_frequency: "upfront",
          billing_anchor_date: "2026-09-01",
          recurring_amount: null,
          auto_generate_periods: true,
          custom_schedule: null,
        },
      });
    });
    const baseBefore = fresh(h).store.transactions.filter(
      (t) =>
        t.rental_id === rentalId &&
        t.transaction_type === "rental_charge" &&
        t.status === "posted",
    ).length;
    expect(baseBefore).toBe(0);
    act(() => fresh(h).billing.processRentalBilling());
    const baseAfter = fresh(h).store.transactions.filter(
      (t) =>
        t.rental_id === rentalId &&
        t.transaction_type === "rental_charge" &&
        t.status === "posted",
    ).length;
    expect(baseAfter).toBe(1);
  });
});

describe("Build #9 cleanup — effective dates", () => {
  it("tax effective-date change affects future period only", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).billing.processRentalBilling());
    const taxBefore = fresh(h).billing.rentalPeriods(rentalId)[0].tax_amount;
    act(() => fresh(h).store.updateTaxRule("tax_state", { rate: 10 }));
    expect(fresh(h).billing.rentalPeriods(rentalId)[0].tax_amount).toBe(
      taxBefore,
    );
  });

  it("fee effective-date change affects future period only", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).store.addFeeRule(perPeriodFeeRule("fee_eff", 10)));
    act(() => fresh(h).billing.processRentalBilling());
    const feeBefore = fresh(h).billing.rentalPeriods(rentalId)[0].fee_amount;
    act(() => fresh(h).store.updateFeeRule("fee_eff", { amount: 25 }));
    expect(fresh(h).billing.rentalPeriods(rentalId)[0].fee_amount).toBe(
      feeBefore,
    );
  });

  it("historical period remains unchanged after rule edit", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).billing.processRentalBilling());
    const totalBefore =
      fresh(h).billing.rentalPeriods(rentalId)[0].total_amount;
    act(() => {
      const r = fresh(h).store;
      r.updateTaxRule("tax_state", { rate: 99 });
      r.updateTaxRule("tax_local", { rate: 99 });
    });
    expect(fresh(h).billing.rentalPeriods(rentalId)[0].total_amount).toBe(
      totalBefore,
    );
  });
});

describe("Build #9 cleanup — deposit application on period obligation", () => {
  it("deposit application can satisfy remaining period obligation", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).store.deactivateFeeRule("fee_admin"));
    act(() => fresh(h).billing.processRentalBilling());
    act(() =>
      fresh(h).store.ensureDepositForReservation({
        reservationId: "res_rb",
        customerId: "cus_rb",
        vehicleId: "veh_rb",
        requiredAmount: 300,
        source: "company_default",
        policyName: "Standard",
      }),
    );
    // Link the reservation deposit to the rental, then collect it.
    act(() => fresh(h).store.linkDepositToRental("res_rb", rentalId));
    const dep = fresh(h).store.depositForRental(rentalId)!;
    act(() =>
      fresh(h).store.collectDeposit(
        dep.id,
        { amount: 300, method: "card" },
        "dk1",
      ),
    );
    const f = fresh(h);
    const periods = f.billing.rentalPeriods(rentalId);
    const total = periods[0].total_amount;
    act(() =>
      fresh(h).store.recordRentalPayment(rentalId, total - 31.6, "Card"),
    );
    act(() => fresh(h).store.applyDeposit(dep.id, { amount: 31.6 }, "dk2"));
    const f2 = fresh(h);
    const alloc = f2.billing.rentalAllocation(rentalId);
    const a = alloc.allocations.get(periods[0].id);
    expect(a?.balance).toBeCloseTo(0, 0);
  });
});
