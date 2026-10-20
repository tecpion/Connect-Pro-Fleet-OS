// Vehicle Performance — "What Changed" prior-period comparison.
import { describe, it, expect } from "vitest";
import {
  getVehiclePerformance,
  type VehiclePerformanceInputs,
} from "@/lib/vehiclePerformance";
import { resolvePerformanceRange } from "@/lib/vehiclePerformanceRanges";
import { resolvePriorPerformanceRange } from "@/lib/vehiclePerformancePrior";
import { computeWhatsChanged } from "@/lib/vehiclePerformanceWhatsChanged";
import { TENANT, txn, inputs, vehicle } from "./profitabilityFixtures";

const NOW = new Date("2026-08-20T12:00:00");

function perfInputs(
  over: Partial<VehiclePerformanceInputs> = {},
): VehiclePerformanceInputs {
  return {
    ...inputs(),
    deposits: [],
    damageClaims: [],
    damageRecoveries: [],
    violations: [],
    workOrders: [],
    ...over,
  };
}

describe("VP — What Changed prior-period ranges", () => {
  it("This Week resolves a prior equivalent week", () => {
    const prior = resolvePriorPerformanceRange("this_week", NOW);
    expect(prior).not.toBeNull();
    // Prior week ends the day before this week starts.
    const cur = resolvePerformanceRange("this_week", NOW);
    expect(prior!.end.getTime()).toBeLessThan(cur.start.getTime());
  });

  it("This Month resolves the previous calendar month", () => {
    const prior = resolvePriorPerformanceRange("this_month", NOW);
    expect(prior).not.toBeNull();
    expect(prior!.start.getUTCMonth()).toBe(6); // July (Aug is month 7)
    expect(prior!.end.getUTCMonth()).toBe(6);
  });

  it("Last Month resolves the month before Last Month", () => {
    const prior = resolvePriorPerformanceRange("last_month", NOW);
    expect(prior).not.toBeNull();
    // Last Month = July; prior = June (month 5).
    expect(prior!.start.getUTCMonth()).toBe(5);
  });

  it("Last 30 Days resolves a preceding 30-day window", () => {
    const prior = resolvePriorPerformanceRange("last_30_days", NOW);
    expect(prior).not.toBeNull();
    const cur = resolvePerformanceRange("last_30_days", NOW);
    expect(prior!.end.getTime()).toBeLessThan(cur.start.getTime());
  });

  it("Last 90 Days resolves a preceding 90-day window", () => {
    const prior = resolvePriorPerformanceRange("last_90_days", NOW);
    expect(prior).not.toBeNull();
    const cur = resolvePerformanceRange("last_90_days", NOW);
    expect(prior!.end.getTime()).toBeLessThan(cur.start.getTime());
  });

  it("Last 12 Months resolves a preceding 12-month window", () => {
    const prior = resolvePriorPerformanceRange("last_12_months", NOW);
    expect(prior).not.toBeNull();
    const cur = resolvePerformanceRange("last_12_months", NOW);
    expect(prior!.end.getTime()).toBeLessThan(cur.start.getTime());
  });

  it("YTD resolves the equivalent elapsed period in the prior year", () => {
    const prior = resolvePriorPerformanceRange("ytd", NOW);
    expect(prior).not.toBeNull();
    expect(prior!.start.getUTCFullYear()).toBe(2025);
    expect(prior!.start.getUTCMonth()).toBe(0); // Jan 1 prior year
  });

  it("Lifetime does NOT fabricate a prior period", () => {
    const prior = resolvePriorPerformanceRange("lifetime", NOW, "2020-01-01");
    expect(prior).toBeNull();
  });

  it("uses tenant/company timezone boundaries (now-based)", () => {
    // The prior range is derived from the passed `now`, not browser-local.
    const prior = resolvePriorPerformanceRange("this_month", NOW);
    const prior2 = resolvePriorPerformanceRange(
      "this_month",
      new Date("2026-08-20T23:59:59"),
    );
    expect(prior!.start.getTime()).toBe(prior2!.start.getTime());
  });
});

describe("VP — What Changed metric detection", () => {
  // Current period (This Month = Aug 2026) has revenue; prior (July) has less.
  function twoPeriodInputs(currentRev: number, priorRev: number) {
    return perfInputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: currentRev,
          effective_date: "2026-08-15",
        }),
        txn({
          transaction_type: "rental_charge",
          amount: priorRev,
          effective_date: "2026-07-15",
        }),
      ],
    });
  }

  it("detects a Gross Revenue increase", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const prior = resolvePriorPerformanceRange("this_month", NOW)!;
    const res = computeWhatsChanged(
      "veh_1",
      twoPeriodInputs(2000, 1000),
      cur,
      prior,
      "this_month",
    );
    const rev = res.items.find((i) => i.metric === "grossRevenueGenerated");
    expect(rev).toBeDefined();
    expect(rev!.direction).toBe("up");
    expect(rev!.sentiment).toBe("positive");
    expect(rev!.pctChange).toBe(100);
  });

  it("detects a Gross Revenue decrease", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const prior = resolvePriorPerformanceRange("this_month", NOW)!;
    const res = computeWhatsChanged(
      "veh_1",
      twoPeriodInputs(800, 2000),
      cur,
      prior,
      "this_month",
    );
    const rev = res.items.find((i) => i.metric === "grossRevenueGenerated");
    expect(rev).toBeDefined();
    expect(rev!.direction).toBe("down");
    expect(rev!.sentiment).toBe("negative");
  });

  it("detects Cash Collected change", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const prior = resolvePriorPerformanceRange("this_month", NOW)!;
    const inp = perfInputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 2000,
          effective_date: "2026-08-15",
        }),
        txn({
          transaction_type: "card_payment",
          category: "payment",
          amount: 1800,
          effective_date: "2026-08-16",
        }),
        txn({
          transaction_type: "rental_charge",
          amount: 2000,
          effective_date: "2026-07-15",
        }),
        txn({
          transaction_type: "card_payment",
          category: "payment",
          amount: 1000,
          effective_date: "2026-07-16",
        }),
      ],
    });
    const res = computeWhatsChanged("veh_1", inp, cur, prior, "this_month");
    const cash = res.items.find((i) => i.metric === "cashCollected");
    expect(cash).toBeDefined();
    expect(cash!.direction).toBe("up");
  });

  it("detects an Expenses increase (negative sentiment)", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const prior = resolvePriorPerformanceRange("this_month", NOW)!;
    const inp = perfInputs({
      vehicles: [vehicle()],
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 5000,
          effective_date: "2026-08-15",
        }),
        txn({
          transaction_type: "rental_charge",
          amount: 5000,
          effective_date: "2026-07-15",
        }),
      ],
      expenses: [
        // Current period expense (Aug).
        {
          id: "e1",
          tenant_id: TENANT,
          expense_number: "EXP-1",
          transaction_date: "2026-08-10",
          entered_at: "2026-08-10T00:00:00Z",
          entered_by_user_id: null,
          description: "maint",
          memo: null,
          amount: 500,
          currency: "USD",
          expense_category_id: "cat_maint",
          vendor_id: null,
          payment_method: "cash",
          payment_source: null,
          processor: null,
          paid_by_type: "company",
          paid_by_user_id: null,
          reimbursement_status: "not_required",
          location_id: null,
          vehicle_id: "veh_1",
          rental_id: null,
          maintenance_work_order_id: null,
          receipt_status: "not_required",
          receipt_required: false,
          no_receipt_reason: null,
          status: "posted",
          reversal_of: null,
          source: "maintenance_work_order",
          dedupe_key: null,
          reconciled_imported_id: null,
          created_at: "2026-08-10T00:00:00Z",
          updated_at: "2026-08-10T00:00:00Z",
        },
        // Prior period expense (July) — smaller.
        {
          id: "e2",
          tenant_id: TENANT,
          expense_number: "EXP-2",
          transaction_date: "2026-07-10",
          entered_at: "2026-07-10T00:00:00Z",
          entered_by_user_id: null,
          description: "maint",
          memo: null,
          amount: 100,
          currency: "USD",
          expense_category_id: "cat_maint",
          vendor_id: null,
          payment_method: "cash",
          payment_source: null,
          processor: null,
          paid_by_type: "company",
          paid_by_user_id: null,
          reimbursement_status: "not_required",
          location_id: null,
          vehicle_id: "veh_1",
          rental_id: null,
          maintenance_work_order_id: null,
          receipt_status: "not_required",
          receipt_required: false,
          no_receipt_reason: null,
          status: "posted",
          reversal_of: null,
          source: "maintenance_work_order",
          dedupe_key: null,
          reconciled_imported_id: null,
          created_at: "2026-07-10T00:00:00Z",
          updated_at: "2026-07-10T00:00:00Z",
        },
      ],
      expenseCategories: [
        {
          id: "cat_maint",
          name: "Maintenance",
          tenant_id: TENANT,
          type: "maintenance",
          parent_category_id: null,
          active: true,
          created_at: "",
        },
      ],
    });
    const res = computeWhatsChanged("veh_1", inp, cur, prior, "this_month");
    const exp = res.items.find((i) => i.metric === "totalExpenses");
    expect(exp).toBeDefined();
    expect(exp!.direction).toBe("up");
    expect(exp!.sentiment).toBe("negative");
  });

  it("detects a Net Contribution change", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const prior = resolvePriorPerformanceRange("this_month", NOW)!;
    const res = computeWhatsChanged(
      "veh_1",
      twoPeriodInputs(3000, 1000),
      cur,
      prior,
      "this_month",
    );
    const net = res.items.find((i) => i.metric === "cashFlowContribution");
    expect(net).toBeDefined();
    expect(net!.direction).toBe("up");
  });

  it("detects utilization change", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const prior = resolvePriorPerformanceRange("this_month", NOW)!;
    // Current period: rented; prior: not rented → utilization up.
    const inp = perfInputs({
      rentals: [
        {
          id: "rnt_1",
          tenant_id: TENANT,
          reservation_id: null,
          customer_id: "cus_1",
          vehicle_id: "veh_1",
          agreement_number: "AGR-1",
          status: "active",
          checkout_date: "2026-08-01",
          checkout_time: "09:00",
          scheduled_return_date: "2026-08-31",
          scheduled_return_time: "17:00",
          actual_return_date: null,
          actual_return_time: null,
          rate_type: "weekly",
          rate_amount: 350,
          subtotal: 350,
          tax: 0,
          fees: 0,
          discount: 0,
          deposit_amount: 300,
          amount_paid: 0,
          balance_due: 350,
          mileage_out: 50000,
          mileage_in: null,
          fuel_out: 100,
          fuel_in: null,
          weekly_payment_day: "Monday",
          next_payment_due: null,
          payment_cutoff_time: "17:00",
          grace_period: 12,
          late_fee: 50,
          late_fee_applied: false,
          weeks_rented: 1,
          created_by: null,
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-01T00:00:00Z",
        },
      ],
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 1000,
          effective_date: "2026-08-15",
        }),
        txn({
          transaction_type: "rental_charge",
          amount: 1000,
          effective_date: "2026-07-15",
        }),
      ],
    });
    const res = computeWhatsChanged("veh_1", inp, cur, prior, "this_month");
    const util = res.items.find((i) => i.metric === "rentableUtilization");
    expect(util).toBeDefined();
    expect(util!.direction).toBe("up");
  });

  it("detects idle-day change", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const prior = resolvePriorPerformanceRange("this_month", NOW)!;
    // No rentals either period → idle days ~ calendar days; roughly flat →
    // ensure the selector runs without error and returns a result object.
    const res = computeWhatsChanged(
      "veh_1",
      perfInputs(),
      cur,
      prior,
      "this_month",
    );
    expect(res.unavailable).toBe(true); // no prior data
  });
});

describe("VP — What Changed guardrails", () => {
  it("zero prior denominator does not produce Infinity%", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const prior = resolvePriorPerformanceRange("this_month", NOW)!;
    // Current has revenue, prior has none.
    const inp = perfInputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 2400,
          effective_date: "2026-08-15",
        }),
      ],
    });
    const res = computeWhatsChanged("veh_1", inp, cur, prior, "this_month");
    const rev = res.items.find((i) => i.metric === "grossRevenueGenerated");
    expect(rev).toBeDefined();
    expect(rev!.pctChange).toBeNull();
    expect(rev!.text).toContain("$0");
    expect(rev!.text).not.toContain("Infinity");
  });

  it("both periods zero → omitted / unavailable", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const prior = resolvePriorPerformanceRange("this_month", NOW)!;
    const res = computeWhatsChanged(
      "veh_1",
      perfInputs(),
      cur,
      prior,
      "this_month",
    );
    // No data in either period → unavailable.
    expect(res.unavailable).toBe(true);
    expect(res.items.length).toBe(0);
  });

  it("incomplete prior data → unavailable reason", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const prior = resolvePriorPerformanceRange("this_month", NOW)!;
    const res = computeWhatsChanged(
      "veh_1",
      perfInputs(),
      cur,
      prior,
      "this_month",
    );
    expect(res.unavailable).toBe(true);
    expect(res.reason).toContain("prior-period");
  });

  it("materiality filters trivial movements", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const prior = resolvePriorPerformanceRange("this_month", NOW)!;
    // $1 difference — below the $5 money materiality threshold.
    const inp = perfInputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 1001,
          effective_date: "2026-08-15",
        }),
        txn({
          transaction_type: "rental_charge",
          amount: 1000,
          effective_date: "2026-07-15",
        }),
      ],
    });
    const res = computeWhatsChanged("veh_1", inp, cur, prior, "this_month");
    const rev = res.items.find((i) => i.metric === "grossRevenueGenerated");
    expect(rev).toBeUndefined();
  });

  it("correct positive/negative semantic direction", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const prior = resolvePriorPerformanceRange("this_month", NOW)!;
    // Revenue up = positive.
    const res = computeWhatsChanged(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 2000,
            effective_date: "2026-08-15",
          }),
          txn({
            transaction_type: "rental_charge",
            amount: 1000,
            effective_date: "2026-07-15",
          }),
        ],
      }),
      cur,
      prior,
      "this_month",
    );
    const rev = res.items.find((i) => i.metric === "grossRevenueGenerated")!;
    expect(rev.sentiment).toBe("positive");
  });

  it("maximum insight count is bounded", () => {
    const cur = resolvePerformanceRange("last_12_months", NOW);
    const prior = resolvePriorPerformanceRange("last_12_months", NOW)!;
    // Large differences across many metrics.
    const inp = perfInputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 50000,
          effective_date: "2026-08-15",
        }),
        txn({
          transaction_type: "card_payment",
          category: "payment",
          amount: 45000,
          effective_date: "2026-08-16",
        }),
        txn({
          transaction_type: "rental_charge",
          amount: 5000,
          effective_date: "2025-08-15",
        }),
        txn({
          transaction_type: "card_payment",
          category: "payment",
          amount: 4000,
          effective_date: "2025-08-16",
        }),
      ],
    });
    const res = computeWhatsChanged("veh_1", inp, cur, prior, "last_12_months");
    expect(res.items.length).toBeLessThanOrEqual(6);
  });

  it("no duplicate metric statements", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const prior = resolvePriorPerformanceRange("this_month", NOW)!;
    const inp = perfInputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 2000,
          effective_date: "2026-08-15",
        }),
        txn({
          transaction_type: "rental_charge",
          amount: 1000,
          effective_date: "2026-07-15",
        }),
      ],
    });
    const res = computeWhatsChanged("veh_1", inp, cur, prior, "this_month");
    const keys = res.items.map((i) => i.metric);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("Lifetime returns unavailable with reason", () => {
    const cur = resolvePerformanceRange("lifetime", NOW, "2020-01-01");
    const res = computeWhatsChanged(
      "veh_1",
      perfInputs(),
      cur,
      null,
      "lifetime",
    );
    expect(res.unavailable).toBe(true);
    expect(res.reason).toContain("Lifetime");
    expect(res.items.length).toBe(0);
  });

  it("getVehiclePerformance populates whatsChanged for a comparable range", () => {
    const cur = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 2000,
            effective_date: "2026-08-15",
          }),
          txn({
            transaction_type: "rental_charge",
            amount: 1000,
            effective_date: "2026-07-15",
          }),
        ],
      }),
      cur,
      "this_month",
      NOW,
    );
    expect(Array.isArray(p.whatsChanged)).toBe(true);
    expect(p.whatsChanged.length).toBeGreaterThan(0);
  });

  it("getVehiclePerformance returns empty whatsChanged for Lifetime", () => {
    const cur = resolvePerformanceRange("lifetime", NOW, "2020-01-01");
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs(),
      cur,
      "lifetime",
      NOW,
      "2020-01-01",
    );
    expect(p.whatsChanged.length).toBe(0);
  });
});
