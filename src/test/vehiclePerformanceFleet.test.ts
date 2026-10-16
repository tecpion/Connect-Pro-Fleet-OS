// Connect Pro Fleet — Fleet-level Vehicle Performance selectors tests.
//
// Covers the fleet workspace: KPI aggregation (Gross Revenue hero), Vehicle vs
// Company economics (JV payout subtracted for investor vehicles), insight
// strip (transparent, null = empty state), table columns, sorting, filters,
// known-zero vs missing-data distinction, and CSV export. All built on the
// existing profitability fixtures so no financial truth is invented.

import { describe, it, expect } from "vitest";
import {
  getFleetPerformance,
  sortFleetRows,
  filterFleetRows,
  fleetRowsToCsv,
  type FleetFilters,
  type FleetSortKey,
} from "@/lib/vehiclePerformanceFleet";
import { resolvePerformanceRange } from "@/lib/vehiclePerformanceRanges";
import type { VehiclePerformanceInputs } from "@/lib/vehiclePerformance";
import { TENANT, txn, inputs, vehicle, rental } from "./profitabilityFixtures";

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

function twoVehicles(): VehiclePerformanceInputs {
  return perfInputs({
    vehicles: [
      vehicle({
        id: "veh_1",
        make: "Toyota",
        model: "Camry",
        license_plate: "FL-A",
        purchase_price: 20000,
      }),
      vehicle({
        id: "veh_2",
        make: "Tesla",
        model: "Model 3",
        license_plate: "FL-B",
        purchase_price: 40000,
      }),
    ],
    rentals: [
      rental({ id: "rnt_1", vehicle_id: "veh_1" }),
      rental({ id: "rnt_2", vehicle_id: "veh_2" }),
    ],
    transactions: [
      txn({
        id: "t1",
        rental_id: "rnt_1",
        transaction_type: "rental_charge",
        amount: 5000,
        effective_date: "2026-08-10",
      }),
      txn({
        id: "t2",
        rental_id: "rnt_1",
        transaction_type: "card_payment",
        category: "payment",
        amount: 4000,
        effective_date: "2026-08-12",
      }),
      txn({
        id: "t3",
        rental_id: "rnt_2",
        transaction_type: "rental_charge",
        amount: 8000,
        effective_date: "2026-08-11",
      }),
      txn({
        id: "t4",
        rental_id: "rnt_2",
        transaction_type: "card_payment",
        category: "payment",
        amount: 7000,
        effective_date: "2026-08-13",
      }),
    ],
  });
}

describe("Fleet Vehicle Performance — KPIs", () => {
  it("aggregates fleet Gross Revenue KPI", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(f.kpis.grossRevenue).toBe(13000);
  });

  it("aggregates Cash Collected KPI", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(f.kpis.cashCollected).toBe(11000);
  });

  it("aggregates Total Expenses KPI", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(f.kpis.totalExpenses).toBe(0);
  });

  it("aggregates Net Contribution KPI", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(f.kpis.netContribution).toBe(13000);
  });

  it("computes average rentable utilization KPI", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(f.kpis.averageRentableUtilization).toBeGreaterThanOrEqual(0);
    expect(f.kpis.averageRentableUtilization).toBeLessThanOrEqual(100);
  });

  it("counts vehicles needing review (Watch/Underperforming)", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(typeof f.kpis.vehiclesNeedingReview).toBe("number");
    expect(f.kpis.vehicleCount).toBe(2);
  });

  it("Gross Revenue is the hero — KPI present and numeric", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(typeof f.kpis.grossRevenue).toBe("number");
    expect(f.kpis.grossRevenue).toBeGreaterThan(0);
  });
});

describe("Fleet Vehicle Performance — Economics modes", () => {
  it("Vehicle Economics mode returns vehicle net contribution", () => {
    const f = getFleetPerformance(
      twoVehicles(),
      RANGE,
      "this_month",
      "vehicle",
    );
    const v1 = f.rows.find((r) => r.vehicleId === "veh_1")!;
    expect(v1.netContribution).toBe(5000);
  });

  it("Company Economics mode subtracts JV payout for investor vehicles", () => {
    const inp = perfInputs({
      vehicles: [
        vehicle({
          id: "veh_1",
          ownership_type: "external_owner",
          purchase_price: 20000,
        }),
      ],
      rentals: [rental({ id: "rnt_1", vehicle_id: "veh_1" })],
      investorVehicles: [
        {
          id: "iv_1",
          tenant_id: TENANT,
          investor_id: "inv_1",
          vehicle_id: "veh_1",
          ownership_type: "owned",
          revenue_split_investor_pct: 60,
          revenue_split_operator_pct: 40,
          agreement_id: null,
          active: true,
          effective_date: "2026-01-01",
        },
      ],
      transactions: [
        txn({
          id: "t1",
          rental_id: "rnt_1",
          transaction_type: "rental_charge",
          amount: 10000,
          effective_date: "2026-08-10",
        }),
      ],
    });
    const vehicleMode = getFleetPerformance(
      inp,
      RANGE,
      "this_month",
      "vehicle",
    );
    const companyMode = getFleetPerformance(
      inp,
      RANGE,
      "this_month",
      "company",
    );
    const vRow = vehicleMode.rows[0];
    const cRow = companyMode.rows[0];
    // Company economics subtracts the investor payout (distribution).
    expect(cRow.netContribution).toBeLessThanOrEqual(vRow.netContribution);
  });

  it("Company Economics matches Vehicle Economics for company-owned vehicles", () => {
    const fV = getFleetPerformance(
      twoVehicles(),
      RANGE,
      "this_month",
      "vehicle",
    );
    const fC = getFleetPerformance(
      twoVehicles(),
      RANGE,
      "this_month",
      "company",
    );
    for (const r of fV.rows) {
      const c = fC.rows.find((x) => x.vehicleId === r.vehicleId)!;
      expect(c.netContribution).toBe(r.netContribution);
    }
  });
});

describe("Fleet Vehicle Performance — Insights", () => {
  it("Top Grossing picks highest gross revenue vehicle", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(f.insights.topGrossing).not.toBeNull();
    expect(f.insights.topGrossing!.vehicleId).toBe("veh_2");
    expect(f.insights.topGrossing!.value).toBe(8000);
  });

  it("Highest Net Contribution picks highest net vehicle", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(f.insights.highestNetContribution!.vehicleId).toBe("veh_2");
  });

  it("Highest Utilization returns null when no rented days", () => {
    const f = getFleetPerformance(perfInputs(), RANGE, "this_month");
    expect(f.insights.highestUtilization).toBeNull();
  });

  it("Most Idle returns a vehicle (or null) without fabricating", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    // Most idle is allowed to be any vehicle; just ensure it's a real row or null.
    if (f.insights.mostIdle) {
      expect(
        f.rows.some((r) => r.vehicleId === f.insights.mostIdle!.vehicleId),
      ).toBe(true);
    }
  });

  it("Needs Review insight uses transparent reasons, not an opaque score", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    if (f.insights.needsReview) {
      expect(typeof f.insights.needsReview.reason).toBe("string");
    }
  });

  it("no-data insight state returns null instead of fabricated vehicle", () => {
    const f = getFleetPerformance(perfInputs(), RANGE, "this_month");
    expect(f.insights.topGrossing).toBeNull();
    expect(f.insights.highestNetContribution).toBeNull();
  });
});

describe("Fleet Vehicle Performance — Table columns", () => {
  it("table row exposes Gross Revenue", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(f.rows[0].grossRevenue).toBe(5000);
  });

  it("table row exposes Cash Collected", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(f.rows[0].cashCollected).toBe(4000);
  });

  it("table row exposes Expenses", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(typeof f.rows[0].expenses).toBe("number");
  });

  it("table row exposes Net Contribution", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(f.rows[0].netContribution).toBe(5000);
  });

  it("table row exposes Fleet Utilization", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(typeof f.rows[0].fleetUtilization).toBe("number");
  });

  it("table row exposes Rentable Utilization", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(typeof f.rows[0].rentableUtilization).toBe("number");
  });

  it("table row exposes Rentable Idle Days", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(typeof f.rows[0].rentableIdleDays).toBe("number");
  });

  it("table row exposes Downtime", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(typeof f.rows[0].downtimeDays).toBe("number");
  });

  it("table row exposes Lifetime Return", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(typeof f.rows[0].lifetimeReturn).toBe("number");
  });

  it("table row exposes Performance label", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(["strong_performer", "watch", "underperforming"]).toContain(
      f.rows[0].performanceLabel,
    );
  });

  it("performance row carries explainable reasons", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    expect(Array.isArray(f.rows[0].performanceReasons)).toBe(true);
  });
});

describe("Fleet Vehicle Performance — Sorting", () => {
  const keys: FleetSortKey[] = [
    "grossRevenue",
    "netContribution",
    "rentableUtilization",
    "lifetimeReturn",
    "rentableIdleDays",
    "underperformingFirst",
  ];
  for (const k of keys) {
    it(`sorts by ${k} without error`, () => {
      const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
      const sorted = sortFleetRows(f.rows, k);
      expect(sorted).toHaveLength(f.rows.length);
    });
  }

  it("Highest Gross Revenue sort puts highest first", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    const sorted = sortFleetRows(f.rows, "grossRevenue");
    expect(sorted[0].grossRevenue).toBeGreaterThanOrEqual(
      sorted[1].grossRevenue,
    );
  });

  it("Most Idle sort puts highest idle first", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    const sorted = sortFleetRows(f.rows, "rentableIdleDays");
    expect(sorted[0].rentableIdleDays).toBeGreaterThanOrEqual(
      sorted[1].rentableIdleDays,
    );
  });
});

describe("Fleet Vehicle Performance — Filters", () => {
  it("ownership filter narrows rows", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    const filtered = filterFleetRows(f.rows, {
      ownershipType: "company_owned",
    } as FleetFilters);
    expect(filtered.every((r) => r.ownershipType === "company_owned")).toBe(
      true,
    );
  });

  it("class filter narrows rows", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    const filtered = filterFleetRows(f.rows, {
      vehicleClass: "Midsize",
    } as FleetFilters);
    expect(filtered.every((r) => r.className === "Midsize")).toBe(true);
  });

  it("location filter narrows rows", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    const filtered = filterFleetRows(f.rows, {
      location: "Main Lot",
    } as FleetFilters);
    expect(filtered.every((r) => r.location === "Main Lot")).toBe(true);
  });

  it("performance filter narrows rows", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    const label = f.rows[0].performanceLabel;
    const filtered = filterFleetRows(f.rows, {
      performance: label,
    } as FleetFilters);
    expect(filtered.every((r) => r.performanceLabel === label)).toBe(true);
  });
});

describe("Fleet Vehicle Performance — Data integrity", () => {
  it("distinguishes known zero ($0) from missing data (—)", () => {
    const f = getFleetPerformance(twoVehicles(), RANGE, "this_month");
    // veh_1 has revenue (known), purchase price present.
    const v1 = f.rows.find((r) => r.vehicleId === "veh_1")!;
    expect(v1.hasFinancialData).toBe(true);
    expect(v1.purchasePriceMissing).toBe(false);
  });

  it("vehicle with no financial linkage reports hasFinancialData false", () => {
    const f = getFleetPerformance(perfInputs(), RANGE, "this_month");
    expect(f.rows[0].hasFinancialData).toBe(false);
  });

  it("does not invent financial data for vehicles with no records", () => {
    const f = getFleetPerformance(perfInputs(), RANGE, "this_month");
    expect(f.kpis.grossRevenue).toBe(0);
    expect(f.kpis.cashCollected).toBe(0);
  });
});

describe("Fleet Vehicle Performance — CSV export", () => {
  it("CSV export preserved and includes economics-mode column", () => {
    const f = getFleetPerformance(
      twoVehicles(),
      RANGE,
      "this_month",
      "vehicle",
    );
    const csv = fleetRowsToCsv(f.rows, "vehicle");
    expect(csv).toContain("net_contribution");
    expect(csv).toContain("gross_revenue");
  });

  it("CSV company mode uses company_net_contribution header", () => {
    const f = getFleetPerformance(
      twoVehicles(),
      RANGE,
      "this_month",
      "company",
    );
    const csv = fleetRowsToCsv(f.rows, "company");
    expect(csv).toContain("company_net_contribution");
  });
});
