// Connect Pro Fleet — Vehicle Performance comparison + shareable cards.
//
// Comparison: side-by-side metrics for 2-5 vehicles over the SAME selected
// date range, sortable by any metric. Lifetime Return is always labeled as a
// lifetime basis regardless of the selected comparison range.
//
// Share Card: generates a shareable vehicle-performance graphic using
// AUTHORITATIVE system data only. No free-text overrides of financial amounts.
// Private metrics (financing, lender, JV split, investor payout, customer data,
// payment records) are NEVER shareable. Connect Pro branding is shown by
// default and can only be removed when the tenant is entitled (plan-based).
//
// Pure functions, no React.

import type { VehiclePerformance } from "./vehiclePerformance";
import type { PerformanceRange } from "./vehiclePerformanceRanges";
import type { VehiclePerformanceInputs } from "./vehiclePerformance";
import type { DateRange } from "./profitabilityHelpers";
import { getVehiclePerformance } from "./vehiclePerformance";

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** Metrics available for side-by-side comparison. */
export type ComparisonMetric =
  | "grossRevenue"
  | "cashCollected"
  | "netContribution"
  | "fleetUtilization"
  | "rentableUtilization"
  | "rentableIdleDays"
  | "maintenanceCost"
  | "damageCost"
  | "downtimeDays"
  | "revenuePerRentedDay"
  | "netContributionPerCalendarDay"
  | "lifetimeReturn";

export const COMPARISON_METRIC_LABELS: Record<ComparisonMetric, string> = {
  grossRevenue: "Gross Revenue",
  cashCollected: "Cash Collected",
  netContribution: "Net Contribution",
  fleetUtilization: "Fleet Utilization",
  rentableUtilization: "Rentable Utilization",
  rentableIdleDays: "Rentable Idle Days",
  maintenanceCost: "Maintenance Cost",
  damageCost: "Damage Cost",
  downtimeDays: "Downtime",
  revenuePerRentedDay: "Revenue / Rented Day",
  netContributionPerCalendarDay: "Net / Calendar Day",
  lifetimeReturn: "Lifetime Return",
};

export interface ComparisonRow {
  vehicleId: string;
  vehicleLabel: string;
  plate: string;
  values: Record<ComparisonMetric, number>;
}

/** Build a comparison row from a VehiclePerformance result. */
export function comparisonRow(p: VehiclePerformance): ComparisonRow {
  return {
    vehicleId: p.vehicleId,
    vehicleLabel: p.vehicleLabel,
    plate: p.plate ?? "",
    values: {
      grossRevenue: p.grossRevenueGenerated,
      cashCollected: p.cashCollected,
      netContribution: p.netContribution,
      fleetUtilization: p.fleetUtilization,
      rentableUtilization: p.rentableUtilization,
      rentableIdleDays: p.time.rentableIdleDays,
      maintenanceCost: p.expenseBreakdown.maintenance,
      damageCost: p.damage.netCompanyImpact,
      downtimeDays: p.time.maintenanceDowntimeDays + p.time.damageDowntimeDays,
      revenuePerRentedDay: p.revenuePerRentedDay,
      netContributionPerCalendarDay: p.netContributionPerCalendarDay,
      lifetimeReturn: p.lifetimeReturn,
    },
  };
}

/**
 * Compare 2-5 vehicles. All vehicles MUST use the same selected date range —
 * the caller passes already-computed VehiclePerformance results (each derived
 * from the same range). Throws if fewer than 2 or more than 5 vehicles.
 *
 * Overload: passing a VehiclePerformanceInputs + DateRange computes the
 * performances internally (convenience for UI consumers).
 */
export function compareVehicles(
  vehicleIds: string[],
  performances: Map<string, VehiclePerformance>,
): ComparisonRow[];
export function compareVehicles(
  vehicleIds: string[],
  inputs: VehiclePerformanceInputs,
  range: DateRange,
): ComparisonRow[];
export function compareVehicles(
  vehicleIds: string[],
  performancesOrInputs:
    Map<string, VehiclePerformance> | VehiclePerformanceInputs,
  range?: DateRange,
): ComparisonRow[] {
  if (vehicleIds.length < 2 || vehicleIds.length > 5) {
    throw new Error("Compare Vehicles requires 2-5 vehicles.");
  }
  // Detect the inputs+range overload.
  const isInputs =
    performancesOrInputs instanceof Map === false && range != null;
  if (isInputs) {
    const inputs = performancesOrInputs as VehiclePerformanceInputs;
    const r = range as DateRange;
    return vehicleIds.map((id) =>
      comparisonRow(getVehiclePerformance(id, inputs, r)),
    );
  }
  const performances = performancesOrInputs as Map<string, VehiclePerformance>;
  return vehicleIds.map((id) => {
    const p = performances.get(id);
    if (!p) {
      throw new Error(`Missing performance for vehicle ${id}`);
    }
    return comparisonRow(p);
  });
}

/** Sort comparison rows by a metric, ascending or descending. */
export function sortComparison(
  rows: ComparisonRow[],
  metric: ComparisonMetric,
  dir: "asc" | "desc" = "desc",
): ComparisonRow[] {
  const sorted = [...rows].sort((a, b) => a.values[metric] - b.values[metric]);
  return dir === "desc" ? sorted.reverse() : sorted;
}

/** Assert that all compared rows share the same period (same range). */
export function assertConsistentPeriod(
  rows: ComparisonRow[],
  performances: Map<string, VehiclePerformance>,
): boolean {
  if (rows.length === 0) return true;
  const first = performances.get(rows[0].vehicleId);
  if (!first) return false;
  const period = `${first.periodStart}|${first.periodEnd}`;
  return rows.every((r) => {
    const p = performances.get(r.vehicleId);
    return p && `${p.periodStart}|${p.periodEnd}` === period;
  });
}

// ---------------------------------------------------------------------------
// Shareable Performance Card
// ---------------------------------------------------------------------------

/** Metrics that MAY appear on a share card. Private metrics are excluded. */
export const SHAREABLE_METRICS = [
  "grossRevenue",
  "cashCollected",
  "totalExpenses",
  "netContribution",
  "purchasePrice",
  "lifetimeReturn",
  "timeInFleet",
] as const;

export type ShareableMetric = (typeof SHAREABLE_METRICS)[number];

/** Human-readable labels for each shareable metric. */
export const SHARE_CARD_METRIC_LABELS: Record<ShareableMetric, string> = {
  grossRevenue: "Gross Revenue Generated",
  cashCollected: "Cash Collected",
  totalExpenses: "Total Expenses",
  netContribution: "Net Contribution",
  purchasePrice: "Purchase Price",
  lifetimeReturn: "Lifetime Return",
  timeInFleet: "Time in Fleet",
};

export interface ShareCardOptions {
  metrics: ShareableMetric[];
  /** Simplified gross-focused card (huge Gross Revenue hero). */
  grossFocused: boolean;
  useBusinessLogo: boolean;
  useBrandColors: boolean;
  showVehiclePhoto: boolean;
  /** Connect Pro branding shown by default. */
  showConnectProBranding: boolean;
  /** Entitlement: can the tenant remove Connect Pro branding? */
  canRemoveBranding: boolean;
}

export const DEFAULT_SHARE_CARD_OPTIONS: ShareCardOptions = {
  metrics: [
    "grossRevenue",
    "purchasePrice",
    "netContribution",
    "lifetimeReturn",
  ],
  grossFocused: false,
  useBusinessLogo: true,
  useBrandColors: true,
  showVehiclePhoto: false,
  showConnectProBranding: true,
  canRemoveBranding: false,
};

export interface ShareCard {
  vehicleLabel: string;
  plate: string;
  grossRevenue: number;
  cashCollected: number;
  totalExpenses: number;
  netContribution: number;
  purchasePrice: number;
  lifetimeReturn: number;
  timeInFleetDays: number;
  options: ShareCardOptions;
  /** The range used to compute the shared metrics. */
  range: PerformanceRange;
}

/** Is a given metric included in the share card? */
export function isMetricShared(
  options: ShareCardOptions,
  metric: ShareableMetric,
): boolean {
  return options.metrics.includes(metric);
}

/**
 * Build a shareable performance card from authoritative VehiclePerformance.
 * Values come directly from the performance object — NO free-text overrides.
 * If `canRemoveBranding` is false but the caller requested
 * `showConnectProBranding: false`, branding is forced back on (entitlement
 * guard).
 */
export function buildShareCard(
  p: VehiclePerformance,
  options: ShareCardOptions,
): ShareCard {
  const showBranding =
    options.showConnectProBranding || !options.canRemoveBranding;
  const enforced: ShareCardOptions = {
    ...options,
    showConnectProBranding: showBranding,
  };
  return {
    vehicleLabel: p.vehicleLabel,
    plate: p.plate ?? "",
    grossRevenue: p.grossRevenueGenerated,
    cashCollected: p.cashCollected,
    totalExpenses: p.totalExpenses,
    netContribution: p.netContribution,
    purchasePrice: p.purchasePrice,
    lifetimeReturn: p.lifetimeReturn,
    timeInFleetDays: p.timeInFleetDays,
    options: enforced,
    range: p.range,
  };
}

/**
 * Guard: ensure no private metric is ever shared. Returns the list of metrics
 * that would be exposed (filtered to SHAREABLE_METRICS only).
 */
export function filterShareableMetrics(requested: string[]): ShareableMetric[] {
  const allowed = new Set<string>(SHAREABLE_METRICS);
  return requested.filter((m) => allowed.has(m)) as ShareableMetric[];
}
