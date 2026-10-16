// Connect Pro Fleet — profitability domain tests (Build #16).
// Revenue recognition, expense attribution, exchanges, investor economics,
// fleet/company P&L, reversals, date ranges.

import { describe, it, expect } from "vitest";
import {
  resolveProfitabilityRange,
  getVehicleProfitability,
  getFleetProfitability,
  getCompanyProfitability,
  getVehiclePerformanceRows,
} from "@/lib/profitabilitySelectors";
import {
  buildRevenueBreakdown,
  isRevenueCharge,
  isTaxCharge,
} from "@/lib/profitabilityHelpers";
import {
  vehicleDayFractions,
  attributeRevenueToVehicles,
} from "@/lib/profitabilityAttribution";
import { projectedPartnerCompensation } from "@/lib/profitabilityInvestor";
import {
  TENANT,
  txn,
  expense,
  vehicle,
  rental,
  inputs,
  makeExchange,
  makePairing,
  makeCategory,
} from "./profitabilityFixtures";

const AUG = resolveProfitabilityRange(
  "this_month",
  undefined,
  new Date("2026-08-15"),
);

describe("Build #16 — revenue recognition", () => {
  it("includes base rental charges", () => {
    const t = txn({ transaction_type: "rental_charge", amount: 350 });
    expect(isRevenueCharge(t)).toBe(true);
    const bd = buildRevenueBreakdown([t]);
    expect(bd.base_rental_revenue).toBe(350);
    expect(bd.total_revenue).toBe(350);
  });

  it("excludes held deposit collection from revenue", () => {
    const t = txn({
      transaction_type: "other_payment",
      category: "payment",
      amount: 300,
      deposit_id: "dep_1",
      metadata: { deposit_kind: "collection" },
    });
    expect(isRevenueCharge(t)).toBe(false);
  });

  it("includes deposit forfeiture as recognized revenue once", () => {
    const t = txn({
      transaction_type: "miscellaneous_charge",
      amount: 100,
      deposit_id: "dep_1",
      metadata: { deposit_kind: "forfeiture" },
    });
    expect(isRevenueCharge(t)).toBe(true);
    const bd = buildRevenueBreakdown([t]);
    expect(bd.forfeiture_revenue).toBe(100);
  });

  it("excludes tax from revenue (pass-through)", () => {
    const t = txn({ transaction_type: "tax_charge", amount: 21 });
    expect(isTaxCharge(t)).toBe(true);
    expect(isRevenueCharge(t)).toBe(false);
    const bd = buildRevenueBreakdown([t]);
    expect(bd.tax_collected).toBe(21);
    expect(bd.total_revenue).toBe(0);
  });

  it("includes late fees as revenue", () => {
    const t = txn({ transaction_type: "late_fee", amount: 50 });
    const bd = buildRevenueBreakdown([t]);
    expect(bd.late_fee_revenue).toBe(50);
  });
});

describe("Build #16 — vehicle P&L", () => {
  it("calculates revenue, expenses, and gross profit", () => {
    const i = inputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 700,
          vehicle_id: "veh_1",
        }),
      ],
      expenses: [expense({ amount: 200, vehicle_id: "veh_1" })],
      expenseCategories: [
        makeCategory("cat_maint", "Maintenance", "vehicle_direct"),
      ],
    });
    const p = getVehicleProfitability("veh_1", i, AUG);
    expect(p.billed_revenue).toBe(700);
    expect(p.expenses.total_direct_expenses).toBe(200);
    expect(p.gross_profit).toBe(500);
  });

  it("supports negative profit", () => {
    const i = inputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 200,
          vehicle_id: "veh_1",
        }),
      ],
      expenses: [expense({ amount: 500, vehicle_id: "veh_1" })],
      expenseCategories: [
        makeCategory("cat_maint", "Maintenance", "vehicle_direct"),
      ],
    });
    const p = getVehicleProfitability("veh_1", i, AUG);
    expect(p.gross_profit).toBe(-300);
  });

  it("excludes company overhead from vehicle P&L", () => {
    const i = inputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 500,
          vehicle_id: "veh_1",
        }),
      ],
      expenses: [
        expense({
          amount: 100,
          vehicle_id: "veh_1",
          expense_category_id: "cat_maint",
        }),
        expense({
          amount: 2000,
          vehicle_id: null,
          rental_id: null,
          maintenance_work_order_id: null,
          expense_category_id: "cat_rent",
        }),
      ],
      expenseCategories: [
        makeCategory("cat_maint", "Maintenance", "vehicle_direct"),
        makeCategory("cat_rent", "Office Rent", "company_overhead"),
      ],
    });
    const p = getVehicleProfitability("veh_1", i, AUG);
    expect(p.expenses.total_direct_expenses).toBe(100);
    expect(p.gross_profit).toBe(400);
  });

  it("counts maintenance work-order expense once", () => {
    const i = inputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 500,
          vehicle_id: "veh_1",
        }),
      ],
      expenses: [
        expense({
          amount: 150,
          vehicle_id: "veh_1",
          source: "maintenance_work_order",
          maintenance_work_order_id: "wo_1",
        }),
      ],
      expenseCategories: [
        makeCategory("cat_maint", "Maintenance", "maintenance"),
      ],
    });
    const p = getVehicleProfitability("veh_1", i, AUG);
    expect(p.expenses.maintenance_expenses).toBe(150);
    expect(p.expenses.total_direct_expenses).toBe(150);
    expect(p.gross_profit).toBe(350);
  });

  it("excludes acquisition spend from operating profit", () => {
    const i = inputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 500,
          vehicle_id: "veh_1",
        }),
      ],
      expenses: [
        expense({
          amount: 5000,
          vehicle_id: "veh_1",
          expense_category_id: "cat_acq",
        }),
      ],
      expenseCategories: [
        makeCategory("cat_acq", "Vehicle Acquisition Cost", "vehicle_direct"),
      ],
    });
    const p = getVehicleProfitability("veh_1", i, AUG);
    expect(p.expenses.acquisition_spend).toBe(5000);
    expect(p.expenses.total_direct_expenses).toBe(0);
    expect(p.gross_profit).toBe(500);
  });

  it("allocates split expense line items to the correct vehicle", () => {
    const li1 = {
      id: "li1",
      expense_id: "exp_split",
      description: "parts",
      category_id: null,
      amount: 250,
      vehicle_id: "veh_1",
      work_order_id: null,
      notes: null,
    };
    const li2 = {
      id: "li2",
      expense_id: "exp_split",
      description: "parts",
      category_id: null,
      amount: 150,
      vehicle_id: "veh_2",
      work_order_id: null,
      notes: null,
    };
    const i = inputs({
      vehicles: [vehicle({ id: "veh_1" }), vehicle({ id: "veh_2" })],
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 500,
          vehicle_id: "veh_1",
        }),
        txn({
          transaction_type: "rental_charge",
          amount: 500,
          vehicle_id: "veh_2",
        }),
      ],
      expenses: [
        expense({
          id: "exp_split",
          amount: 400,
          vehicle_id: null,
          expense_category_id: "cat_parts",
        }),
      ],
      expenseLineItems: [li1, li2],
      expenseCategories: [makeCategory("cat_parts", "Parts", "vehicle_direct")],
    });
    expect(
      getVehicleProfitability("veh_1", i, AUG).expenses.total_direct_expenses,
    ).toBe(250);
    expect(
      getVehicleProfitability("veh_2", i, AUG).expenses.total_direct_expenses,
    ).toBe(150);
  });

  it("handles zero rented days safely", () => {
    const i = inputs({
      rentals: [],
      transactions: [],
      expenses: [expense({ amount: 100, vehicle_id: "veh_1" })],
      expenseCategories: [
        makeCategory("cat_maint", "Maintenance", "vehicle_direct"),
      ],
    });
    const p = getVehicleProfitability("veh_1", i, AUG);
    expect(p.rented_days).toBe(0);
    expect(p.revenue_per_rented_day).toBe(0);
  });
});

describe("Build #16 — exchange revenue allocation", () => {
  // Use a range covering the full rental (Aug 1-31) so neither vehicle is
  // capped at the range boundary.
  const AUG_FULL = resolveProfitabilityRange("custom", {
    start: "2026-08-01",
    end: "2026-08-31",
  });

  it("allocates revenue across exchanged vehicles by days served", () => {
    const r = rental({
      id: "rnt_ex",
      vehicle_id: "veh_2",
      checkout_date: "2026-08-10",
      scheduled_return_date: "2026-08-20",
    });
    const ex = makeExchange({
      rental_id: "rnt_ex",
      old_vehicle_id: "veh_1",
      new_vehicle_id: "veh_2",
      exchange_at: "2026-08-15T00:00:00Z",
    });
    const fracs = vehicleDayFractions(r, [ex], AUG_FULL);
    expect(fracs.get("veh_1")).toBeCloseTo(0.5, 1);
    expect(fracs.get("veh_2")).toBeCloseTo(0.5, 1);
  });

  it("uses explicit vehicle_id when present", () => {
    const r = rental({ id: "rnt_ex2", vehicle_id: "veh_2" });
    const t = txn({ amount: 350, vehicle_id: "veh_2", rental_id: "rnt_ex2" });
    const alloc = attributeRevenueToVehicles(t, r, [], AUG_FULL);
    expect(alloc.get("veh_2")).toBe(350);
    expect(alloc.has("veh_1")).toBe(false);
  });
});

describe("Build #16 — investor/JV economics", () => {
  it("company-owned vehicle retains full operating economics", () => {
    const i = inputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 1000,
          vehicle_id: "veh_1",
        }),
      ],
      expenses: [expense({ amount: 200, vehicle_id: "veh_1" })],
      expenseCategories: [
        makeCategory("cat_maint", "Maintenance", "vehicle_direct"),
      ],
    });
    const p = getVehicleProfitability("veh_1", i, AUG);
    expect(p.investor_compensation).toBeNull();
    expect(p.company_economic_share).toBe(800);
  });

  const bd = (total: number) => ({
    maintenance_expenses: 0,
    registration_expenses: 0,
    insurance_expenses: 0,
    fuel_expenses: 0,
    other_vehicle_expenses: 0,
    total_direct_expenses: total,
    acquisition_spend: 0,
  });
  it("percentage gross agreement uses gross basis", () => {
    const pairing = makePairing({
      compensation: {
        type: "percentage",
        basis: "gross",
        investor_percentage: 60,
        operator_percentage: 40,
        effective_date: "2026-01-01",
        end_date: null,
        notes: null,
      },
    });
    expect(
      projectedPartnerCompensation(pairing, 1000, bd(200), AUG, 10, null)
        .compensation,
    ).toBe(600);
  });

  it("percentage net agreement uses net basis", () => {
    const pairing = makePairing({
      compensation: {
        type: "percentage",
        basis: "net",
        investor_percentage: 60,
        operator_percentage: 40,
        effective_date: "2026-01-01",
        end_date: null,
        notes: null,
      },
    });
    expect(
      projectedPartnerCompensation(pairing, 1000, bd(200), AUG, 10, null)
        .compensation,
    ).toBe(480);
  });

  it("custom compensation is not fabricated", () => {
    const pairing = makePairing({
      compensation: {
        type: "custom",
        description: "custom deal",
        effective_date: "2026-01-01",
        end_date: null,
        notes: null,
      },
    });
    const comp = projectedPartnerCompensation(
      pairing,
      1000,
      bd(200),
      AUG,
      10,
      null,
    );
    expect(comp.compensation).toBeNull();
    expect(comp.type).toBe("custom");
  });
});

describe("Build #16 — fleet & company P&L", () => {
  it("fleet aggregates vehicle revenue and expenses", () => {
    const i = inputs({
      vehicles: [vehicle({ id: "veh_1" }), vehicle({ id: "veh_2" })],
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 500,
          vehicle_id: "veh_1",
        }),
        txn({
          transaction_type: "rental_charge",
          amount: 700,
          vehicle_id: "veh_2",
        }),
      ],
      expenses: [expense({ amount: 100, vehicle_id: "veh_1" })],
      expenseCategories: [
        makeCategory("cat_maint", "Maintenance", "vehicle_direct"),
      ],
    });
    const f = getFleetProfitability(i, AUG);
    expect(f.total_billed_revenue).toBe(1200);
    expect(f.vehicle_direct_expenses).toBe(100);
    expect(f.gross_fleet_profit).toBe(1100);
  });

  it("company P&L includes overhead and processor fees", () => {
    const i = inputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 1000,
          vehicle_id: "veh_1",
        }),
      ],
      expenses: [
        expense({
          amount: 100,
          vehicle_id: "veh_1",
          expense_category_id: "cat_maint",
        }),
        expense({
          amount: 1500,
          vehicle_id: null,
          rental_id: null,
          maintenance_work_order_id: null,
          expense_category_id: "cat_rent",
        }),
        expense({
          amount: 30,
          vehicle_id: null,
          rental_id: null,
          maintenance_work_order_id: null,
          expense_category_id: "cat_proc",
        }),
      ],
      expenseCategories: [
        makeCategory("cat_maint", "Maintenance", "vehicle_direct"),
        makeCategory("cat_rent", "Office Rent", "company_overhead"),
        makeCategory(
          "cat_proc",
          "Merchant Processing Fees",
          "company_overhead",
        ),
      ],
    });
    const c = getCompanyProfitability(i, AUG);
    expect(c.operating_revenue).toBe(1000);
    expect(c.gross_fleet_profit).toBe(900);
    expect(c.company_overhead).toBe(1500);
    expect(c.processor_fees).toBe(30);
    expect(c.operating_profit).toBe(900 - 1500 - 30);
  });

  it("reimbursement settlement is not a second expense", () => {
    const i = inputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 500,
          vehicle_id: "veh_1",
        }),
      ],
      expenses: [
        expense({
          amount: 85,
          vehicle_id: "veh_1",
          paid_by_type: "employee",
          reimbursement_status: "paid",
          expense_category_id: "cat_maint",
        }),
      ],
      expenseCategories: [
        makeCategory("cat_maint", "Maintenance", "vehicle_direct"),
      ],
      expenseReimbursements: [{ status: "paid", amount: 85 }],
    });
    const p = getVehicleProfitability("veh_1", i, AUG);
    expect(p.expenses.total_direct_expenses).toBe(85);
  });
});

describe("Build #16 — reversals", () => {
  it("nets expense reversals correctly", () => {
    const i = inputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 500,
          vehicle_id: "veh_1",
        }),
      ],
      expenses: [
        expense({
          id: "e1",
          amount: 200,
          vehicle_id: "veh_1",
          expense_category_id: "cat_maint",
        }),
        expense({
          id: "e2",
          amount: 200,
          vehicle_id: "veh_1",
          reversal_of: "e1",
          expense_category_id: "cat_maint",
        }),
      ],
      expenseCategories: [
        makeCategory("cat_maint", "Maintenance", "vehicle_direct"),
      ],
    });
    expect(
      getVehicleProfitability("veh_1", i, AUG).expenses.total_direct_expenses,
    ).toBe(0);
  });
});

describe("Build #16 — date ranges", () => {
  it("this month resolves correctly", () => {
    const r = resolveProfitabilityRange(
      "this_month",
      undefined,
      new Date("2026-08-15"),
    );
    expect(r.start.getDate()).toBe(1);
    expect(r.start.getMonth()).toBe(7);
  });

  it("last month resolves correctly", () => {
    const r = resolveProfitabilityRange(
      "last_month",
      undefined,
      new Date("2026-08-15"),
    );
    expect(r.start.getMonth()).toBe(6);
    expect(r.end.getMonth()).toBe(6);
  });

  it("custom range resolves correctly", () => {
    const r = resolveProfitabilityRange("custom", {
      start: "2026-01-01",
      end: "2026-01-31",
    });
    expect(r.start.getMonth()).toBe(0);
    expect(r.end.getDate()).toBe(31);
  });
});

describe("Build #16 — vehicle performance rows", () => {
  it("produces rows with margin", () => {
    const i = inputs({
      vehicles: [vehicle({ id: "veh_1" }), vehicle({ id: "veh_2" })],
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 500,
          vehicle_id: "veh_1",
        }),
        txn({
          transaction_type: "rental_charge",
          amount: 1000,
          vehicle_id: "veh_2",
        }),
      ],
    });
    const rows = getVehiclePerformanceRows(i, AUG);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.vehicle_id === "veh_2")?.revenue).toBe(1000);
  });
});
