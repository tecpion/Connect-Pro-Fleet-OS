// Vehicle Performance — Expenses, allocation, financing, purchase price.
import { describe, it, expect } from "vitest";
import {
  getVehiclePerformance,
  type VehiclePerformanceInputs,
} from "@/lib/vehiclePerformance";
import { resolvePerformanceRange } from "@/lib/vehiclePerformanceRanges";
import {
  txn,
  expense,
  vehicle,
  rental,
  inputs,
  makeCategory,
} from "./profitabilityFixtures";
import type { ExpenseLineItem } from "@/lib/expenseTypes";

const NOW = new Date("2026-08-20");
const RANGE = resolvePerformanceRange("this_month", NOW);

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

describe("VP — Expenses & allocation", () => {
  it("links expense to one vehicle", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        expenses: [
          expense({
            amount: 200,
            expense_category_id: "cat_maint",
            vehicle_id: "veh_1",
            source: "maintenance_work_order",
          }),
        ],
        expenseCategories: [
          makeCategory("cat_maint", "Maintenance", "maintenance"),
        ],
      }),
      RANGE,
    );
    expect(p.expenseBreakdown.maintenance).toBe(200);
  });

  it("multi-vehicle equal split via line items", () => {
    const exp = expense({
      amount: 1000,
      vehicle_id: null,
      expense_category_id: "cat_other",
    });
    const lines: ExpenseLineItem[] = [1, 2, 3, 4, 5].map((n) => ({
      id: `li_${n}`,
      expense_id: exp.id,
      description: "split",
      category_id: "cat_other",
      amount: 200,
      vehicle_id: `veh_${n}`,
      work_order_id: null,
      notes: null,
    }));
    const inp = perfInputs({
      vehicles: [1, 2, 3, 4, 5].map((n) => vehicle({ id: `veh_${n}` })),
      rentals: [1, 2, 3, 4, 5].map((n) =>
        rental({ id: `rnt_${n}`, vehicle_id: `veh_${n}` }),
      ),
      expenses: [exp],
      expenseLineItems: lines,
      expenseCategories: [makeCategory("cat_other", "Other", "other")],
    });
    expect(
      getVehiclePerformance("veh_1", inp, RANGE).expenseBreakdown.other,
    ).toBe(200);
  });

  it("multi-vehicle custom amount allocation", () => {
    const exp = expense({
      amount: 1000,
      vehicle_id: null,
      expense_category_id: "cat_other",
    });
    const lines: ExpenseLineItem[] = [
      {
        id: "li_1",
        expense_id: exp.id,
        description: "",
        category_id: "cat_other",
        amount: 250,
        vehicle_id: "veh_1",
        work_order_id: null,
        notes: null,
      },
      {
        id: "li_2",
        expense_id: exp.id,
        description: "",
        category_id: "cat_other",
        amount: 750,
        vehicle_id: "veh_2",
        work_order_id: null,
        notes: null,
      },
    ];
    const inp = perfInputs({
      vehicles: [vehicle({ id: "veh_1" }), vehicle({ id: "veh_2" })],
      rentals: [
        rental({ id: "rnt_1", vehicle_id: "veh_1" }),
        rental({ id: "rnt_2", vehicle_id: "veh_2" }),
      ],
      expenses: [exp],
      expenseLineItems: lines,
      expenseCategories: [makeCategory("cat_other", "Other", "other")],
    });
    expect(
      getVehiclePerformance("veh_1", inp, RANGE).expenseBreakdown.other,
    ).toBe(250);
    expect(
      getVehiclePerformance("veh_2", inp, RANGE).expenseBreakdown.other,
    ).toBe(750);
  });

  it("multi-vehicle percentage allocation", () => {
    const exp = expense({
      amount: 2000,
      vehicle_id: null,
      expense_category_id: "cat_other",
    });
    const lines: ExpenseLineItem[] = [
      {
        id: "li_1",
        expense_id: exp.id,
        description: "",
        category_id: "cat_other",
        amount: 800,
        vehicle_id: "veh_1",
        work_order_id: null,
        notes: null,
      },
      {
        id: "li_2",
        expense_id: exp.id,
        description: "",
        category_id: "cat_other",
        amount: 1200,
        vehicle_id: "veh_2",
        work_order_id: null,
        notes: null,
      },
    ];
    const inp = perfInputs({
      vehicles: [vehicle({ id: "veh_1" }), vehicle({ id: "veh_2" })],
      rentals: [
        rental({ id: "rnt_1", vehicle_id: "veh_1" }),
        rental({ id: "rnt_2", vehicle_id: "veh_2" }),
      ],
      expenses: [exp],
      expenseLineItems: lines,
      expenseCategories: [makeCategory("cat_other", "Other", "other")],
    });
    expect(
      getVehiclePerformance("veh_1", inp, RANGE).expenseBreakdown.other,
    ).toBe(800);
    expect(
      getVehiclePerformance("veh_2", inp, RANGE).expenseBreakdown.other,
    ).toBe(1200);
  });

  it("expense category breakdown separates maintenance/insurance/registration", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        expenses: [
          expense({
            id: "e1",
            amount: 300,
            expense_category_id: "cat_maint",
            vehicle_id: "veh_1",
            source: "maintenance_work_order",
          }),
          expense({
            id: "e2",
            amount: 400,
            expense_category_id: "cat_ins",
            vehicle_id: "veh_1",
          }),
          expense({
            id: "e3",
            amount: 100,
            expense_category_id: "cat_reg",
            vehicle_id: "veh_1",
          }),
        ],
        expenseCategories: [
          makeCategory("cat_maint", "Maintenance", "maintenance"),
          makeCategory("cat_ins", "Insurance", "vehicle_direct"),
          makeCategory("cat_reg", "Registration", "vehicle_direct"),
        ],
      }),
      RANGE,
    );
    expect(p.expenseBreakdown.maintenance).toBe(300);
    expect(p.expenseBreakdown.insurance).toBe(400);
    expect(p.expenseBreakdown.registration).toBe(100);
  });

  it("insurance expense allocation per vehicle", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        expenses: [
          expense({
            amount: 600,
            expense_category_id: "cat_ins",
            vehicle_id: "veh_1",
          }),
        ],
        expenseCategories: [
          makeCategory("cat_ins", "Insurance", "vehicle_direct"),
        ],
      }),
      RANGE,
    );
    expect(p.expenseBreakdown.insurance).toBe(600);
  });

  it("registration expense included", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        expenses: [
          expense({
            amount: 120,
            expense_category_id: "cat_reg",
            vehicle_id: "veh_1",
          }),
        ],
        expenseCategories: [
          makeCategory("cat_reg", "Registration", "vehicle_direct"),
        ],
      }),
      RANGE,
    );
    expect(p.expenseBreakdown.registration).toBe(120);
  });

  it("GPS/subscription expense via category name", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        expenses: [
          expense({
            amount: 45,
            expense_category_id: "cat_gps",
            vehicle_id: "veh_1",
          }),
        ],
        expenseCategories: [
          makeCategory("cat_gps", "GPS / Telematics", "vehicle_direct"),
        ],
      }),
      RANGE,
    );
    expect(p.expenseBreakdown.gps).toBe(45);
  });
});

describe("VP — Purchase price & financing", () => {
  it("uses purchase price as acquisition basis", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({ vehicles: [vehicle({ purchase_price: 5200 })] }),
      RANGE,
    );
    expect(p.purchasePrice).toBe(5200);
  });

  it("monthly car-note expense reduces cash-flow contribution", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 5000,
            effective_date: "2026-08-15",
          }),
        ],
        expenses: [
          expense({
            amount: 420,
            expense_category_id: "cat_fin",
            vehicle_id: "veh_1",
          }),
        ],
        expenseCategories: [
          makeCategory("cat_fin", "Financing / Car Note", "vehicle_direct"),
        ],
      }),
      RANGE,
    );
    expect(p.financing.carNotePayments).toBe(420);
    expect(p.financing.financingState).toBe("financed");
    expect(p.cashFlowContribution).toBe(p.operatingContribution - 420);
  });

  it("paid-off state when no financing expense", () => {
    const p = getVehiclePerformance("veh_1", perfInputs(), RANGE);
    expect(p.financing.financingState).toBe("paid_off");
    expect(p.financing.hasFinancingData).toBe(false);
  });
});

describe("VP — Operating vs Cash-Flow", () => {
  it("operating contribution excludes financing", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 20000,
            effective_date: "2026-08-15",
          }),
        ],
        expenses: [
          expense({
            amount: 5000,
            expense_category_id: "cat_maint",
            vehicle_id: "veh_1",
            source: "maintenance_work_order",
          }),
        ],
        expenseCategories: [
          makeCategory("cat_maint", "Maintenance", "maintenance"),
        ],
      }),
      RANGE,
    );
    expect(p.operatingContribution).toBe(15000);
    expect(p.cashFlowContribution).toBe(15000);
  });

  it("cash-flow contribution subtracts car notes", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 20000,
            effective_date: "2026-08-15",
          }),
        ],
        expenses: [
          expense({
            id: "e1",
            amount: 5000,
            expense_category_id: "cat_maint",
            vehicle_id: "veh_1",
            source: "maintenance_work_order",
          }),
          expense({
            id: "e2",
            amount: 4200,
            expense_category_id: "cat_fin",
            vehicle_id: "veh_1",
          }),
        ],
        expenseCategories: [
          makeCategory("cat_maint", "Maintenance", "maintenance"),
          makeCategory("cat_fin", "Financing", "vehicle_direct"),
        ],
      }),
      RANGE,
    );
    expect(p.operatingContribution).toBe(15000);
    expect(p.cashFlowContribution).toBe(10800);
  });
});
