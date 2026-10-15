// Connect Pro Fleet — Vehicle Performance date ranges.
//
// Extends the profitability range presets with the owner-facing performance
// ranges: This Week, This Month, Last Month, YTD, Last 30 Days, Last 90 Days,
// Last 12 Months, Lifetime. All ranges are computed in the tenant/company
// timezone (the passed `now` Date). Pure functions, no React.

import {
  startOfDay,
  endOfDay,
  DAY,
  type DateRange,
} from "./profitabilityHelpers";

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
 *  earliest vehicle/transaction date for the tenant (used only for Lifetime). */
export function resolvePerformanceRange(
  range: PerformanceRange,
  now: Date = new Date(),
  lifetimeStart?: string,
): DateRange {
  const today = startOfDay(now);
  switch (range) {
    case "this_week": {
      const day = (now.getDay() + 6) % 7; // Monday-start
      return {
        start: startOfDay(new Date(now.getTime() - day * DAY)),
        end: endOfDay(now),
      };
    }
    case "this_month":
      return {
        start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: endOfDay(now),
      };
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    case "ytd":
      return {
        start: startOfDay(new Date(now.getFullYear(), 0, 1)),
        end: endOfDay(now),
      };
    case "last_30_days":
      return {
        start: startOfDay(new Date(now.getTime() - 29 * DAY)),
        end: endOfDay(now),
      };
    case "last_90_days":
      return {
        start: startOfDay(new Date(now.getTime() - 89 * DAY)),
        end: endOfDay(now),
      };
    case "last_12_months":
      return {
        start: startOfDay(
          new Date(now.getFullYear(), now.getMonth() - 12, now.getDate()),
        ),
        end: endOfDay(now),
      };
    case "lifetime": {
      if (lifetimeStart) {
        return {
          start: startOfDay(new Date(lifetimeStart + "T00:00:00")),
          end: endOfDay(now),
        };
      }
      // Fall back to 10 years back when no earliest date is known.
      return {
        start: startOfDay(new Date(now.getFullYear() - 10, 0, 1)),
        end: endOfDay(now),
      };
    }
  }
}
