// Connect Pro Fleet — Vehicle Performance "What Changed" prior-period selector.
//
// Derives decision-relevant period-over-period change insights from EXISTING
// authoritative Vehicle Performance selectors (current period vs equivalent
// prior period). Never duplicates financial formulas — it recomputes both
// periods via getVehiclePerformance and diffs the results.
//
// Guardrails:
//   - Lifetime never fabricates a comparison (returns empty + a reason flag).
//   - Zero-denominator safety: never "Infinity%"; uses "from $0 to $X" wording.
//   - Materiality filters: ignores trivially tiny movements (no 0.2% noise).
//   - Direction is semantic, not numeric: revenue up = positive, maintenance up
//     = negative, idle days down = positive, etc.
//   - Returns a bounded set (max 6 items) of the most decision-relevant changes.
//   - Every finding carries structured metadata + a display string.
//
// Pure function, no React.

import type { DateRange } from "./profitabilityHelpers";
import { round2 } from "./profitabilityHelpers";
import type { PerformanceRange } from "./vehiclePerformanceRanges";
import {
  getVehiclePerformance,
  type VehiclePerformance,
  type VehiclePerformanceInputs,
} from "./vehiclePerformance";

export type ChangeDirection = "up" | "down" | "flat";

/** Semantic classification — an increase in maintenance is NOT "positive". */
export type ChangeSentiment = "positive" | "negative" | "neutral";

export interface WhatChangedItem {
  metric: string;
  current: number;
  prior: number;
  absoluteChange: number;
  /** Percentage change where valid; null when prior is zero (use absolute). */
  pctChange: number | null;
  direction: ChangeDirection;
  sentiment: ChangeSentiment;
  text: string;
}

export interface WhatsChangedResult {
  items: WhatChangedItem[];
  /** True when no comparison was possible (e.g. Lifetime, or no prior data). */
  unavailable: boolean;
  /** Human reason when unavailable. */
  reason: string | null;
}

/** Metric descriptor — how to read a value off a VehiclePerformance result and
 *  how to describe / classify changes to it. */
interface MetricSpec {
  key: string;
  label: string;
  unit: "money" | "percent" | "days";
  /** When true, an increase is a GOOD thing (revenue). False → increase is bad
   *  (maintenance, damage, idle days, downtime). */
  increaseIsGood: boolean;
}

const METRICS: MetricSpec[] = [
  {
    key: "grossRevenueGenerated",
    label: "Gross revenue",
    unit: "money",
    increaseIsGood: true,
  },
  {
    key: "cashCollected",
    label: "Cash collected",
    unit: "money",
    increaseIsGood: true,
  },
  {
    key: "totalExpenses",
    label: "Total expenses",
    unit: "money",
    increaseIsGood: false,
  },
  {
    key: "operatingContribution",
    label: "Operating contribution",
    unit: "money",
    increaseIsGood: true,
  },
  {
    key: "cashFlowContribution",
    label: "Cash-flow contribution",
    unit: "money",
    increaseIsGood: true,
  },
  {
    key: "rentableUtilization",
    label: "Rentable utilization",
    unit: "percent",
    increaseIsGood: true,
  },
  {
    key: "fleetUtilization",
    label: "Fleet utilization",
    unit: "percent",
    increaseIsGood: true,
  },
  {
    key: "rentableIdleDays",
    label: "Rentable idle days",
    unit: "days",
    increaseIsGood: false,
  },
  {
    key: "maintenanceDowntimeDays",
    label: "Maintenance downtime",
    unit: "days",
    increaseIsGood: false,
  },
  {
    key: "damageDowntimeDays",
    label: "Damage downtime",
    unit: "days",
    increaseIsGood: false,
  },
  {
    key: "revenuePerRentedDay",
    label: "Revenue per rented day",
    unit: "money",
    increaseIsGood: true,
  },
  {
    key: "netContributionPerCalendarDay",
    label: "Net contribution per calendar day",
    unit: "money",
    increaseIsGood: true,
  },
];

// Read a value off a performance object for a metric key.
function readValue(p: VehiclePerformance, key: string): number {
  if (key === "rentableIdleDays") return p.time.rentableIdleDays;
  if (key === "maintenanceDowntimeDays") return p.time.maintenanceDowntimeDays;
  if (key === "damageDowntimeDays") return p.time.damageDowntimeDays;
  return Number((p as unknown as Record<string, number>)[key] ?? 0);
}

// Materiality thresholds — tiny movements are filtered out so the section isn't
// noise. No hidden importance score; thresholds are transparent per unit.
function isMaterial(spec: MetricSpec, current: number, prior: number): boolean {
  const diff = Math.abs(current - prior);
  if (spec.unit === "money") return diff >= 5; // ignore <$5 movements
  if (spec.unit === "percent") return diff >= 2; // ignore <2pt movements
  return diff >= 1; // days: whole-day diffs can matter
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(n));
}

function fmtPct(n: number): string {
  return `${Math.round(Math.abs(n))}%`;
}

/** Determine direction + sentiment for a metric change. */
function classify(
  spec: MetricSpec,
  current: number,
  prior: number,
): { direction: ChangeDirection; sentiment: ChangeSentiment } {
  const diff = round2(current - prior);
  if (Math.abs(diff) < 0.01) {
    return { direction: "flat", sentiment: "neutral" };
  }
  const direction: ChangeDirection = diff > 0 ? "up" : "down";
  // Sentiment combines direction with whether an increase is good for this metric.
  if (spec.increaseIsGood) {
    return {
      direction,
      sentiment: direction === "up" ? "positive" : "negative",
    };
  }
  // For "bad" metrics (expenses, idle, downtime), an increase is negative.
  return {
    direction,
    sentiment: direction === "up" ? "negative" : "positive",
  };
}

/** Build the human display text for one change. Handles zero-denominator. */
function buildText(
  spec: MetricSpec,
  current: number,
  prior: number,
  direction: ChangeDirection,
  pct: number | null,
): string {
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  const unitLabel =
    spec.unit === "money"
      ? fmtMoney(current - prior)
      : spec.unit === "percent"
        ? `${Math.round(Math.abs(current - prior))}pt`
        : `${Math.abs(Math.round(current - prior))}d`;

  // Zero-denominator safety.
  if (pct == null) {
    if (current === 0 && prior === 0) {
      return `${spec.label} was $0 in both periods`;
    }
    // Prior was zero (or current zero) → avoid Infinity%.
    if (prior === 0) {
      return `${arrow} ${spec.label} increased from $0 to ${fmtMoney(current)}`;
    }
    return `${arrow} ${spec.label} decreased from ${fmtMoney(prior)} to $0`;
  }

  const pctLabel = fmtPct(pct);
  if (spec.unit === "percent") {
    return `${arrow} ${spec.label} ${current > prior ? "+" : "-"}${Math.round(Math.abs(current - prior))}pt (${pctLabel})`;
  }
  if (spec.unit === "days") {
    return `${arrow} ${spec.label} ${current > prior ? "+" : "-"}${Math.abs(Math.round(current - prior))}d (${pctLabel})`;
  }
  return `${arrow} ${spec.label} ${current > prior ? "+" : "-"}${unitLabel} (${pctLabel})`;
}

/** Priority rank so the most decision-relevant changes surface first. */
function rank(
  spec: MetricSpec,
  sentiment: ChangeSentiment,
  absPct: number,
): number {
  // Negative sentiment outranks neutral; bigger pct outranks smaller.
  const sentimentWeight = sentiment === "neutral" ? 0 : 1;
  const metricWeight =
    spec.key === "grossRevenueGenerated" || spec.key === "cashFlowContribution"
      ? 3
      : spec.key === "totalExpenses" || spec.key === "rentableIdleDays"
        ? 2
        : 1;
  return sentimentWeight * 1000 + metricWeight * 100 + Math.min(absPct, 99);
}

/**
 * Compute the "What Changed" insights for a vehicle across a current range and
 * its equivalent prior range. `priorRange` null → no comparison (Lifetime).
 */
export function computeWhatsChanged(
  vehicleId: string,
  inputs: VehiclePerformanceInputs,
  currentRange: DateRange,
  priorRange: DateRange | null,
  currentRangeKey: PerformanceRange = "lifetime",
  now: Date = new Date(),
  lifetimeStart?: string,
): WhatsChangedResult {
  if (!priorRange) {
    return {
      items: [],
      unavailable: true,
      reason: "No prior-period comparison for Lifetime.",
    };
  }

  const current = getVehiclePerformance(
    vehicleId,
    inputs,
    currentRange,
    currentRangeKey,
    now,
    lifetimeStart,
    // Skip whatsChanged recursion for the current period — we only need its
    // metric values, not its own prior comparison.
    true,
  );
  const prior = getVehiclePerformance(
    vehicleId,
    inputs,
    priorRange,
    currentRangeKey,
    now,
    lifetimeStart,
    // The prior period must NOT recompute its own whatsChanged (infinite loop).
    true,
  );

  // Incomplete-data guard: if the prior period has literally no activity at all
  // (no revenue, no expenses, no rentals, no downtime), treat as insufficient.
  const priorHasData =
    prior.grossRevenueGenerated > 0 ||
    prior.totalExpenses > 0 ||
    prior.time.rentedDays > 0 ||
    prior.time.maintenanceDowntimeDays > 0 ||
    prior.time.damageDowntimeDays > 0;
  if (!priorHasData && current.grossRevenueGenerated === 0) {
    return {
      items: [],
      unavailable: true,
      reason: "Not enough prior-period data yet.",
    };
  }

  const candidates: WhatChangedItem[] = [];
  for (const spec of METRICS) {
    const cur = round2(readValue(current, spec.key));
    const pri = round2(readValue(prior, spec.key));
    if (!isMaterial(spec, cur, pri)) continue;

    const pct = pri !== 0 ? round2(((cur - pri) / Math.abs(pri)) * 100) : null;
    const { direction, sentiment } = classify(spec, cur, pri);

    // Skip flat changes that are not material (already filtered above), but
    // also avoid surfacing "neutral" zero-movement items.
    if (direction === "flat" && sentiment === "neutral") continue;

    candidates.push({
      metric: spec.key,
      current: cur,
      prior: pri,
      absoluteChange: round2(cur - pri),
      pctChange: pct,
      direction,
      sentiment,
      text: buildText(spec, cur, pri, direction, pct),
    });
  }

  // De-duplicate by metric key (each metric appears once max).
  const seen = new Set<string>();
  const deduped = candidates.filter((c) => {
    if (seen.has(c.metric)) return false;
    seen.add(c.metric);
    return true;
  });

  // Rank and bound to the top 6 most decision-relevant changes.
  const ranked = deduped
    .sort(
      (a, b) =>
        rank(specFor(a.metric)!, a.sentiment, Math.abs(a.pctChange ?? 0)) -
        rank(specFor(b.metric)!, b.sentiment, Math.abs(b.pctChange ?? 0)),
    )
    .reverse()
    .slice(0, 6);

  return {
    items: ranked,
    unavailable: false,
    reason: null,
  };
}

function specFor(key: string): MetricSpec | undefined {
  return METRICS.find((m) => m.key === key);
}
