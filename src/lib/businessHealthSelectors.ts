// Connect Pro Fleet — Executive Dashboard Business Health Score (Build #30).
//
// Deterministic, transparent, explainable, configurable — never a mysterious
// AI score. Five components (Collections, Utilization, Availability, Compliance,
// Operations) each normalized 0–100, combined via transparent weights that total
// 100%. Formula versioned (v1) so future changes don't silently invalidate
// historical comparisons. Prior-period score uses the SAME formula/config.
// Zero-data safe (no NaN/Infinity).

import type { FleetStore } from "./store/storeContext";
import type {
  BusinessHealthScore,
  HealthComponent,
  HealthConfig,
  HealthGrade,
  TrendDirection,
} from "./executiveTypes";
import {
  DEFAULT_HEALTH_CONFIG,
  HEALTH_FORMULA_VERSION,
} from "./executiveTypes";
import type { FinancialSnapshot } from "./executiveTypes";
import type { FleetUtilizationSnapshot } from "./executiveTypes";
import type { IdleFleetSnapshot } from "./executiveTypes";
import type { OperationalLoad } from "./executiveTypes";
import type { ExecutiveAttentionItem } from "./executiveTypes";
import type { DateRange } from "./profitabilityHelpers";

function clamp(n: number): number {
  if (isNaN(n) || !isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Map a 0–100 score to a grade. Centralized so it never drifts. */
export function gradeForScore(score: number): HealthGrade {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "needs_attention";
  return "critical";
}

/** Validate that component weights total 100. */
export function validateWeights(config: HealthConfig): boolean {
  const { collections, utilization, availability, compliance, operations } =
    config.weights;
  return (
    collections + utilization + availability + compliance + operations === 100
  );
}

/** Collections health — based on collection rate, overdue balance ratio, and
 *  broken arrangements. Transparent formula documented inline. */
export function collectionsHealth(
  financial: FinancialSnapshot,
): HealthComponent {
  // Collection rate contribution (0..100% → 0..50 pts). Null rate (no
  // obligations due) is treated as neutral 40 (not penalized for no activity).
  const rate = financial.collection_rate;
  const rateScore = rate == null ? 40 : Math.min(50, Math.max(0, rate * 0.5));

  // Overdue balance ratio: overdue / outstanding. Lower is better.
  const outstanding = financial.outstanding_balance ?? 0;
  const overdue = financial.overdue_balance ?? 0;
  const overdueRatio = outstanding > 0 ? overdue / outstanding : 0;
  const overdueScore = Math.max(0, 30 - overdueRatio * 60);

  // Broken arrangements: each reduces the score (capped).
  const brokenScore = Math.max(0, 20 - financial.arrangement_broken_count * 5);

  const score = clamp(rateScore + overdueScore + brokenScore);
  return {
    key: "collections",
    label: "Collections Health",
    score,
    weight: 0,
    explanation: `Collection rate ${rate == null ? "N/A (no obligations due)" : `${rate}%`}, overdue ratio ${Math.round(overdueRatio * 100)}%, ${financial.arrangement_broken_count} broken arrangement(s).`,
    source_module: "billing",
  };
}

/** Utilization health — actual fleet utilization relative to configurable target. */
export function utilizationHealth(
  fleet: FleetUtilizationSnapshot,
  targetPct: number,
): HealthComponent {
  const ratio = targetPct > 0 ? fleet.utilization_pct / targetPct : 0;
  const score = clamp(Math.min(1, ratio) * 100);
  return {
    key: "utilization",
    label: "Fleet Utilization",
    score,
    weight: 0,
    explanation: `Utilization ${fleet.utilization_pct}% vs target ${targetPct}%.`,
    source_module: "vehicle_twin",
  };
}

/** Availability health — reflects operational blockers (blocked + long-idle),
 *  not merely available cars. High idle = lower score. */
export function availabilityHealth(
  fleet: FleetUtilizationSnapshot,
  idle: IdleFleetSnapshot,
  store: FleetStore,
): HealthComponent {
  const totalVehicles = store.vehicles.length;
  // Blocked fleet percentage lowers the score.
  const blockedPct = totalVehicles > 0 ? fleet.blocked_now / totalVehicles : 0;
  const blockedScore = Math.max(0, 60 - blockedPct * 120);
  // Long-idle percentage lowers the score (idle past threshold).
  const idlePct =
    totalVehicles > 0 ? idle.idle_past_threshold_count / totalVehicles : 0;
  const idleScore = Math.max(0, 40 - idlePct * 80);
  const score = clamp(blockedScore + idleScore);
  return {
    key: "availability",
    label: "Fleet Availability",
    score,
    weight: 0,
    explanation: `${fleet.blocked_now} blocked, ${idle.idle_past_threshold_count} idle past threshold of ${totalVehicles} vehicles.`,
    source_module: "vehicle_twin",
  };
}

/** Compliance health — blocked vehicles + expired/missing required docs. */
export function complianceHealth(load: OperationalLoad): HealthComponent {
  const c = load.compliance;
  // Each blocked vehicle / expired doc / missing doc reduces the score.
  const penalty = Math.min(
    100,
    c.blocked_vehicles * 15 + c.expired_docs * 8 + c.missing_required * 8,
  );
  const score = clamp(100 - penalty);
  return {
    key: "compliance",
    label: "Compliance Health",
    score,
    weight: 0,
    explanation: `${c.blocked_vehicles} blocked, ${c.expired_docs} expired, ${c.missing_required} missing required.`,
    source_module: "compliance",
  };
}

/** Operational follow-through — overdue tasks + unassigned Critical/High work.
 *  Does NOT score individual staff performance. */
export function operationsHealth(
  attention: ExecutiveAttentionItem[],
  store: FleetStore,
): HealthComponent {
  const now = Date.now();
  const overdueTasks = store.tasks.filter((t) => {
    if (t.status !== "open" && t.status !== "in_progress") return false;
    if (!t.due_date) return false;
    const due = new Date(t.due_date + "T00:00:00").getTime();
    return !isNaN(due) && due < now;
  }).length;
  // Briefing priorities are critical/high/medium/informational.
  const unassignedCritical = attention.filter(
    (i) =>
      (i.priority === "critical" || i.priority === "high") &&
      !i.assigned_staff_id,
  ).length;
  const penalty = Math.min(100, overdueTasks * 8 + unassignedCritical * 12);
  const score = clamp(100 - penalty);
  return {
    key: "operations",
    label: "Operational Follow-Through",
    score,
    weight: 0,
    explanation: `${overdueTasks} overdue task(s), ${unassignedCritical} unassigned critical/high item(s).`,
    source_module: "tasks",
  };
}

/** Calculate the deterministic Business Health Score. Transparent + explainable. */
export function calculateBusinessHealthScore(input: {
  financial: FinancialSnapshot;
  fleet: FleetUtilizationSnapshot;
  idle: IdleFleetSnapshot;
  load: OperationalLoad;
  attention: ExecutiveAttentionItem[];
  store: FleetStore;
  config?: HealthConfig;
  range: DateRange;
  asOf: Date;
  priorScore?: number;
}): BusinessHealthScore {
  const config = input.config ?? DEFAULT_HEALTH_CONFIG;
  const components: HealthComponent[] = [
    collectionsHealth(input.financial),
    utilizationHealth(input.fleet, config.utilization_target_pct),
    availabilityHealth(input.fleet, input.idle, input.store),
    complianceHealth(input.load),
    operationsHealth(input.attention, input.store),
  ];

  // Apply weights.
  const weightMap: Record<string, number> = {
    collections: config.weights.collections,
    utilization: config.weights.utilization,
    availability: config.weights.availability,
    compliance: config.weights.compliance,
    operations: config.weights.operations,
  };
  const weighted = components.map((c) => ({
    ...c,
    weight: weightMap[c.key] ?? 0,
  }));

  const totalWeight = weighted.reduce((s, c) => s + c.weight, 0);
  const overall =
    totalWeight > 0
      ? clamp(
          weighted.reduce((s, c) => s + (c.score * c.weight) / totalWeight, 0),
        )
      : 0;

  const grade = gradeForScore(overall);
  const explanation = weighted
    .map((c) => `${c.label}: ${c.score} (${c.weight}%) — ${c.explanation}`)
    .join("\n");

  const priorScore = input.priorScore ?? null;
  let trend: TrendDirection = "unavailable";
  if (priorScore != null) {
    const diff = overall - priorScore;
    trend = Math.abs(diff) < 1 ? "flat" : diff > 0 ? "up" : "down";
  }

  return {
    overall_score: overall,
    grade,
    components: weighted,
    explanation,
    as_of: input.asOf.toISOString(),
    range: {
      start: input.range.start.toISOString(),
      end: input.range.end.toISOString(),
    },
    formula_version: HEALTH_FORMULA_VERSION,
    prior_score: priorScore,
    trend,
  };
}

/** Compute a prior-period health score using the SAME formula/config so the
 *  comparison is apples-to-apples. Returns the overall score only (used for
 *  trend). */
export function calculatePriorHealthScore(input: {
  financial: FinancialSnapshot;
  fleet: FleetUtilizationSnapshot;
  idle: IdleFleetSnapshot;
  load: OperationalLoad;
  attention: ExecutiveAttentionItem[];
  store: FleetStore;
  config?: HealthConfig;
  range: DateRange;
  asOf: Date;
}): number {
  return calculateBusinessHealthScore({
    ...input,
    priorScore: undefined,
  }).overall_score;
}
