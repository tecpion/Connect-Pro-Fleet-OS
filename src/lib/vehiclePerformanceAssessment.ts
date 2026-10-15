// Connect Pro Fleet — Vehicle Performance assessment (transparent labels).
//
// Derives a transparent performance label (Strong Performer / Watch /
// Underperforming) from authoritative metrics + owner thresholds. NEVER
// produces an opaque score. Every label is paired with explainable reasons and
// What's Helping / What's Hurting panels. Pure function, no React.

import type { PerformanceThresholds } from "./vehiclePerformanceSettings";

export type PerformanceLabel = "strong_performer" | "watch" | "underperforming";

export const PERFORMANCE_LABEL_TEXT: Record<PerformanceLabel, string> = {
  strong_performer: "Strong Performer",
  watch: "Watch",
  underperforming: "Underperforming",
};

export interface PerformanceAssessment {
  label: PerformanceLabel;
  /** Human-readable reasons explaining WHY this label was chosen. */
  reasons: string[];
  /** Positive contributing factors (grounded in data). */
  whatsHelping: string[];
  /** Negative contributing factors (grounded in data). */
  whatsHurting: string[];
}

/** Maintenance spend as a percentage of revenue (0..100). 0 when no revenue. */
export function maintenancePctOfRevenue(
  maintenanceCost: number,
  grossRevenue: number,
): number {
  if (grossRevenue <= 0) return 0;
  return (maintenanceCost / grossRevenue) * 100;
}

/**
 * Assess vehicle performance from authoritative metrics.
 *
 * Inputs are the period metrics for the selected range:
 *   - grossRevenue: gross revenue generated in the period
 *   - netContribution: cash-flow net contribution in the period
 *   - utilization: rentable utilization (0..100)
 *   - rentableIdleDays: rentable-but-idle days in the period
 *   - downtimeDays: maintenance + damage downtime days in the period
 *   - financingState: "paid_off" | "financed"
 */
export function assessPerformance(
  grossRevenue: number,
  netContribution: number,
  utilization: number,
  rentableIdleDays: number,
  downtimeDays: number,
  financingState: "paid_off" | "financed",
  thresholds: PerformanceThresholds,
  maintenancePct: number = 0,
): PerformanceAssessment {
  const helping: string[] = [];
  const hurting: string[] = [];
  const reasons: string[] = [];

  // Positive contributors.
  if (utilization >= thresholds.strongMinUtilization) {
    helping.push(`${Math.round(utilization)}% rentable utilization`);
  }
  if (netContribution > 0) {
    helping.push(
      `positive $${Math.round(netContribution).toLocaleString()} cash-flow contribution`,
    );
  }
  if (financingState === "paid_off") {
    helping.push("paid-off financing (no car-note burden)");
  }
  if (
    maintenancePct > 0 &&
    maintenancePct < thresholds.strongMaxMaintenancePctOfRevenue
  ) {
    helping.push(`maintenance at ${Math.round(maintenancePct)}% of revenue`);
  }
  if (rentableIdleDays <= thresholds.watchMaxRentableIdleDays / 2) {
    helping.push(`only ${Math.round(rentableIdleDays)} rentable idle days`);
  }

  // Negative contributors.
  if (netContribution < 0) {
    hurting.push(
      `negative $${Math.round(Math.abs(netContribution)).toLocaleString()} cash-flow contribution`,
    );
  }
  if (utilization < thresholds.strongMinUtilization) {
    hurting.push(`${Math.round(utilization)}% utilization below target`);
  }
  if (rentableIdleDays > thresholds.watchMaxRentableIdleDays) {
    hurting.push(`${Math.round(rentableIdleDays)} rentable idle days`);
  }
  if (downtimeDays > thresholds.underperformingMaxDowntimeDays) {
    hurting.push(`${Math.round(downtimeDays)} downtime days`);
  }
  if (maintenancePct > thresholds.strongMaxMaintenancePctOfRevenue) {
    hurting.push(`maintenance at ${Math.round(maintenancePct)}% of revenue`);
  }
  if (financingState === "financed") {
    hurting.push("active financing / car-note burden");
  }

  // Label decision (ordered: underperforming → watch → strong).
  let label: PerformanceLabel;

  const isUnderperforming =
    netContribution <= thresholds.underperformingMaxNetContribution ||
    downtimeDays > thresholds.underperformingMaxDowntimeDays;

  if (isUnderperforming) {
    label = "underperforming";
    if (netContribution <= thresholds.underperformingMaxNetContribution)
      reasons.push(
        `net contribution at $${Math.round(netContribution).toLocaleString()} is at/below the underperforming threshold`,
      );
    if (downtimeDays > thresholds.underperformingMaxDowntimeDays)
      reasons.push(
        `${Math.round(downtimeDays)} downtime days exceed the threshold`,
      );
  } else if (
    utilization < thresholds.strongMinUtilization ||
    rentableIdleDays > thresholds.watchMaxRentableIdleDays ||
    maintenancePct > thresholds.strongMaxMaintenancePctOfRevenue
  ) {
    label = "watch";
    if (utilization < thresholds.strongMinUtilization)
      reasons.push(
        `${Math.round(utilization)}% utilization is below the strong target`,
      );
    if (rentableIdleDays > thresholds.watchMaxRentableIdleDays)
      reasons.push(
        `${Math.round(rentableIdleDays)} rentable idle days exceed the watch threshold`,
      );
    if (maintenancePct > thresholds.strongMaxMaintenancePctOfRevenue)
      reasons.push(
        `maintenance at ${Math.round(maintenancePct)}% of revenue is above target`,
      );
  } else {
    label = "strong_performer";
    reasons.push(
      `${Math.round(utilization)}% rentable utilization meets the strong target`,
    );
    if (netContribution > 0)
      reasons.push(
        `positive $${Math.round(netContribution).toLocaleString()} cash-flow contribution`,
      );
    if (financingState === "paid_off")
      reasons.push("paid-off financing strengthens cash-flow economics");
    if (rentableIdleDays <= thresholds.watchMaxRentableIdleDays / 2)
      reasons.push(
        `only ${Math.round(rentableIdleDays)} rentable idle days this period`,
      );
  }

  return {
    label,
    reasons:
      reasons.length > 0 ? reasons : ["No notable signals in this period."],
    whatsHelping: helping,
    whatsHurting: hurting,
  };
}
