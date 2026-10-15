// Connect Pro Fleet — Build #19 migration / historical financial selectors.
//
// Historical summaries are reporting-continuity records ONLY. They never
// create ledger/invoice/expense/bank transactions. These selectors expose
// historical totals, combined (historical + Fleet-native) lifetime totals,
// and a source-mode toggle (FLEET_ONLY / HISTORICAL_ONLY / COMBINED) so reports
// can show continuity without polluting current-period operational metrics.
//
// Fleet-native totals come from the existing profitability/financial
// selectors — these helpers only ADD the historical summary layer on top.

import type { HistoricalFinancialPeriod } from "./migrationTypes";
import type { FleetStore } from "./store";
import { isRevenueCharge } from "./profitabilityHelpers";
import { isDepositHeldEvent } from "./deposit";

export type ReportSourceMode = "fleet_only" | "historical_only" | "combined";

export interface HistoricalTotals {
  revenue: number;
  collections: number | null; // null = unknown
  expenses: number | null;
  net_profit: number | null;
  rental_count: number | null;
  vehicle_count: number | null;
  period_count: number;
}

/** Sum all historical periods (any granularity). Lifetime-opening periods
 *  are included; callers that want only monthly detail should filter first. */
export function getHistoricalTotals(
  periods: HistoricalFinancialPeriod[],
): HistoricalTotals {
  let revenue = 0;
  let collections: number | null = 0;
  let expenses: number | null = 0;
  let net_profit: number | null = 0;
  let rental_count: number | null = 0;
  let vehicle_count: number | null = 0;
  let anyCollections = false;
  let anyExpenses = false;
  let anyProfit = false;
  let anyRentals = false;
  let anyVehicles = false;
  for (const p of periods) {
    revenue += p.revenue;
    if (p.collections != null) {
      collections = (collections ?? 0) + p.collections;
      anyCollections = true;
    }
    if (p.expenses != null) {
      expenses = (expenses ?? 0) + p.expenses;
      anyExpenses = true;
    }
    if (p.net_profit != null) {
      net_profit = (net_profit ?? 0) + p.net_profit;
      anyProfit = true;
    }
    if (p.rental_count != null) {
      rental_count = (rental_count ?? 0) + p.rental_count;
      anyRentals = true;
    }
    if (p.vehicle_count != null) {
      vehicle_count = (vehicle_count ?? 0) + p.vehicle_count;
      anyVehicles = true;
    }
  }
  return {
    revenue,
    collections: anyCollections ? collections : null,
    expenses: anyExpenses ? expenses : null,
    net_profit: anyProfit ? net_profit : null,
    rental_count: anyRentals ? rental_count : null,
    vehicle_count: anyVehicles ? vehicle_count : null,
    period_count: periods.length,
  };
}

/** Fleet-native lifetime revenue from the ledger (recognized charges only,
 *  excluding held deposits, tax, and migration opening balances). */
export function getFleetNativeRevenue(store: FleetStore): number {
  return store.transactions
    .filter((t) => isRevenueCharge(t))
    .reduce((s, t) => s + t.amount, 0);
}

/** Fleet-native lifetime collections (actual payments, excluding held
 *  deposit collections and migration deposit entries). */
export function getFleetNativeCollections(store: FleetStore): number {
  return store.transactions
    .filter(
      (t) =>
        t.status === "posted" &&
        t.category === "payment" &&
        !isDepositHeldEvent(t) &&
        !(t.metadata?.migration === true),
    )
    .reduce((s, t) => s + t.amount, 0);
}

export interface CombinedLifetimeTotals {
  fleet_revenue: number;
  fleet_collections: number;
  historical_revenue: number;
  historical_collections: number | null;
  combined_revenue: number;
  combined_collections: number | null;
}

/** Combined lifetime revenue + collections (historical summary + Fleet-native).
 *  Source distinction is preserved — callers must label each component. */
export function getCombinedLifetimeTotals(
  store: FleetStore,
  periods: HistoricalFinancialPeriod[],
): CombinedLifetimeTotals {
  const fleetRevenue = getFleetNativeRevenue(store);
  const fleetCollections = getFleetNativeCollections(store);
  const hist = getHistoricalTotals(periods);
  return {
    fleet_revenue: fleetRevenue,
    fleet_collections: fleetCollections,
    historical_revenue: hist.revenue,
    historical_collections: hist.collections,
    combined_revenue: fleetRevenue + hist.revenue,
    combined_collections:
      hist.collections != null ? fleetCollections + hist.collections : null,
  };
}

/** Detect overlapping historical periods (same granularity, overlapping
 *  dates). Returns the pairs that overlap — used for validation warnings. */
export function findOverlappingPeriods(
  periods: HistoricalFinancialPeriod[],
): Array<{ a: HistoricalFinancialPeriod; b: HistoricalFinancialPeriod }> {
  const overlaps: Array<{
    a: HistoricalFinancialPeriod;
    b: HistoricalFinancialPeriod;
  }> = [];
  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      const a = periods[i];
      const b = periods[j];
      if (
        a.granularity === b.granularity &&
        a.period_start <= b.period_end &&
        a.period_end >= b.period_start
      ) {
        overlaps.push({ a, b });
      }
    }
  }
  return overlaps;
}

/** Monthly historical periods sorted chronologically (for trend charts). */
export function getMonthlyHistorical(
  periods: HistoricalFinancialPeriod[],
): HistoricalFinancialPeriod[] {
  return periods
    .filter((p) => p.granularity === "month")
    .sort((a, b) => (a.period_start < b.period_start ? -1 : 1));
}

/** The migration cutover date — the earliest `migration_cutover_at` across
 *  imported rentals, or null if none. Used for the "Go-Live" chart marker. */
export function getMigrationCutoverDate(store: FleetStore): string | null {
  const dates = store.rentals
    .filter((r) => r.imported_legacy_rental && r.migration_cutover_at)
    .map((r) => r.migration_cutover_at as string)
    .sort();
  return dates[0] ?? null;
}

// ---------------------------------------------------------------------------
// Build #19 cleanup: historical reporting integration
// ---------------------------------------------------------------------------

/** Monthly historical periods sorted chronologically (for trend charts). */
export { getMonthlyHistorical as getHistoricalMonthlyTrend };

/** Resolve totals for a given report source mode. FLEET_ONLY returns only
 *  Fleet-native totals; HISTORICAL_ONLY returns only the summary layer;
 *  COMBINED returns both with source distinction preserved. */
export function getReportSourceTotals(
  store: FleetStore,
  periods: HistoricalFinancialPeriod[],
  mode: ReportSourceMode,
): {
  fleet_revenue: number;
  fleet_collections: number;
  historical_revenue: number;
  historical_collections: number | null;
  combined_revenue: number;
  combined_collections: number | null;
} {
  if (mode === "historical_only") {
    const h = getHistoricalTotals(periods);
    return {
      fleet_revenue: 0,
      fleet_collections: 0,
      historical_revenue: h.revenue,
      historical_collections: h.collections,
      combined_revenue: h.revenue,
      combined_collections: h.collections,
    };
  }
  if (mode === "fleet_only") {
    return {
      fleet_revenue: getFleetNativeRevenue(store),
      fleet_collections: getFleetNativeCollections(store),
      historical_revenue: 0,
      historical_collections: 0,
      combined_revenue: getFleetNativeRevenue(store),
      combined_collections: getFleetNativeCollections(store),
    };
  }
  return getCombinedLifetimeTotals(store, periods);
}

/** Choose a non-overlapping set of historical periods for combination. When a
 *  lifetime_opening period coexists with monthly periods that cover the same
 *  span, the monthly periods are preferred (more granular) and the lifetime
 *  opening is excluded to prevent double-counting. */
export function getNonOverlappingHistoricalSet(
  periods: HistoricalFinancialPeriod[],
): HistoricalFinancialPeriod[] {
  const monthly = periods.filter((p) => p.granularity === "month");
  const lifetime = periods.filter((p) => p.granularity === "lifetime_opening");
  const others = periods.filter(
    (p) => p.granularity !== "month" && p.granularity !== "lifetime_opening",
  );
  // If monthly periods exist, exclude any lifetime opening that overlaps them.
  if (monthly.length > 0) {
    const minMonth = monthly.reduce(
      (min, p) => (p.period_start < min ? p.period_start : min),
      monthly[0].period_start,
    );
    const maxMonth = monthly.reduce(
      (max, p) => (p.period_end > max ? p.period_end : max),
      monthly[0].period_end,
    );
    const nonOverlappingLifetime = lifetime.filter(
      (l) => l.period_start > maxMonth || l.period_end < minMonth,
    );
    return [...monthly, ...others, ...nonOverlappingLifetime];
  }
  return [...others, ...lifetime];
}
