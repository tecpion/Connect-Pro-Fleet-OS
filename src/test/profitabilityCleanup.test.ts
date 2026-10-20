// Connect Pro Fleet — Build #16 final cleanup tests.
// Investor/JV profitability accuracy + reporting semantics:
//   - period-aware fixed compensation (weekly/biweekly/monthly)
//   - effective-date exclusion
//   - guarantee/downtime behavior
//   - expense-rule-aware net basis (no company overhead in investor net)
//   - custom → null (not zero)
//   - company-only fee revenue vs vehicle fee revenue
//   - deposit forfeiture recognized once
//   - acquisition spend outside operating profit
//   - class/location aggregation renders
//   - privacy-inference safeguards

import { describe, it, expect } from "vitest";
import {
  resolveProfitabilityRange,
  getVehicleProfitability,
  getFleetProfitability,
  getCompanyProfitability,
  getClassProfitability,
  getLocationProfitability,
} from "@/lib/profitabilitySelectors";
import { projectedPartnerCompensation } from "@/lib/profitabilityInvestor";
import {
  isCompanyOnlyFeeRevenue,
  isVehicleEligibleRevenue,
} from "@/lib/profitabilityHelpers";
import {
  TENANT,
  txn,
  expense,
  vehicle,
  rental,
  inputs,
  makePairing,
  makeCategory,
} from "./profitabilityFixtures";
import type { PartnershipExpenseRule } from "@/lib/partnershipTypes";

// Build the pinned "as of" as a LOCAL calendar date (not a UTC-parsed
// date-only string); see profitabilityDomain.test.ts for the rationale.
const AUG = resolveProfitabilityRange(
  "this_month",
  undefined,
  new Date(2026, 7, 15, 12, 0, 0),
);
const AUG_FULL = resolveProfitabilityRange("custom", {
  start: "2026-08-01",
  end: "2026-08-31",
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

function rule(
  pairingId: string,
  category: string,
  treatment: "deduct_before_split" | "operator_pays" | "investor_pays",
): PartnershipExpenseRule {
  return {
    id: "per_" + category,
    tenant_id: TENANT,
    pairing_id: pairingId,
    category: category as PartnershipExpenseRule["category"],
    treatment,
    notes: null,
  };
}

describe("Build #16 cleanup — fixed compensation period logic", () => {
  it("weekly fixed compensation scales across eligible weeks", () => {
    const pairing = makePairing({
      vehicle_id: "veh_1",
      compensation: {
        type: "fixed",
        fixed_amount: 300,
        fixed_frequency: "weekly",
        guaranteed_when_not_rented: true,
        guaranteed_during_downtime: true,
        effective_date: "2026-08-01",
        end_date: null,
        notes: null,
      },
    });
    // Aug 1–31 = 31 days → 4 complete weeks → 4 × 300 = 1200
    const comp = projectedPartnerCompensation(
      pairing,
      5000,
      bd(1000),
      AUG_FULL,
      20,
      null,
    );
    expect(comp.compensation).toBe(1200);
    expect(comp.type).toBe("fixed");
  });

  it("biweekly fixed compensation respects frequency", () => {
    const pairing = makePairing({
      vehicle_id: "veh_1",
      compensation: {
        type: "fixed",
        fixed_amount: 750,
        fixed_frequency: "biweekly",
        guaranteed_when_not_rented: true,
        guaranteed_during_downtime: true,
        effective_date: "2026-08-01",
        end_date: null,
        notes: null,
      },
    });
    // 31 days → 2 complete biweekly periods → 2 × 750 = 1500
    const comp = projectedPartnerCompensation(
      pairing,
      5000,
      bd(1000),
      AUG_FULL,
      20,
      null,
    );
    expect(comp.compensation).toBe(1500);
  });

  it("monthly fixed compensation uses monthly period semantics", () => {
    const pairing = makePairing({
      vehicle_id: "veh_1",
      compensation: {
        type: "fixed",
        fixed_amount: 500,
        fixed_frequency: "monthly",
        guaranteed_when_not_rented: true,
        guaranteed_during_downtime: true,
        effective_date: "2026-08-01",
        end_date: null,
        notes: null,
      },
    });
    // 31 days → 1 complete 30-day month → 1 × 500 = 500 (NOT 4 × weekly)
    const comp = projectedPartnerCompensation(
      pairing,
      5000,
      bd(1000),
      AUG_FULL,
      20,
      null,
    );
    expect(comp.compensation).toBe(500);
  });

  it("effective date excludes pre-agreement dates", () => {
    const pairing = makePairing({
      vehicle_id: "veh_1",
      compensation: {
        type: "fixed",
        fixed_amount: 300,
        fixed_frequency: "weekly",
        guaranteed_when_not_rented: true,
        guaranteed_during_downtime: true,
        effective_date: "2026-08-15",
        end_date: null,
        notes: null,
      },
    });
    // Agreement active Aug 15–31 = 17 days → 2 complete weeks → 600
    const comp = projectedPartnerCompensation(
      pairing,
      5000,
      bd(1000),
      AUG_FULL,
      20,
      null,
    );
    expect(comp.compensation).toBe(600);
  });

  it("non-guaranteed fixed payout is $0 when vehicle not rented", () => {
    const pairing = makePairing({
      vehicle_id: "veh_1",
      compensation: {
        type: "fixed",
        fixed_amount: 300,
        fixed_frequency: "weekly",
        guaranteed_when_not_rented: false,
        guaranteed_during_downtime: false,
        effective_date: "2026-08-01",
        end_date: null,
        notes: null,
      },
    });
    const comp = projectedPartnerCompensation(
      pairing,
      0,
      bd(0),
      AUG_FULL,
      0,
      null,
    );
    expect(comp.compensation).toBe(0);
  });

  it("guaranteed fixed payout applies even when not rented", () => {
    const pairing = makePairing({
      vehicle_id: "veh_1",
      compensation: {
        type: "fixed",
        fixed_amount: 300,
        fixed_frequency: "weekly",
        guaranteed_when_not_rented: true,
        guaranteed_during_downtime: true,
        effective_date: "2026-08-01",
        end_date: null,
        notes: null,
      },
    });
    const comp = projectedPartnerCompensation(
      pairing,
      0,
      bd(0),
      AUG_FULL,
      0,
      null,
    );
    expect(comp.compensation).toBe(1200);
  });
});

describe("Build #16 cleanup — percentage net + expense rules", () => {
  it("percentage net uses only deduct_before_split expense rules", () => {
    const pairing = makePairing({
      id: "iv_1",
      vehicle_id: "veh_1",
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
    // Only maintenance is deductible (200); insurance (100) is NOT deductible.
    const breakdown = {
      maintenance_expenses: 200,
      registration_expenses: 0,
      insurance_expenses: 100,
      fuel_expenses: 0,
      other_vehicle_expenses: 0,
      total_direct_expenses: 300,
      acquisition_spend: 0,
    };
    const rules = [
      rule("iv_1", "maintenance", "deduct_before_split"),
      rule("iv_1", "insurance", "operator_pays"),
    ];
    const comp = projectedPartnerCompensation(
      pairing,
      1000,
      breakdown,
      AUG,
      10,
      rules,
    );
    // base = 1000 - 200 = 800; 60% = 480
    expect(comp.compensation).toBe(480);
  });

  it("company overhead is not included in investor net basis", () => {
    const pairing = makePairing({
      id: "iv_1",
      vehicle_id: "veh_1",
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
    // Direct expenses 300, no expense rules → legacy deducts all direct (300).
    // Company overhead never enters this calculation.
    const breakdown = {
      maintenance_expenses: 200,
      registration_expenses: 0,
      insurance_expenses: 100,
      fuel_expenses: 0,
      other_vehicle_expenses: 0,
      total_direct_expenses: 300,
      acquisition_spend: 0,
    };
    const comp = projectedPartnerCompensation(
      pairing,
      1000,
      breakdown,
      AUG,
      10,
      null,
    );
    expect(comp.compensation).toBe(420);
  });

  it("custom compensation returns null, not zero", () => {
    const pairing = makePairing({
      vehicle_id: "veh_1",
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

describe("Build #16 cleanup — fee company-vs-vehicle revenue", () => {
  it("non-vehicle-eligible operator fee remains valid company revenue", () => {
    const fee = txn({
      transaction_type: "fee_charge",
      amount: 50,
      vehicle_id: "veh_1",
      metadata: { include_in_vehicle_revenue: false },
    });
    expect(isCompanyOnlyFeeRevenue(fee)).toBe(true);
    expect(isVehicleEligibleRevenue(fee)).toBe(false);
  });

  it("same fee is excluded from vehicle revenue when configured", () => {
    const i = inputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 500,
          vehicle_id: "veh_1",
        }),
        txn({
          transaction_type: "fee_charge",
          amount: 50,
          vehicle_id: "veh_1",
          metadata: { include_in_vehicle_revenue: false },
        }),
      ],
    });
    const p = getVehicleProfitability("veh_1", i, AUG);
    // Vehicle revenue excludes the company-only fee.
    expect(p.billed_revenue).toBe(500);
    expect(p.revenue.fee_revenue).toBe(0);
  });

  it("company-only fee is added back at company level", () => {
    const i = inputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 500,
          vehicle_id: "veh_1",
        }),
        txn({
          transaction_type: "fee_charge",
          amount: 50,
          vehicle_id: "veh_1",
          metadata: { include_in_vehicle_revenue: false },
        }),
      ],
    });
    const c = getCompanyProfitability(i, AUG);
    // Company operating revenue = 500 (vehicle) + 50 (company-only fee) = 550
    expect(c.operating_revenue).toBe(550);
  });

  it("vehicle-eligible fee is included in vehicle revenue", () => {
    const i = inputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 500,
          vehicle_id: "veh_1",
        }),
        txn({
          transaction_type: "fee_charge",
          amount: 50,
          vehicle_id: "veh_1",
          metadata: { include_in_vehicle_revenue: true },
        }),
      ],
    });
    const p = getVehicleProfitability("veh_1", i, AUG);
    expect(p.billed_revenue).toBe(550);
    expect(p.revenue.fee_revenue).toBe(50);
  });
});

describe("Build #16 cleanup — deposit forfeiture + acquisition", () => {
  it("deposit forfeiture recognized once as revenue", () => {
    const i = inputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 500,
          vehicle_id: "veh_1",
        }),
        txn({
          transaction_type: "miscellaneous_charge",
          amount: 100,
          vehicle_id: "veh_1",
          deposit_id: "dep_1",
          metadata: { deposit_kind: "forfeiture" },
        }),
      ],
    });
    const p = getVehicleProfitability("veh_1", i, AUG);
    expect(p.revenue.forfeiture_revenue).toBe(100);
    expect(p.billed_revenue).toBe(600);
  });

  it("acquisition spend remains outside operating profit", () => {
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
    const c = getCompanyProfitability(i, AUG);
    expect(c.acquisition_spend).toBe(5000);
    expect(c.operating_profit).toBe(500);
  });
});

describe("Build #16 cleanup — class & location aggregation", () => {
  it("class aggregation renders and calculates", () => {
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
    });
    const rows = getClassProfitability(i, AUG);
    expect(rows.length).toBeGreaterThan(0);
    const mid = rows.find((r) => r.class_name === "Midsize");
    expect(mid).toBeTruthy();
    expect(mid!.revenue).toBe(1200);
  });

  it("location aggregation renders and calculates", () => {
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
    });
    const rows = getLocationProfitability(i, AUG);
    expect(rows.length).toBeGreaterThan(0);
    const main = rows.find((r) => r.location_name === "Main Lot");
    expect(main).toBeTruthy();
    expect(main!.revenue).toBe(1200);
  });
});

describe("Build #16 cleanup — company-owned + double-subtraction", () => {
  it("company-owned vehicle has no partner deduction", () => {
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

  it("partner compensation is not double-subtracted in company P&L", () => {
    const pairing = makePairing({
      vehicle_id: "veh_1",
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
      investorVehicles: [pairing],
    });
    const c = getCompanyProfitability(i, AUG);
    // Gross fleet profit = 800. Partner comp = 600 (gross 60%).
    // Operating profit = gross fleet profit - overhead - processor fees.
    // Partner comp is NOT subtracted again from operating profit (it's already
    // reflected in company_economic_share, not in the company operating profit line).
    expect(c.gross_fleet_profit).toBe(800);
    expect(c.partner_compensation).toBe(600);
    expect(c.company_overhead).toBe(0);
    expect(c.processor_fees).toBe(0);
    expect(c.operating_profit).toBe(800);
  });
});
