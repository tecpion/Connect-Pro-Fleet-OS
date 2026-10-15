// Connect Pro Fleet — Incidents & Violations workspace analytics selectors.
//
// Pure functions over the existing Incident[] (incidentsStore) and Violation[]
// (rich violation store) for the combined workspace: monthly/yearly counts,
// trend datasets, type breakdowns, top-vehicle frequency, fine/billed
// financials, and prior-period comparison indicators.
//
// DOMAIN SAFETY: these selectors only READ existing records. They never mutate
// the Incident or Violation models, never create a second financial ledger,
// and never invent amounts. Fine amount = Violation.total_amount (authoritative).
// Amount billed to renters = sum of Violation.renter_billed_amount (simple
// incidents-store violations) OR derived from customer_charge_status for the
// rich store. Both are kept distinct from "amount paid".
//
// Tenant timezone: date bucketing uses the passed `now`/reference clock and
// calendar-month boundaries. Callers pass a tenant-local Date so business
// dates are respected (not browser-local/UTC silently).

import type { Incident } from "./incidents";
import type { Violation } from "./violationTypes";
import { VIOLATION_OPEN_STATUSES } from "./violationTypes";

const DAY = 86_400_000;

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : t;
}

/** Start of the calendar month containing `d` (tenant-local). */
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
/** Start of the calendar year containing `d`. */
export function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}
/** End of the calendar month containing `d` (exclusive: first of next month). */
export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export type AnalyticsRange =
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "last_12_months"
  | "custom";

export interface DateWindow {
  start: Date;
  end: Date; // exclusive
  label: string;
}

/** Resolve an analytics range to a concrete [start, end) window in tenant time. */
export function resolveAnalyticsRange(
  range: AnalyticsRange,
  now: Date,
  custom?: { start: string; end: string },
): DateWindow {
  switch (range) {
    case "this_month": {
      const s = startOfMonth(now);
      return { start: s, end: endOfMonth(now), label: "This Month" };
    }
    case "last_month": {
      const s = startOfMonth(
        new Date(now.getFullYear(), now.getMonth() - 1, 1),
      );
      return { start: s, end: startOfMonth(now), label: "Last Month" };
    }
    case "this_year": {
      const s = startOfYear(now);
      return {
        start: s,
        end: new Date(now.getFullYear() + 1, 0, 1),
        label: "This Year",
      };
    }
    case "last_year": {
      const s = new Date(now.getFullYear() - 1, 0, 1);
      return {
        start: s,
        end: startOfYear(now),
        label: String(now.getFullYear() - 1),
      };
    }
    case "last_12_months": {
      // Trailing 12-month window ending at the current moment (tenant-local).
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const start = new Date(
        end.getFullYear() - 1,
        end.getMonth(),
        end.getDate(),
      );
      return { start, end, label: "Last 12 Months" };
    }
    case "custom": {
      const s = custom
        ? new Date(custom.start + "T00:00:00")
        : startOfMonth(now);
      const e = custom ? new Date(custom.end + "T23:59:59") : endOfMonth(now);
      return {
        start: isNaN(s.getTime()) ? startOfMonth(now) : s,
        end: isNaN(e.getTime()) ? endOfMonth(now) : new Date(e.getTime() + DAY),
        label: "Custom",
      };
    }
  }
}

/** Prior comparison window for a range (for trend indicators). Returns null
 *  when no reliable prior period exists (e.g. custom with no clear prior). */
export function priorWindow(
  range: AnalyticsRange,
  now: Date,
  custom?: { start: string; end: string },
): DateWindow | null {
  switch (range) {
    case "this_month": {
      const cur = resolveAnalyticsRange("this_month", now);
      const span = cur.end.getTime() - cur.start.getTime();
      return {
        start: new Date(cur.start.getTime() - span),
        end: cur.start,
        label: "vs last month",
      };
    }
    case "last_month": {
      const cur = resolveAnalyticsRange("last_month", now);
      const span = cur.end.getTime() - cur.start.getTime();
      return {
        start: new Date(cur.start.getTime() - span),
        end: cur.start,
        label: "vs prior month",
      };
    }
    case "this_year": {
      const cur = resolveAnalyticsRange("this_year", now);
      const span = cur.end.getTime() - cur.start.getTime();
      return {
        start: new Date(cur.start.getTime() - span),
        end: cur.start,
        label: "vs last year",
      };
    }
    case "last_year": {
      const cur = resolveAnalyticsRange("last_year", now);
      const span = cur.end.getTime() - cur.start.getTime();
      return {
        start: new Date(cur.start.getTime() - span),
        end: cur.start,
        label: "vs prior year",
      };
    }
    case "last_12_months": {
      const cur = resolveAnalyticsRange("last_12_months", now);
      const span = cur.end.getTime() - cur.start.getTime();
      return {
        start: new Date(cur.start.getTime() - span),
        end: cur.start,
        label: "vs previous 12 months",
      };
    }
    case "custom":
      return null;
  }
}

function inWindow(iso: string, w: DateWindow): boolean {
  const t = parseMs(iso);
  if (t == null) return false;
  return t >= w.start.getTime() && t < w.end.getTime();
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

export function incidentsInWindow(
  incidents: Incident[],
  w: DateWindow,
): Incident[] {
  return incidents.filter((i) => inWindow(i.occurred_at, w));
}
export function violationsInWindow(
  violations: Violation[],
  w: DateWindow,
): Violation[] {
  return violations.filter((v) => inWindow(v.occurred_at, w));
}

export interface WorkspaceSummary {
  incidentsThisPeriod: number;
  violationsThisPeriod: number;
  incidentsThisYear: number;
  violationsThisYear: number;
  totalFinesThisPeriod: number;
  amountBilledToRenters: number;
  incidentsPrior: number | null;
  violationsPrior: number | null;
  priorLabel: string | null;
}

export function workspaceSummary(
  incidents: Incident[],
  violations: Violation[],
  range: AnalyticsRange,
  now: Date,
  custom?: { start: string; end: string },
): WorkspaceSummary {
  const w = resolveAnalyticsRange(range, now, custom);
  const yearWindow: DateWindow = {
    start: startOfYear(now),
    end: new Date(now.getFullYear() + 1, 0, 1),
    label: "This Year",
  };
  const incPeriod = incidentsInWindow(incidents, w);
  const vioPeriod = violationsInWindow(violations, w);

  const totalFines = vioPeriod.reduce((s, v) => s + v.total_amount, 0);
  // Amount billed to renters: rich store uses customer_charge_status === charged
  // (the authoritative ledger charge). Simple incidents-store violations are not
  // surfaced here (per product decision: rich store is authoritative source).
  const billed = vioPeriod
    .filter((v) => v.customer_charge_status === "charged")
    .reduce((s, v) => s + v.total_amount, 0);

  const prior = priorWindow(range, now, custom);
  const incPrior = prior ? incidentsInWindow(incidents, prior).length : null;
  const vioPrior = prior ? violationsInWindow(violations, prior).length : null;

  return {
    incidentsThisPeriod: incPeriod.length,
    violationsThisPeriod: vioPeriod.length,
    incidentsThisYear: incidentsInWindow(incidents, yearWindow).length,
    violationsThisYear: violationsInWindow(violations, yearWindow).length,
    totalFinesThisPeriod: totalFines,
    amountBilledToRenters: billed,
    incidentsPrior: incPrior,
    violationsPrior: vioPrior,
    priorLabel: prior?.label ?? null,
  };
}

// ---------------------------------------------------------------------------
// Trend chart dataset (monthly or yearly)
// ---------------------------------------------------------------------------

export type TrendGranularity = "monthly" | "yearly";

export interface TrendPoint {
  label: string;
  incidents: number;
  violations: number;
}

/** Build a trend dataset ending at `now`. Monthly = last `months` months;
 *  yearly = last `years` years (including current). Only buckets with
 *  authoritative data are included — empty trailing buckets are dropped. */
export function buildTrend(
  incidents: Incident[],
  violations: Violation[],
  granularity: TrendGranularity,
  now: Date,
  months = 12,
  years = 3,
): TrendPoint[] {
  if (granularity === "monthly") {
    const pts: TrendPoint[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const w: DateWindow = { start: s, end: e, label: "" };
      const inc = incidentsInWindow(incidents, w).length;
      const vio = violationsInWindow(violations, w).length;
      pts.push({
        label: s.toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
        incidents: inc,
        violations: vio,
      });
    }
    // Drop trailing empty buckets (no data in the most recent months).
    while (pts.length > 1) {
      const last = pts[pts.length - 1];
      if (last.incidents === 0 && last.violations === 0) pts.pop();
      else break;
    }
    return pts;
  }
  // yearly
  const pts: TrendPoint[] = [];
  for (let i = years - 1; i >= 0; i--) {
    const y = now.getFullYear() - i;
    const w: DateWindow = {
      start: new Date(y, 0, 1),
      end: new Date(y + 1, 0, 1),
      label: "",
    };
    pts.push({
      label: String(y),
      incidents: incidentsInWindow(incidents, w).length,
      violations: violationsInWindow(violations, w).length,
    });
  }
  while (pts.length > 1) {
    const last = pts[pts.length - 1];
    if (last.incidents === 0 && last.violations === 0) pts.pop();
    else break;
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Type breakdowns
// ---------------------------------------------------------------------------

export interface TypeCount {
  type: string;
  count: number;
}

export function incidentTypeBreakdown(
  incidents: Incident[],
  w: DateWindow,
): TypeCount[] {
  const map: Record<string, number> = {};
  for (const i of incidentsInWindow(incidents, w)) {
    map[i.incident_type] = (map[i.incident_type] ?? 0) + 1;
  }
  return Object.entries(map)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

export function violationTypeBreakdown(
  violations: Violation[],
  w: DateWindow,
): TypeCount[] {
  const map: Record<string, number> = {};
  for (const v of violationsInWindow(violations, w)) {
    map[v.violation_type] = (map[v.violation_type] ?? 0) + 1;
  }
  return Object.entries(map)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Top vehicle frequency (raw count only — never a risk score)
// ---------------------------------------------------------------------------

export interface VehicleFrequency {
  vehicleId: string;
  incidents: number;
  violations: number;
  total: number;
}

export function topVehiclesByFrequency(
  incidents: Incident[],
  violations: Violation[],
  w: DateWindow,
  limit = 5,
): VehicleFrequency[] {
  const map: Record<string, VehicleFrequency> = {};
  const ensure = (id: string) =>
    (map[id] ??= { vehicleId: id, incidents: 0, violations: 0, total: 0 });
  for (const i of incidentsInWindow(incidents, w)) {
    const e = ensure(i.vehicle_id);
    e.incidents++;
    e.total++;
  }
  for (const v of violationsInWindow(violations, w)) {
    const e = ensure(v.vehicle_id);
    e.violations++;
    e.total++;
  }
  return Object.values(map)
    .sort((a, b) => b.total - a.total || b.violations - a.violations)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Comparison indicator (prior period)
// ---------------------------------------------------------------------------

export interface ComparisonIndicator {
  current: number;
  prior: number | null;
  pctChange: number | null; // null when prior is 0/missing
  direction: "up" | "down" | "flat" | "unknown";
  label: string;
}

export function comparisonIndicator(
  current: number,
  prior: number | null,
  label: string,
): ComparisonIndicator {
  if (prior == null) {
    return { current, prior, pctChange: null, direction: "unknown", label };
  }
  if (prior === 0) {
    return {
      current,
      prior,
      pctChange: null,
      direction: current > 0 ? "up" : "flat",
      label,
    };
  }
  const pct = ((current - prior) / prior) * 100;
  return {
    current,
    prior,
    pctChange: pct,
    direction: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat",
    label,
  };
}

// ---------------------------------------------------------------------------
// Monthly / yearly report summary (CSV source)
// ---------------------------------------------------------------------------

export interface PeriodReport {
  window: DateWindow;
  totalIncidents: number;
  totalViolations: number;
  totalFines: number;
  amountBilled: number;
  disputedAmount: number;
  incidentTypes: TypeCount[];
  violationTypes: TypeCount[];
  topVehicles: VehicleFrequency[];
}

export function periodReport(
  incidents: Incident[],
  violations: Violation[],
  range: AnalyticsRange,
  now: Date,
  custom?: { start: string; end: string },
): PeriodReport {
  const w = resolveAnalyticsRange(range, now, custom);
  const vioPeriod = violationsInWindow(violations, w);
  const disputedAmount = vioPeriod
    .filter((v) => v.dispute_status !== "not_disputed")
    .reduce((s, v) => s + v.total_amount, 0);
  return {
    window: w,
    totalIncidents: incidentsInWindow(incidents, w).length,
    totalViolations: vioPeriod.length,
    totalFines: vioPeriod.reduce((s, v) => s + v.total_amount, 0),
    amountBilled: vioPeriod
      .filter((v) => v.customer_charge_status === "charged")
      .reduce((s, v) => s + v.total_amount, 0),
    disputedAmount,
    incidentTypes: incidentTypeBreakdown(incidents, w),
    violationTypes: violationTypeBreakdown(violations, w),
    topVehicles: topVehiclesByFrequency(incidents, violations, w, 5),
  };
}

// Re-export open-status check for convenience in the workspace.
export { VIOLATION_OPEN_STATUSES };
