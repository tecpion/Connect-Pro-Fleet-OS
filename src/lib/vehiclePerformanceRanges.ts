// Connect Pro Fleet — Vehicle Performance date ranges.
//
// Extends the profitability range presets with the owner-facing performance
// ranges: This Week, This Month, Last Month, YTD, Last 30 Days, Last 90 Days,
// Last 12 Months, Lifetime. All ranges are computed in the organization's
// configured timezone (`tz`, resolved through `getOrgTimezone` → UTC safe
// default). Pure functions, no React.

import {
  startOfDay,
  endOfDay,
  DAY,
  type DateRange,
} from "./profitabilityHelpers";
import {
  startOfMonthInTz,
  endOfMonthInTz,
  startOfYearInTz,
  endOfDayInTz,
  zonedDateTimeParts,
  getOrgTimezone,
} from "./timezone";

export type PerformanceRange =
  | "this_week"
  | "this_month"
  | "last_month"
  | "ytd"
  | "last_30_days"
  | "last_90_days"
  | "last_12_months"
  | "lifetime";

export const PERFORMANCE_RANGE_LABELS: Record<PerformanceRange, string> = {
  this_week: "This Week",
  this_month: "This Month",
  last_month: "Last Month",
  ytd: "YTD",
  last_30_days: "Last 30 Days",
  last_90_days: "Last 90 Days",
  last_12_months: "Last 12 Months",
  lifetime: "Lifetime",
};

/** Resolve a performance date range from a preset. `lifetimeStart` is the
 *  earliest vehicle/transaction date for the tenant (used only for Lifetime).
 *  `tz` is the org timezone; day/month/year boundaries are org-local. */
export function resolvePerformanceRange(
  range: PerformanceRange,
  now: Date = new Date(),
  lifetimeStart?: string,
  tz?: string,
): DateRange {
  const z = getOrgTimezone(tz);
  switch (range) {
    case "this_week": {
      const p = zonedDateTimeParts(now, z);
      const day = (p.day + 6) % 7; // Monday-start (calendar date)
      return {
        start: startOfDay(new Date(now.getTime() - day * DAY), z),
        end: endOfDay(now, z),
      };
    }
    case "this_month":
      return {
        start: startOfMonthInTz(now, z),
        end: endOfDay(now, z),
      };
    case "last_month": {
      const curMonthStart = startOfMonthInTz(now, z);
      const start = startOfMonthInTz(
        new Date(curMonthStart.getTime() - DAY),
        z,
      );
      // Inclusive end-of-month (23:59:59.999 of the last day), preserving the
      // frozen V1 convention where the range end stays within the prior month.
      return { start, end: new Date(endOfMonthInTz(start, z).getTime() - 1) };
    }
    case "ytd":
      return {
        start: startOfYearInTz(now, z),
        end: endOfDay(now, z),
      };
    case "last_30_days":
      return {
        start: startOfDay(new Date(now.getTime() - 29 * DAY), z),
        end: endOfDay(now, z),
      };
    case "last_90_days":
      return {
        start: startOfDay(new Date(now.getTime() - 89 * DAY), z),
        end: endOfDay(now, z),
      };
    case "last_12_months": {
      // Rolling 12-month window ending today (inclusive), matching the frozen
      // V1 convention: start-of-day ~365 days back through end-of-day today.
      // Span is TZ-independent, so this stays 365/366 under any process TZ.
      return {
        start: startOfDay(new Date(now.getTime() - 365 * DAY), z),
        end: endOfDay(now, z),
      };
    }
    case "lifetime": {
      if (lifetimeStart) {
        return {
          start: startOfDay(new Date(lifetimeStart + "T12:00:00Z"), z),
          end: endOfDay(now, z),
        };
      }
      // Fall back to 10 years back when no earliest date is known.
      return {
        start: startOfYearInTz(
          new Date(Date.UTC(zonedDateTimeParts(now, z).year - 10, 6, 1)),
          z,
        ),
        end: endOfDay(now, z),
      };
    }
  }
}
