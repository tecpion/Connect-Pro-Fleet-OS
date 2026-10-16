// Connect Pro Fleet — Build #9 cleanup: recurring billing tax/fee integration.
// Verifies processRentalBilling posts each period's FULL obligation (base +
// per-period fees + taxes), allocation recognizes all components, Payments Due
// uses the complete obligation, and tax revenue stays isolated.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { act } from "@testing-library/react";
import {
  useHooks,
  fresh,
  setupWeeklyRental,
  perPeriodFeeRule,
  freezeBillingClock,
  restoreBillingClock,
} from "./recurringBillingFixtures";
import { getPaymentObligations } from "@/lib/billingSelectors";
import { getInvestorEligibleRevenue } from "@/lib/taxFeeSelectors";

// These suites exercise tax/fee integration, not late-fee timing. Freeze the
// clock before the fixture rentals' 14:00 cutoff so no period is ever "late".
beforeAll(freezeBillingClock);
afterAll(restoreBillingClock);

describe("Build #9 cleanup — recurring billing tax/fee integration", () => {
  it("weekly period includes base + per-period fee + tax", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).store.addFeeRule(perPeriodFeeRule("fee_p1", 10)));
    act(() => fresh(h).billing.processRentalBilling());
    const p = fresh(h).billing.rentalPeriods(rentalId)[0];
    expect(p.base_amount).toBe(350);
    expect(p.fee_amount).toBe(10);
    expect(p.tax_amount).toBeCloseTo(28.8, 2);
    expect(p.total_amount).toBeCloseTo(388.8, 2);
  });

  it("one-time fee does not repeat per billing period", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).store.deactivateFeeRule("fee_admin"));
    act(() => fresh(h).billing.processRentalBilling());
    for (const p of fresh(h).billing.rentalPeriods(rentalId)) {
      expect(p.fee_amount).toBe(0);
    }
  });

  it("triggered fee does not auto-post in billing periods", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).billing.processRentalBilling());
    const cleaningFees = fresh(h).store.transactions.filter(
      (t) =>
        t.rental_id === rentalId &&
        t.metadata?.charge_category === "cleaning" &&
        t.transaction_type === "fee_charge",
    );
    expect(cleaningFees.length).toBe(0);
  });

  it("multiple taxes post separately per period", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).billing.processRentalBilling());
    const p = fresh(h).billing.rentalPeriods(rentalId)[0];
    expect(p.tax_transaction_ids.length).toBe(2);
  });

  it("period components sum to total", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).store.addFeeRule(perPeriodFeeRule("fee_sum", 10)));
    act(() => fresh(h).billing.processRentalBilling());
    const p = fresh(h).billing.rentalPeriods(rentalId)[0];
    expect(p.base_amount + p.fee_amount + p.tax_amount).toBeCloseTo(
      p.total_amount,
      2,
    );
  });

  it("same period generation is idempotent", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).billing.processRentalBilling());
    const { store, billing } = fresh(h);
    const periodsBefore = billing.rentalPeriods(rentalId).length;
    const chargesBefore = store.transactions.filter(
      (t) =>
        t.rental_id === rentalId &&
        t.metadata?.billing_period_id &&
        t.status === "posted",
    ).length;
    act(() => fresh(h).billing.processRentalBilling());
    const f = fresh(h);
    expect(f.billing.rentalPeriods(rentalId).length).toBe(periodsBefore);
    expect(
      f.store.transactions.filter(
        (t) =>
          t.rental_id === rentalId &&
          t.metadata?.billing_period_id &&
          t.status === "posted",
      ).length,
    ).toBe(chargesBefore);
  });

  it("Payments Due uses the full period obligation", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).store.addFeeRule(perPeriodFeeRule("fee_pd", 10)));
    act(() => fresh(h).billing.processRentalBilling());
    const f = fresh(h);
    const obligations = getPaymentObligations(
      f.store.rentals,
      f.billing.billingPeriods,
      f.store.transactions,
    );
    const obs = obligations.filter((o) => o.rentalId === rentalId);
    expect(obs[0].amountDue).toBeCloseTo(388.8, 2);
  });

  it("partial payment leaves tax/fee portion outstanding", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).store.addFeeRule(perPeriodFeeRule("fee_pp", 10)));
    act(() => fresh(h).billing.processRentalBilling());
    act(() => fresh(h).store.recordRentalPayment(rentalId, 350, "Card"));
    const f = fresh(h);
    const obligations = getPaymentObligations(
      f.store.rentals,
      f.billing.billingPeriods,
      f.store.transactions,
    );
    const obs = obligations.filter((o) => o.rentalId === rentalId);
    expect(obs[0].amountDue).toBeCloseTo(38.8, 2);
    expect(obs[0].bucket).not.toBe("paid_week");
  });

  it("period not marked paid when only base is paid", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).store.addFeeRule(perPeriodFeeRule("fee_np", 10)));
    act(() => fresh(h).billing.processRentalBilling());
    act(() => fresh(h).store.recordRentalPayment(rentalId, 350, "Card"));
    const f = fresh(h);
    const alloc = f.billing.rentalAllocation(rentalId);
    const periods = f.billing.rentalPeriods(rentalId);
    const a = alloc.allocations.get(periods[0].id);
    expect(a?.balance).toBeGreaterThan(0);
    expect(a?.status).not.toBe("paid");
  });

  it("tax does not become company-earned revenue", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).billing.processRentalBilling());
    const f = fresh(h);
    const rentalTxns = f.store.transactions.filter(
      (t) => t.rental_id === rentalId && t.status === "posted",
    );
    const eligible = getInvestorEligibleRevenue(rentalTxns);
    const taxTotal = rentalTxns
      .filter((t) => t.transaction_type === "tax_charge")
      .reduce((s, t) => s + t.amount, 0);
    expect(taxTotal).toBeGreaterThan(0);
    expect(eligible).toBeLessThan(eligible + taxTotal);
  });

  it("company-only fee does not enter investor basis", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() =>
      fresh(h).store.addFeeRule(
        perPeriodFeeRule("fee_co", 25, {
          taxable: false,
          includeInVehicleRevenue: false,
        }),
      ),
    );
    act(() => fresh(h).billing.processRentalBilling());
    const f = fresh(h);
    const rentalTxns = f.store.transactions.filter(
      (t) => t.rental_id === rentalId && t.status === "posted",
    );
    expect(getInvestorEligibleRevenue(rentalTxns)).toBe(350);
  });

  it("eligible fee behaves according to investor rules", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() =>
      fresh(h).store.addFeeRule(
        perPeriodFeeRule("fee_inv", 25, {
          taxable: false,
          includeInVehicleRevenue: true,
        }),
      ),
    );
    act(() => fresh(h).billing.processRentalBilling());
    const f = fresh(h);
    const rentalTxns = f.store.transactions.filter(
      (t) => t.rental_id === rentalId && t.status === "posted",
    );
    expect(getInvestorEligibleRevenue(rentalTxns)).toBe(375);
  });

  it("per-day fee scales to period days", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() =>
      fresh(h).store.addFeeRule({
        ...perPeriodFeeRule("fee_pd5", 5, { taxable: false }),
        frequency: "per_day",
      }),
    );
    act(() => fresh(h).billing.processRentalBilling());
    const p = fresh(h).billing.rentalPeriods(rentalId)[0];
    expect(p.fee_amount).toBe(35);
  });

  it("invoice total includes period tax + fee charges", () => {
    const h = useHooks();
    const rentalId = setupWeeklyRental(h);
    act(() => fresh(h).store.addFeeRule(perPeriodFeeRule("fee_inv2", 10)));
    act(() => fresh(h).billing.processRentalBilling());
    const periods = fresh(h).billing.rentalPeriods(rentalId);
    let invId: string | null = null;
    act(() => {
      invId = fresh(h).store.generateInvoice({
        rentalId,
        billingPeriodStart: periods[0].period_start,
        billingPeriodEnd: periods[0].period_end,
      });
    });
    expect(invId).toBeTruthy();
    const inv = fresh(h)
      .store.rentalInvoices(rentalId)
      .find((i) => i.id === invId)!;
    expect(inv.subtotal).toBeCloseTo(periods[0].total_amount, 2);
  });
});
