// Connect Pro Fleet — Vehicle Performance prior-period comparison ranges.
//
// Resolves the equivalent PRIOR period for a given PerformanceRange, using the
// tenant/company timezone (the passed `now` Date). Pure functions, no React.
//
// Rules (per spec):
//   this_week       → immediately preceding equivalent week
//   this_month      → previous calendar month
//   last_month      → calendar month immediately before Last Month
//   last_30_days    → immediately preceding 30-day window
//   last_90_days    → immediately preceding 90-day window
//   last_12_months  → immediately preceding 12-month window
//   ytd             → equivalent elapsed period in the PRIOR calendar year
//   lifetime        → NO fabricated prior period (returns null)
//
// Each prior window has the SAME length as the current window so the comparison
// is apples-to-apples. We never compare Lifetime against an arbitrary slice.

import {
  startOfDay,
  endOfDay,
  DAY,
  type DateRange,
} from "./profitabilityHelpers";
import type { PerformanceRange } from "./vehiclePerformanceRanges";

/**
 * Resolve the prior comparison period for a range, or null when no valid
 * comparison exists (Lifetime). The prior window is the same length as the
 * current window and ends the day before the current window starts.
 */
export function resolvePriorPerformanceRange(
  range: PerformanceRange,
  now: Date = new Date(),
  lifetimeStart?: string,
): DateRange | null {
  switch (range) {
    case "this_week": {
      const day = (now.getDay() + 6) % 7; // Monday-start
      const curStart = startOfDay(new Date(now.getTime() - day * DAY));
      const lenDays = 7;
      const priorEnd = endOfDay(new Date(curStart.getTime() - DAY));
      const priorStart = startOfDay(
        new Date(priorEnd.getTime() - (lenDays - 1) * DAY),
      );
      return { start: priorStart, end: priorEnd };
    }
    case "this_month": {
      // Previous calendar month.
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    case "last_month": {
      // Calendar month immediately before Last Month (i.e. two months ago).
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - 1, 0);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    case "last_30_days": {
      // Current = [now-29 .. now]. Prior = [now-59 .. now-30].
      const priorEnd = endOfDay(new Date(now.getTime() - 30 * DAY));
      const priorStart = startOfDay(new Date(now.getTime() - 59 * DAY));
      return { start: priorStart, end: priorEnd };
    }
    case "last_90_days": {
      // Current = [now-89 .. now]. Prior = [now-179 .. now-90].
      const priorEnd = endOfDay(new Date(now.getTime() - 90 * DAY));
      const priorStart = startOfDay(new Date(now.getTime() - 179 * DAY));
      return { start: priorStart, end: priorEnd };
    }
    case "last_12_months": {
      // Current = [now-12mo .. now]. Prior = [now-24mo .. now-12mo-1d].
      const curStart = startOfDay(
        new Date(now.getFullYear(), now.getMonth() - 12, now.getDate()),
      );
      const priorEnd = endOfDay(new Date(curStart.getTime() - DAY));
      const priorStart = startOfDay(
        new Date(now.getFullYear(), now.getMonth() - 24, now.getDate()),
      );
      return { start: priorStart, end: priorEnd };
    }
    case "ytd": {
      // Current = [Jan 1 (this year) .. now]. Prior = [Jan 1 (last year) ..
      // same elapsed day last year]. Same number of elapsed calendar days.
      const curStart = startOfDay(new Date(now.getFullYear(), 0, 1));
      const elapsedDays = Math.floor(
        (startOfDay(now).getTime() - curStart.getTime()) / DAY,
      );
      const priorStart = startOfDay(new Date(now.getFullYear() - 1, 0, 1));
      const priorEnd = endOfDay(
        new Date(priorStart.getTime() + elapsedDays * DAY),
      );
      return { start: priorStart, end: priorEnd };
    }
    case "lifetime": {
      // Do NOT fabricate a prior period for Lifetime.
      void lifetimeStart;
      return null;
    }
  }
}
