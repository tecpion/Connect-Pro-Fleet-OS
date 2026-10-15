// Connect Pro Fleet — Fleet-level Vehicle Performance selectors.
//
// Aggregates the EXISTING authoritative single-vehicle `getVehiclePerformance`
// selector across the whole fleet for a date range + economics mode. No
// duplicate financial formulas — pure composition. Gross Revenue is the hero.
//
// Economics modes:
//   vehicle  → the vehicle's own operating/cash-flow economics (before split)
//   company  → company-retained economics: for JV/investor vehicles, subtract
//              the investor payout (distribution) from net contribution.
//              Company-owned vehicles match vehicle economics.
//
// Insights are transparent (null when no qualifying data — never fabricated)
// and use existing performance assessment reasons, never an opaque score.

import { getVehiclePerformance } from "./vehiclePerformance";
import type { VehiclePerformanceInputs } from "./vehiclePerformance";
import type { DateRange } from "./profitabilityHelpers";
import type { PerformanceRange } from "./vehiclePerformanceRanges";
import type { PerformanceLabel } from "./vehiclePerformanceAssessment";
import type { VehicleOwnershipType } from "./ownershipTypes";

export type EconomicsMode = "vehicle" | "company";

export interface FleetKpis {
  grossRevenue: number;
  cashCollected: number;
  totalExpenses: number;
  netContribution: number;
  averageRentableUtilization: number;
  vehiclesNeedingReview: number;
  vehicleCount: number;
}

export interface FleetRow {
  vehicleId: string;
  vehicleLabel: string;
  plate: string;
  ownershipType: VehicleOwnershipType;
  className: string | null;
  location: string | null;
  status: string;
  grossRevenue: number;
  cashCollected: number;
  expenses: number;
  netContribution: number;
  fleetUtilization: number;
  rentableUtilization: number;
  rentableIdleDays: number;
  downtimeDays: number;
  maintenanceCost: number;
  damageCost: number;
  lifetimeReturn: number;
  performanceLabel: PerformanceLabel;
  performanceReasons: string[];
  /** True when the vehicle has at least one authoritative financial record in range. */
  hasFinancialData: boolean;
  /** True when purchase price is missing (drives "—" vs "$0" display). */
  purchasePriceMissing: boolean;
}

export interface FleetInsight {
  vehicleId: string;
  label: string;
  value: number;
  reason?: string;
}

export interface FleetInsights {
  topGrossing: FleetInsight | null;
  highestNetContribution: FleetInsight | null;
  highestUtilization: FleetInsight | null;
  mostIdle: FleetInsight | null;
  needsReview: FleetInsight | null;
}

export interface FleetPerformance {
  kpis: FleetKpis;
  rows: FleetRow[];
  insights: FleetInsights;
}

export type FleetSortKey =
  | "grossRevenue"
  | "cashCollected"
  | "netContribution"
  | "rentableUtilization"
  | "lifetimeReturn"
  | "maintenanceCost"
  | "rentableIdleDays"
  | "downtimeDays"
  | "underperformingFirst"
  | "name";

export const FLEET_SORT_LABELS: Record<FleetSortKey, string> = {
  grossRevenue: "Highest Gross Revenue",
  cashCollected: "Highest Cash Collected",
  netContribution: "Highest Net Contribution",
  rentableUtilization: "Highest Utilization",
  lifetimeReturn: "Highest Lifetime Return",
  maintenanceCost: "Lowest Maintenance",
  rentableIdleDays: "Most Idle Days",
  downtimeDays: "Most Downtime",
  underperformingFirst: "Underperforming First",
  name: "Vehicle Name",
};

const PERF_ORDER: Record<PerformanceLabel, number> = {
  underperforming: 0,
  watch: 1,
  strong_performer: 2,
};

export function getFleetPerformance(
  inputs: VehiclePerformanceInputs,
  range: DateRange,
  rangeKey: PerformanceRange,
  mode: EconomicsMode = "vehicle",
): FleetPerformance {
  const rows: FleetRow[] = [];

  for (const v of inputs.vehicles) {
    const perf = getVehiclePerformance(
      v.id,
      inputs,
      range,
      rangeKey,
      new Date(),
      undefined,
      true, // skip whatsChanged recursion for fleet aggregation
    );

    const cls = inputs.vehicleClasses.find((c) => c.id === v.vehicle_class_id);
    const ownership = (v.ownership_type ??
      "company_owned") as VehicleOwnershipType;

    // Company economics: subtract JV/investor payout (distribution) for investor vehicles.
    const vehicleNet = perf.netContribution;
    const companyNet =
      mode === "company" && ownership !== "company_owned"
        ? vehicleNet - (perf.investorPayout ?? 0)
        : vehicleNet;

    rows.push({
      vehicleId: v.id,
      vehicleLabel: perf.vehicleLabel,
      plate: perf.plate ?? "",
      ownershipType: ownership,
      className: cls?.name ?? null,
      location: v.location ?? null,
      status: v.status,
      grossRevenue: perf.grossRevenueGenerated,
      cashCollected: perf.cashCollected,
      expenses: perf.totalExpenses,
      netContribution: mode === "company" ? companyNet : vehicleNet,
      fleetUtilization: perf.fleetUtilization,
      rentableUtilization: perf.rentableUtilization,
      rentableIdleDays: perf.time.rentableIdleDays,
      downtimeDays:
        perf.time.maintenanceDowntimeDays + perf.time.damageDowntimeDays,
      maintenanceCost: perf.expenseBreakdown.maintenance,
      damageCost: perf.damage.netCompanyImpact,
      lifetimeReturn: perf.lifetimeReturn,
      performanceLabel: perf.performance.label,
      performanceReasons: perf.performance.reasons,
      hasFinancialData:
        perf.grossRevenueGenerated > 0 ||
        perf.cashCollected > 0 ||
        perf.totalExpenses > 0,
      purchasePriceMissing: perf.dataMissing.purchasePrice,
    });
  }

  const kpis: FleetKpis = {
    grossRevenue: rows.reduce((s, r) => s + r.grossRevenue, 0),
    cashCollected: rows.reduce((s, r) => s + r.cashCollected, 0),
    totalExpenses: rows.reduce((s, r) => s + r.expenses, 0),
    netContribution: rows.reduce((s, r) => s + r.netContribution, 0),
    averageRentableUtilization: rows.length
      ? rows.reduce((s, r) => s + r.rentableUtilization, 0) / rows.length
      : 0,
    vehiclesNeedingReview: rows.filter(
      (r) =>
        r.performanceLabel === "watch" ||
        r.performanceLabel === "underperforming",
    ).length,
    vehicleCount: rows.length,
  };

  const withData = rows.filter((r) => r.hasFinancialData);
  const pick = (
    list: FleetRow[],
    by: (r: FleetRow) => number,
  ): FleetInsight | null => {
    if (list.length === 0) return null;
    const best = list.reduce((a, b) => (by(b) > by(a) ? b : a));
    return {
      vehicleId: best.vehicleId,
      label: best.vehicleLabel,
      value: by(best),
    };
  };

  const needsReviewList = rows
    .filter(
      (r) =>
        r.performanceLabel === "watch" ||
        r.performanceLabel === "underperforming",
    )
    .sort(
      (a, b) => PERF_ORDER[a.performanceLabel] - PERF_ORDER[b.performanceLabel],
    );

  const insights: FleetInsights = {
    topGrossing: pick(withData, (r) => r.grossRevenue),
    highestNetContribution: pick(withData, (r) => r.netContribution),
    highestUtilization: pick(withData, (r) => r.rentableUtilization),
    mostIdle: pick(rows, (r) => r.rentableIdleDays),
    needsReview: needsReviewList[0]
      ? {
          vehicleId: needsReviewList[0].vehicleId,
          label: needsReviewList[0].vehicleLabel,
          value: 0,
          reason: needsReviewList[0].performanceReasons[0] ?? "Needs review",
        }
      : null,
  };

  return { kpis, rows, insights };
}

export interface FleetFilters {
  ownershipType?: VehicleOwnershipType | null;
  vehicleClass?: string | null;
  location?: string | null;
  performance?: PerformanceLabel | null;
  status?: string | null;
}

export function filterFleetRows(rows: FleetRow[], f: FleetFilters): FleetRow[] {
  return rows.filter((r) => {
    if (f.ownershipType && r.ownershipType !== f.ownershipType) return false;
    if (f.vehicleClass && r.className !== f.vehicleClass) return false;
    if (f.location && r.location !== f.location) return false;
    if (f.performance && r.performanceLabel !== f.performance) return false;
    if (f.status && r.status !== f.status) return false;
    return true;
  });
}

export function sortFleetRows(rows: FleetRow[], key: FleetSortKey): FleetRow[] {
  const copy = [...rows];
  switch (key) {
    case "grossRevenue":
      return copy.sort((a, b) => b.grossRevenue - a.grossRevenue);
    case "cashCollected":
      return copy.sort((a, b) => b.cashCollected - a.cashCollected);
    case "netContribution":
      return copy.sort((a, b) => b.netContribution - a.netContribution);
    case "rentableUtilization":
      return copy.sort((a, b) => b.rentableUtilization - a.rentableUtilization);
    case "lifetimeReturn":
      return copy.sort((a, b) => b.lifetimeReturn - a.lifetimeReturn);
    case "maintenanceCost":
      return copy.sort((a, b) => a.maintenanceCost - b.maintenanceCost);
    case "rentableIdleDays":
      return copy.sort((a, b) => b.rentableIdleDays - a.rentableIdleDays);
    case "downtimeDays":
      return copy.sort((a, b) => b.downtimeDays - a.downtimeDays);
    case "underperformingFirst":
      return copy.sort(
        (a, b) =>
          PERF_ORDER[a.performanceLabel] - PERF_ORDER[b.performanceLabel],
      );
    case "name":
      return copy.sort((a, b) => a.vehicleLabel.localeCompare(b.vehicleLabel));
  }
}

/** CSV export helper — builds rows aligned with the selected economics mode. */
export function fleetRowsToCsv(rows: FleetRow[], mode: EconomicsMode): string {
  const header = [
    "vehicle",
    "plate",
    "ownership",
    "class",
    "location",
    "gross_revenue",
    "cash_collected",
    "expenses",
    mode === "company" ? "company_net_contribution" : "net_contribution",
    "fleet_utilization_pct",
    "rentable_utilization_pct",
    "rentable_idle_days",
    "downtime_days",
    "maintenance",
    "lifetime_return_pct",
    "performance",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        esc(r.vehicleLabel),
        esc(r.plate),
        esc(r.ownershipType),
        esc(r.className ?? ""),
        esc(r.location ?? ""),
        r.grossRevenue,
        r.cashCollected,
        r.expenses,
        r.netContribution,
        r.fleetUtilization,
        r.rentableUtilization,
        r.rentableIdleDays,
        r.downtimeDays,
        r.maintenanceCost,
        r.lifetimeReturn,
        esc(r.performanceLabel),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function esc(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
