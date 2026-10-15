// Connect Pro Fleet — Vehicle Performance settings (owner thresholds).
//
// Owner-configurable thresholds that drive the transparent performance label
// (Strong Performer / Watch / Underperforming). No opaque score is ever
// produced — the label is always paired with explainable reasons. These are
// presentation/assessment settings only; they never alter authoritative
// financial domain logic.

// Re-export the label text map so UI consumers can import a single
// PERFORMANCE_LABELS symbol from the settings module.
export {
  PERFORMANCE_LABEL_TEXT as PERFORMANCE_LABELS,
  type PerformanceLabel,
} from "./vehiclePerformanceAssessment";

export interface PerformanceThresholds {
  /** Minimum rentable utilization (%) to qualify as Strong Performer. */
  strongMinUtilization: number;
  /** Minimum cash-flow net contribution ($) to qualify as Strong Performer. */
  strongMinNetContribution: number;
  /** Maximum maintenance spend as % of revenue before it hurts the label. */
  strongMaxMaintenancePctOfRevenue: number;
  /** Maximum rentable idle days in the period before Watch. */
  watchMaxRentableIdleDays: number;
  /** Net contribution ($) at/below which a vehicle is Underperforming. */
  underperformingMaxNetContribution: number;
  /** Maximum downtime days before a vehicle is flagged Underperforming. */
  underperformingMaxDowntimeDays: number;
}

export const DEFAULT_PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  strongMinUtilization: 70,
  strongMinNetContribution: 0,
  strongMaxMaintenancePctOfRevenue: 25,
  watchMaxRentableIdleDays: 14,
  underperformingMaxNetContribution: 0,
  underperformingMaxDowntimeDays: 20,
};

/** Validate that owner-entered thresholds are sane (non-negative, ordered). */
export function validateThresholds(t: PerformanceThresholds): string[] {
  const errors: string[] = [];
  if (t.strongMinUtilization < 0 || t.strongMinUtilization > 100)
    errors.push("Strong utilization must be between 0 and 100.");
  if (t.strongMinNetContribution < 0)
    errors.push("Strong net contribution cannot be negative.");
  if (t.underperformingMaxNetContribution > t.strongMinNetContribution)
    errors.push("Underperforming threshold cannot exceed strong threshold.");
  if (t.watchMaxRentableIdleDays < 0)
    errors.push("Watch idle days cannot be negative.");
  if (t.underperformingMaxDowntimeDays < 0)
    errors.push("Underperforming downtime cannot be negative.");
  return errors;
}
