// Vehicle Performance — Assessment labels, comparison, share cards.
import { describe, it, expect } from "vitest";
import {
  getVehiclePerformance,
  type VehiclePerformanceInputs,
} from "@/lib/vehiclePerformance";
import { resolvePerformanceRange } from "@/lib/vehiclePerformanceRanges";
import {
  compareVehicles,
  sortComparison,
  buildShareCard,
  isMetricShared,
  SHAREABLE_METRICS,
  DEFAULT_SHARE_CARD_OPTIONS,
  type ShareCardOptions,
} from "@/lib/vehiclePerformanceComparison";
import {
  assessPerformance,
  maintenancePctOfRevenue,
} from "@/lib/vehiclePerformanceAssessment";
import { DEFAULT_PERFORMANCE_THRESHOLDS } from "@/lib/vehiclePerformanceSettings";
import { txn, vehicle, rental, inputs } from "./profitabilityFixtures";

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

describe("VP — Performance labels", () => {
  it("strong performer label", () => {
    const a = assessPerformance(
      10000,
      5000,
      80,
      10,
      3,
      "paid_off",
      DEFAULT_PERFORMANCE_THRESHOLDS,
    );
    expect(a.label).toBe("strong_performer");
    expect(a.reasons.length).toBeGreaterThan(0);
  });

  it("underperforming label for negative net contribution", () => {
    const a = assessPerformance(
      1000,
      -500,
      20,
      40,
      25,
      "financed",
      DEFAULT_PERFORMANCE_THRESHOLDS,
    );
    expect(a.label).toBe("underperforming");
  });

  it("watch label for elevated idle + low utilization", () => {
    const a = assessPerformance(
      5000,
      1000,
      40,
      30,
      15,
      "paid_off",
      DEFAULT_PERFORMANCE_THRESHOLDS,
    );
    expect(a.label).toBe("watch");
  });

  it("performance reasons are explainable", () => {
    const a = assessPerformance(
      10000,
      5000,
      80,
      10,
      3,
      "paid_off",
      DEFAULT_PERFORMANCE_THRESHOLDS,
    );
    expect(a.reasons.every((r) => r.length > 0)).toBe(true);
  });

  it("custom thresholds change label", () => {
    const strict = {
      ...DEFAULT_PERFORMANCE_THRESHOLDS,
      strongMinUtilization: 95,
    };
    const a = assessPerformance(10000, 5000, 80, 10, 3, "paid_off", strict);
    expect(a.label).not.toBe("strong_performer");
  });

  it("What's Helping populated", () => {
    const a = assessPerformance(
      10000,
      5000,
      80,
      10,
      3,
      "paid_off",
      DEFAULT_PERFORMANCE_THRESHOLDS,
    );
    expect(a.whatsHelping.length).toBeGreaterThan(0);
  });

  it("What's Hurting populated for weak vehicle", () => {
    const a = assessPerformance(
      1000,
      -500,
      20,
      40,
      25,
      "financed",
      DEFAULT_PERFORMANCE_THRESHOLDS,
    );
    expect(a.whatsHurting.length).toBeGreaterThan(0);
  });

  it("maintenancePctOfRevenue helper", () => {
    expect(maintenancePctOfRevenue(500, 2000)).toBe(25);
    expect(maintenancePctOfRevenue(500, 0)).toBe(0);
  });
});

describe("VP — Comparison", () => {
  const baseInp = perfInputs({
    vehicles: [
      vehicle({ id: "veh_1", purchase_price: 5000 }),
      vehicle({ id: "veh_2", purchase_price: 8000 }),
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
        amount: 6000,
        effective_date: "2026-08-15",
      }),
      txn({
        id: "t2",
        rental_id: "rnt_2",
        transaction_type: "rental_charge",
        amount: 3000,
        effective_date: "2026-08-15",
      }),
    ],
  });

  it("compares 2 vehicles", () => {
    const perfMap = new Map([
      ["veh_1", getVehiclePerformance("veh_1", baseInp, RANGE)],
      ["veh_2", getVehiclePerformance("veh_2", baseInp, RANGE)],
    ]);
    const rows = compareVehicles(["veh_1", "veh_2"], perfMap);
    expect(rows).toHaveLength(2);
  });

  it("compares 5 vehicles", () => {
    const inp = perfInputs({
      vehicles: [1, 2, 3, 4, 5].map((n) =>
        vehicle({ id: `veh_${n}`, purchase_price: 5000 }),
      ),
      rentals: [1, 2, 3, 4, 5].map((n) =>
        rental({ id: `rnt_${n}`, vehicle_id: `veh_${n}` }),
      ),
      transactions: [1, 2, 3, 4, 5].map((n) =>
        txn({
          id: `t${n}`,
          rental_id: `rnt_${n}`,
          transaction_type: "rental_charge",
          amount: 1000 * n,
          effective_date: "2026-08-15",
        }),
      ),
    });
    const perfMap = new Map(
      [1, 2, 3, 4, 5].map(
        (n) =>
          [`veh_${n}`, getVehiclePerformance(`veh_${n}`, inp, RANGE)] as const,
      ),
    );
    const rows = compareVehicles(
      ["veh_1", "veh_2", "veh_3", "veh_4", "veh_5"],
      perfMap,
    );
    expect(rows).toHaveLength(5);
  });

  it("rejects < 2 vehicles", () => {
    const perfMap = new Map([
      ["veh_1", getVehiclePerformance("veh_1", baseInp, RANGE)],
    ]);
    expect(() => compareVehicles(["veh_1"], perfMap)).toThrow();
  });

  it("sorts by selected metric", () => {
    const perfMap = new Map([
      ["veh_1", getVehiclePerformance("veh_1", baseInp, RANGE)],
      ["veh_2", getVehiclePerformance("veh_2", baseInp, RANGE)],
    ]);
    const rows = compareVehicles(["veh_1", "veh_2"], perfMap);
    const sorted = sortComparison(rows, "grossRevenue", "desc");
    expect(sorted[0].values.grossRevenue).toBeGreaterThanOrEqual(
      sorted[1].values.grossRevenue,
    );
  });
});

describe("VP — Share card", () => {
  const basePerf = () => {
    const inp = perfInputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 31420,
          effective_date: "2026-08-15",
        }),
      ],
      vehicles: [vehicle({ purchase_price: 5200 })],
    });
    return getVehiclePerformance("veh_1", inp, RANGE);
  };

  it("share card gross metric", () => {
    const card = buildShareCard(basePerf(), {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      metrics: ["grossRevenue"],
    });
    expect(card.grossRevenue).toBe(31420);
  });

  it("share card purchase price", () => {
    const card = buildShareCard(basePerf(), {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      metrics: ["purchasePrice"],
    });
    expect(card.purchasePrice).toBe(5200);
  });

  it("share card metric toggles", () => {
    const opts: ShareCardOptions = {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      metrics: ["grossRevenue", "netContribution"],
    };
    const card = buildShareCard(basePerf(), opts);
    expect(isMetricShared(card.options, "grossRevenue")).toBe(true);
    expect(isMetricShared(card.options, "netContribution")).toBe(true);
    expect(isMetricShared(card.options, "cashCollected")).toBe(false);
  });

  it("hidden private metrics — financing never shareable", () => {
    expect(SHAREABLE_METRICS).not.toContain("financing" as never);
    expect(SHAREABLE_METRICS).not.toContain("investorPayout" as never);
    expect(SHAREABLE_METRICS).not.toContain("lender" as never);
  });

  it("connect pro branding default shown", () => {
    const card = buildShareCard(basePerf(), DEFAULT_SHARE_CARD_OPTIONS);
    expect(card.options.showConnectProBranding).toBe(true);
  });

  it("entitlement-based branding removal", () => {
    const opts: ShareCardOptions = {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      canRemoveBranding: true,
      showConnectProBranding: false,
    };
    const card = buildShareCard(basePerf(), opts);
    expect(card.options.showConnectProBranding).toBe(false);
  });

  it("branding removal blocked without entitlement", () => {
    const opts: ShareCardOptions = {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      canRemoveBranding: false,
      showConnectProBranding: false,
    };
    const card = buildShareCard(basePerf(), opts);
    expect(card.options.showConnectProBranding).toBe(true);
  });

  it("share card authoritative data only (no overrides)", () => {
    const p = basePerf();
    const card = buildShareCard(p, DEFAULT_SHARE_CARD_OPTIONS);
    expect(card.grossRevenue).toBe(p.grossRevenueGenerated);
    expect(card.netContribution).toBe(p.netContribution);
    expect(card.purchasePrice).toBe(p.purchasePrice);
  });
});

describe("VP — Permissions & tenant scoping", () => {
  it("permission gating is selector-driven (values present when data exists)", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 1000,
            effective_date: "2026-08-15",
          }),
        ],
      }),
      RANGE,
    );
    expect(p.grossRevenueGenerated).toBe(1000);
  });
});
