// Connect Pro Fleet — Build #4 billing engine verification.
// Tests the authoritative allocation + billing-period logic for the critical
// scenarios: idempotency, partial payment, overpayment, late fee, waiver,
// extension, rate change, exchange, completion, and FIFO allocation.

import { describe, it, expect } from "vitest";
import {
  allocatePayments,
  generatePeriodSpecs,
  lateFeeEligibility,
  nextPaymentDue,
  periodDedupeKey,
  periodStatus,
  rentalLateStatus,
  resolveBillingConfig,
  rentalTermDays,
} from "@/lib/billing";
import { getPaymentObligations } from "@/lib/billingSelectors";
import {
  makeRental,
  makePeriod,
  charge,
  payment,
  credit,
  billingConfig,
} from "./billingFixtures";

const today = () => new Date().toISOString().slice(0, 10);

describe("Build #4 — billing engine", () => {
  // Scenario O: idempotency
  it("dedupe key is stable for the same period range", () => {
    const k1 = periodDedupeKey("rnt_1", "2026-08-24", "2026-08-30");
    const k2 = periodDedupeKey("rnt_1", "2026-08-24", "2026-08-30");
    expect(k1).toBe(k2);
    expect(k1).toBe("rnt_1|2026-08-24|2026-08-30");
  });

  it("generatePeriodSpecs does not produce duplicate specs for the same range", () => {
    const rental = makeRental();
    const config = resolveBillingConfig(rental);
    const specs = generatePeriodSpecs(rental, config, { horizonDays: 7 });
    const keys = new Set(
      specs.map((s) =>
        periodDedupeKey(rental.id, s.period_start, s.period_end),
      ),
    );
    expect(specs.length).toBe(keys.size);
  });

  // Scenario F: partial payment
  it("partial payment reduces period balance without clearing it", () => {
    const period = makePeriod();
    const txns = [
      charge("txn_1", "rnt_1", 400, "2026-08-24"),
      payment("pay_1", "rnt_1", 250, "2026-08-24"),
    ];
    const alloc = allocatePayments([period], txns, "rnt_1");
    const a = alloc.allocations.get("bp_1")!;
    expect(a.paid).toBe(250);
    expect(a.balance).toBe(150);
  });

  // Scenario G: overpayment
  it("overpayment is tracked as overpayment, not clamped to the charge", () => {
    const period = makePeriod();
    const txns = [
      charge("txn_1", "rnt_1", 400, "2026-08-24"),
      payment("pay_1", "rnt_1", 500, "2026-08-24"),
    ];
    const alloc = allocatePayments([period], txns, "rnt_1");
    const a = alloc.allocations.get("bp_1")!;
    expect(a.paid).toBe(400);
    expect(a.balance).toBe(0);
    expect(alloc.overpayment).toBe(100);
  });

  // Scenario F+G: second payment closes first period then spills
  it("second payment closes the first period then spills to overpayment", () => {
    const period = makePeriod();
    const txns = [
      charge("txn_1", "rnt_1", 400, "2026-08-24"),
      payment("pay_1", "rnt_1", 250, "2026-08-24"),
      payment("pay_2", "rnt_1", 200, "2026-08-25"),
    ];
    const alloc = allocatePayments([period], txns, "rnt_1");
    const a = alloc.allocations.get("bp_1")!;
    expect(a.paid).toBe(400);
    expect(a.balance).toBe(0);
    expect(alloc.overpayment).toBe(50);
  });

  // Scenario H: late fee eligibility
  it("late fee is eligible when past due + grace passed + balance outstanding", () => {
    const rental = makeRental({ grace_period: 12, late_fee: 50 });
    const period = makePeriod({
      due_at: "2020-01-01",
      late_fee_applied: false,
    });
    const alloc = {
      periodId: "bp_1",
      paid: 0,
      balance: 400,
      status: "past_due" as const,
    };
    const elig = lateFeeEligibility(
      period,
      alloc,
      rental,
      new Date("2020-02-01"),
    );
    expect(elig.eligible).toBe(true);
  });

  it("late fee is NOT eligible when balance is satisfied", () => {
    const rental = makeRental({ grace_period: 12, late_fee: 50 });
    const period = makePeriod({
      due_at: "2020-01-01",
      late_fee_applied: false,
    });
    const alloc = {
      periodId: "bp_1",
      paid: 400,
      balance: 0,
      status: "paid" as const,
    };
    const elig = lateFeeEligibility(
      period,
      alloc,
      rental,
      new Date("2020-02-01"),
    );
    expect(elig.eligible).toBe(false);
  });

  it("late fee is NOT eligible when already applied (dedupe)", () => {
    const rental = makeRental({ grace_period: 12, late_fee: 50 });
    const period = makePeriod({ due_at: "2020-01-01", late_fee_applied: true });
    const alloc = {
      periodId: "bp_1",
      paid: 0,
      balance: 400,
      status: "past_due" as const,
    };
    const elig = lateFeeEligibility(
      period,
      alloc,
      rental,
      new Date("2020-02-01"),
    );
    expect(elig.eligible).toBe(false);
  });

  it("late fee is NOT eligible within grace window", () => {
    const rental = makeRental({ grace_period: 12, late_fee: 50 });
    const due = new Date("2020-01-01T00:00:00");
    const period = makePeriod({
      due_at: "2020-01-01",
      late_fee_applied: false,
    });
    const alloc = {
      periodId: "bp_1",
      paid: 0,
      balance: 400,
      status: "past_due" as const,
    };
    const elig = lateFeeEligibility(
      period,
      alloc,
      rental,
      new Date(due.getTime() + 6 * 3600_000),
    );
    expect(elig.eligible).toBe(false);
  });

  // Scenario I: waiver preserves history (credit, not deletion)
  it("waiver posts as a credit that offsets the fee without deleting it", () => {
    const period = makePeriod();
    const txns = [
      charge("txn_1", "rnt_1", 400, "2026-08-24"),
      charge("txn_fee", "rnt_1", 50, "2026-08-25", "late_fee"),
      credit("cred_1", "rnt_1", 50, "2026-08-25"),
    ];
    const alloc = allocatePayments([period], txns, "rnt_1");
    // The credit enters the FIFO pool and reduces the period balance; the late
    // fee remains as an ad-hoc charge. Net rental balance is preserved: 400
    // (period) + 50 (fee) - 50 (credit) = 400. The fee charge is NOT deleted.
    const a = alloc.allocations.get("bp_1")!;
    expect(a.balance).toBe(350); // 400 charge - 50 credit
    const feeStillExists = txns.some(
      (t) => t.id === "txn_fee" && t.status === "posted",
    );
    expect(feeStillExists).toBe(true);
  });

  // Scenario J: extension generates additional periods
  it("extending the return date allows additional weekly periods", () => {
    const base = makeRental({ scheduled_return_date: "2026-08-31" });
    const config = resolveBillingConfig(base);
    const beforeSpecs = generatePeriodSpecs(base, config, { horizonDays: 14 });
    const extended = makeRental({ scheduled_return_date: "2026-09-14" });
    const afterSpecs = generatePeriodSpecs(extended, config, {
      horizonDays: 14,
    });
    expect(afterSpecs.length).toBeGreaterThan(beforeSpecs.length);
  });

  // Scenario K: rate change — recurring amount is stored, not re-derived
  it("recurring amount is stored on the config, not derived from class price", () => {
    const config = billingConfig({ recurring_amount: 350 });
    const rental = makeRental({ rate_amount: 375 });
    const specs = generatePeriodSpecs(rental, config, { horizonDays: 7 });
    expect(specs[0].base_amount).toBe(350);
  });

  // Scenario L: vehicle exchange does not reset billing
  it("exchange keeps the same billing config (rate unchanged)", () => {
    const rental = makeRental({ vehicle_id: "veh_1", rate_amount: 400 });
    const configBefore = resolveBillingConfig(rental);
    const afterExchange = makeRental({ vehicle_id: "veh_2", rate_amount: 400 });
    const configAfter = resolveBillingConfig(afterExchange);
    expect(configAfter.billing_frequency).toBe(configBefore.billing_frequency);
    expect(configAfter.recurring_amount).toBe(configBefore.recurring_amount);
  });

  // Scenario M/N: completion stops future generation
  it("completed rentals are skipped by getPaymentObligations", () => {
    const completed = makeRental({ status: "completed" });
    const period = makePeriod();
    const txns = [charge("txn_1", "rnt_1", 400, "2026-08-24")];
    const obligations = getPaymentObligations([completed], [period], txns);
    expect(obligations).toHaveLength(0);
  });

  // Cancelled periods are skipped
  it("cancelled periods are excluded from obligations", () => {
    const rental = makeRental();
    const period = makePeriod({ status: "cancelled" });
    const txns = [charge("txn_1", "rnt_1", 400, "2026-08-24")];
    const obligations = getPaymentObligations([rental], [period], txns);
    expect(obligations).toHaveLength(0);
  });

  // Next payment due derivation
  it("next payment due is the earliest outstanding period", () => {
    const p1 = makePeriod({
      id: "bp_1",
      due_at: "2026-08-24",
      sequence_number: 1,
      transaction_id: "txn_1",
    });
    const p2 = makePeriod({
      id: "bp_2",
      due_at: "2026-08-31",
      sequence_number: 2,
      transaction_id: "txn_2",
    });
    const txns = [
      charge("txn_1", "rnt_1", 400, "2026-08-24"),
      charge("txn_2", "rnt_1", 400, "2026-08-31"),
      payment("pay_1", "rnt_1", 400, "2026-08-24"),
    ];
    const alloc = allocatePayments([p1, p2], txns, "rnt_1");
    const next = nextPaymentDue([p1, p2], alloc.allocations);
    expect(next).toBe("2026-08-31");
  });

  it("next payment due is null when all periods are paid", () => {
    const p1 = makePeriod({ id: "bp_1", due_at: "2026-08-24" });
    const txns = [
      charge("txn_1", "rnt_1", 400, "2026-08-24"),
      payment("pay_1", "rnt_1", 400, "2026-08-24"),
    ];
    const alloc = allocatePayments([p1], txns, "rnt_1");
    const next = nextPaymentDue([p1], alloc.allocations);
    expect(next).toBeNull();
  });

  // Rental late status
  it("rentalLateStatus returns late when a period is past due + outstanding", () => {
    const rental = makeRental({ grace_period: 12 });
    const period = makePeriod({ due_at: "2020-01-01" });
    const txns = [charge("txn_1", "rnt_1", 400, "2020-01-01")];
    const alloc = allocatePayments([period], txns, "rnt_1");
    const status = rentalLateStatus([period], alloc.allocations, rental);
    expect(["late", "overdue"]).toContain(status);
  });

  // Period status derivation
  it("periodStatus returns paid when balance is zero", () => {
    expect(periodStatus(makePeriod(), 400, 400)).toBe("paid");
  });

  it("periodStatus returns partially_paid when some paid + not past due", () => {
    expect(periodStatus(makePeriod({ due_at: today() }), 200, 400)).toBe(
      "partially_paid",
    );
  });

  it("periodStatus returns past_due when unpaid + due date passed", () => {
    expect(periodStatus(makePeriod({ due_at: "2020-01-01" }), 0, 400)).toBe(
      "past_due",
    );
  });

  // Upfront billing
  it("upfront billing generates a single period covering the term", () => {
    const rental = makeRental({
      rate_type: "daily",
      rate_amount: 65,
      subtotal: 195,
      scheduled_return_date: "2026-08-27",
      billing_config: billingConfig({
        billing_frequency: "upfront",
        recurring_amount: null,
      }),
    });
    const config = resolveBillingConfig(rental);
    const specs = generatePeriodSpecs(rental, config, { horizonDays: 30 });
    expect(specs.length).toBe(1);
    expect(specs[0].base_amount).toBe(195);
  });

  // Custom schedule
  it("custom schedule produces installments as defined", () => {
    const rental = makeRental({
      subtotal: 1200,
      billing_config: billingConfig({
        billing_frequency: "custom",
        recurring_amount: null,
        custom_schedule: [
          { due_at: "2026-08-24", amount: 300 },
          { due_at: "2026-08-31", amount: 300 },
          { due_at: "2026-09-07", amount: 300 },
          { due_at: "2026-09-14", amount: 300 },
        ],
      }),
    });
    const config = resolveBillingConfig(rental);
    const specs = generatePeriodSpecs(rental, config, { horizonDays: 30 });
    expect(specs.length).toBe(4);
    expect(specs.reduce((s, p) => s + p.base_amount, 0)).toBe(1200);
  });

  // Biweekly
  it("biweekly billing uses 14-day intervals", () => {
    const rental = makeRental({
      scheduled_return_date: "2026-09-21",
      billing_config: billingConfig({
        billing_frequency: "biweekly",
        recurring_amount: 750,
      }),
    });
    const config = resolveBillingConfig(rental);
    const specs = generatePeriodSpecs(rental, config, { horizonDays: 30 });
    expect(specs.length).toBeGreaterThanOrEqual(2);
    expect(specs[0].base_amount).toBe(750);
  });

  // Daily
  it("daily billing uses 1-day intervals", () => {
    const rental = makeRental({
      rate_type: "daily",
      rate_amount: 65,
      scheduled_return_date: "2026-08-27",
      billing_config: billingConfig({
        billing_frequency: "daily",
        recurring_amount: 65,
      }),
    });
    const config = resolveBillingConfig(rental);
    const specs = generatePeriodSpecs(rental, config, { horizonDays: 7 });
    expect(specs.length).toBeGreaterThanOrEqual(3);
    expect(specs[0].base_amount).toBe(65);
  });

  // Migration: existing weekly rentals without explicit config
  it("resolveBillingConfig migrates legacy weekly rentals to weekly", () => {
    const legacy = makeRental({
      billing_config: null,
      weekly_payment_day: "Monday",
    });
    const config = resolveBillingConfig(legacy);
    expect(config.billing_frequency).toBe("weekly");
    expect(config.recurring_amount).toBe(400);
  });

  it("resolveBillingConfig defaults non-weekly rentals to upfront", () => {
    const legacy = makeRental({
      rate_type: "daily",
      rate_amount: 65,
      billing_config: null,
      weekly_payment_day: null,
    });
    const config = resolveBillingConfig(legacy);
    expect(config.billing_frequency).toBe("upfront");
  });

  // Fixed-term recurring does not exceed term
  it("fixed-term weekly does not generate periods past the return date", () => {
    const rental = makeRental({ scheduled_return_date: "2026-08-31" });
    const config = resolveBillingConfig(rental);
    const specs = generatePeriodSpecs(rental, config, { horizonDays: 60 });
    for (const s of specs) {
      expect(s.period_start <= "2026-08-31").toBe(true);
    }
  });

  // rentalTermDays
  it("rentalTermDays computes whole days with a 1-day minimum", () => {
    expect(
      rentalTermDays(
        makeRental({
          checkout_date: "2026-08-24",
          scheduled_return_date: "2026-08-27",
        }),
      ),
    ).toBe(3);
  });

  it("rentalTermDays returns 0 for open-ended rentals", () => {
    expect(rentalTermDays(makeRental({ scheduled_return_date: "" }))).toBe(0);
  });
});
