// Connect Pro Fleet — Fleet Health derivation (Vehicle Inventory presentation layer).
//
// Fleet Health is a TRANSPARENT, EXPLAINABLE presentation layer. It is NOT an
// opaque AI risk score — it derives directly from existing authoritative
// conditions (compliance issues, active maintenance work orders, unresolved
// violations, vehicle status) and exposes the human-readable reasons behind
// each level. No hidden weighting, no invented data.
//
// Levels:
//   healthy   — no active fleet-health issues.
//   attention — one or more non-critical items need action (reg expiring soon,
//               maintenance due soon, unresolved toll, document missing, …).
//   critical  — an immediate operational blocker (out of service, registration
//               expired, critical maintenance overdue, compliance block, …).
//
// This module performs NO domain mutations and reads only from the sources
// passed in. It is safe to call inside useMemo.

import type { Vehicle } from "./types";
import type { ComplianceIssue } from "./complianceTypes";
import type { MaintenanceWorkOrder } from "./maintenanceTypes";
import type { Violation } from "./violationTypes";
import { WORK_ORDER_ACTIVE_STATUSES } from "./maintenanceTypes";

export type FleetHealthLevel = "healthy" | "attention" | "critical";

export interface FleetHealthReason {
  /** Short, human-readable explanation (e.g. "Registration expires in 18 days"). */
  label: string;
  /** Whether this reason is an operational blocker (drives the critical level). */
  blocking: boolean;
  /** Category for icon/color grouping. */
  category: "compliance" | "maintenance" | "violation" | "status";
}

export interface FleetHealth {
  level: FleetHealthLevel;
  reasons: FleetHealthReason[];
}

const DAY_MS = 86_400_000;

/** Days from `now` until `iso` (negative if already past). NaN-safe. */
function daysUntil(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.round((t - now.getTime()) / DAY_MS);
}

/**
 * Derive Fleet Health for a single vehicle from authoritative sources.
 *
 * @param vehicle           the vehicle record
 * @param complianceIssues  derived compliance issues for this vehicle
 *                          (from getEntityComplianceStatus / entityComplianceStatus)
 * @param workOrders        ALL maintenance work orders for this vehicle
 *                          (the caller filters; active ones are considered here)
 * @param violations        ALL violations for this vehicle (unresolved ones count)
 * @param now               reference date (pinned in tests, real now in prod)
 */
export function deriveFleetHealth(input: {
  vehicle: Vehicle;
  complianceIssues: ComplianceIssue[];
  workOrders: MaintenanceWorkOrder[];
  violations: Violation[];
  now: Date;
}): FleetHealth {
  const { vehicle, complianceIssues, workOrders, violations, now } = input;
  const reasons: FleetHealthReason[] = [];

  // 1. Vehicle status — out of service is an immediate operational blocker.
  if (vehicle.status === "out_of_service") {
    reasons.push({
      label: "Vehicle is out of service",
      blocking: true,
      category: "status",
    });
  }

  // 2. Compliance issues — blocking issues (missing/expired required docs) are
  //    critical; non-blocking issues (expiring soon, pending review) are
  //    attention. Each issue contributes one explainable reason.
  for (const issue of complianceIssues) {
    const docLabel = issue.document_type.replace(/_/g, " ");
    let label: string;
    switch (issue.reason) {
      case "expired":
        label = `${docLabel} expired`;
        break;
      case "missing_required":
        label = `${docLabel} missing (required)`;
        break;
      case "failed_inspection":
        label = `${docLabel} failed inspection`;
        break;
      case "rejected":
        label = `${docLabel} rejected`;
        break;
      case "expiring_soon": {
        const d = daysUntil(issue.expiration_date, now);
        label =
          d != null
            ? `${docLabel} expires in ${Math.max(0, d)} days`
            : `${docLabel} expires soon`;
        break;
      }
      case "pending_review":
        label = `${docLabel} pending review`;
        break;
      case "file_missing":
        label = `${docLabel} file missing`;
        break;
      default:
        label = `${docLabel} needs attention`;
    }
    reasons.push({
      label,
      blocking: issue.blocking,
      category: "compliance",
    });
  }

  // 3. Active maintenance work orders — overdue expected-ready is critical;
  //    any other active work order is attention. Scheduled-soon is attention.
  const active = workOrders.filter((w) =>
    WORK_ORDER_ACTIVE_STATUSES.includes(w.status),
  );
  for (const wo of active) {
    const readyDays = daysUntil(wo.expected_ready_at, now);
    const overdue =
      wo.expected_ready_at != null && readyDays != null && readyDays < 0;
    if (overdue) {
      reasons.push({
        label: `Maintenance overdue — ${wo.title}`,
        blocking: true,
        category: "maintenance",
      });
    } else {
      const schedDays = daysUntil(wo.scheduled_start_at, now);
      const label =
        schedDays != null && schedDays >= 0
          ? `Maintenance due in ${schedDays} days — ${wo.title}`
          : `Maintenance scheduled — ${wo.title}`;
      reasons.push({
        label,
        blocking: false,
        category: "maintenance",
      });
    }
  }

  // 4. Unresolved violations — an unresolved toll/violation is attention.
  //    Overdue violations are critical (immediate financial/operational risk).
  const unresolved = violations.filter(
    (v) => v.status !== "resolved" && v.status !== "cancelled",
  );
  for (const v of unresolved) {
    const dueDays = daysUntil(v.due_at, now);
    if (v.status === "overdue" || (dueDays != null && dueDays < 0)) {
      reasons.push({
        label: `Overdue violation — ${v.violation_type.replace(/_/g, " ")}`,
        blocking: true,
        category: "violation",
      });
    } else {
      reasons.push({
        label: `Unresolved ${v.violation_type.replace(/_/g, " ")}`,
        blocking: false,
        category: "violation",
      });
    }
  }

  const hasBlocking = reasons.some((r) => r.blocking);
  const level: FleetHealthLevel = hasBlocking
    ? "critical"
    : reasons.length > 0
      ? "attention"
      : "healthy";

  return { level, reasons };
}

export const FLEET_HEALTH_LABELS: Record<FleetHealthLevel, string> = {
  healthy: "Healthy",
  attention: "Attention",
  critical: "Critical",
};
