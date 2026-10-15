// Connect Pro Fleet — Maintenance Attention derivation (presentation layer).
//
// Maintenance Attention is a TRANSPARENT, EXPLAINABLE presentation layer — it is
// NOT an opaque AI risk score. It derives directly from existing authoritative
// conditions on a work order (overdue expected-ready, vehicle down, urgent
// priority, waiting past ready, missing assignee/vendor, next-service threshold
// approaching) and exposes the human-readable reasons behind each level.
//
// Levels:
//   healthy   — no active maintenance issue requiring action.
//   attention — one or more non-critical items need action soon.
//   critical  — an immediate operational risk/blocker.
//
// This module performs NO domain mutations and reads only from the sources
// passed in. It is safe to call inside useMemo.

import type { MaintenanceWorkOrder } from "./maintenanceTypes";
import {
  isWorkOrderActive,
  isWorkOrderPastExpectedReady,
} from "./maintenanceSelectors";

export type MaintenanceAttentionLevel = "healthy" | "attention" | "critical";

export interface MaintenanceAttentionReason {
  /** Short, human-readable explanation. */
  label: string;
  /** Whether this reason is an operational blocker (drives the critical level). */
  blocking: boolean;
  /** Category for icon/color grouping. */
  category: "schedule" | "status" | "assignment" | "cost" | "service";
}

export interface MaintenanceAttention {
  level: MaintenanceAttentionLevel;
  reasons: MaintenanceAttentionReason[];
}

const DAY_MS = 86_400_000;

function daysUntil(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.round((t - now.getTime()) / DAY_MS);
}

/**
 * Derive Maintenance Attention for a single work order from authoritative
 * sources. Only ACTIVE work orders are evaluated — completed/cancelled orders
 * are always healthy (no action needed).
 *
 * @param wo   the work order record
 * @param now  reference date (pinned in tests, real now in prod)
 */
export function deriveMaintenanceAttention(
  wo: MaintenanceWorkOrder,
  now: Date = new Date(),
): MaintenanceAttention {
  // Terminal statuses need no action.
  if (!isWorkOrderActive(wo)) {
    return { level: "healthy", reasons: [] };
  }

  const reasons: MaintenanceAttentionReason[] = [];

  // 1. Urgent priority is a critical operational risk.
  if (wo.priority === "urgent") {
    reasons.push({
      label: "Urgent priority — needs immediate action",
      blocking: true,
      category: "status",
    });
  }

  // 2. Vehicle is down (blocking + downtime active) — critical blocker.
  const isDown =
    wo.blocks_vehicle_use &&
    wo.downtime_started_at !== null &&
    wo.downtime_ended_at === null;
  if (isDown) {
    reasons.push({
      label: "Vehicle is out of service for this work order",
      blocking: true,
      category: "status",
    });
  }

  // 3. Past expected ready — critical (vehicle not back when promised).
  if (isWorkOrderPastExpectedReady(wo, now)) {
    reasons.push({
      label: "Past expected ready date",
      blocking: true,
      category: "schedule",
    });
  }

  // 4. Waiting on parts/approval past expected ready — critical.
  if (
    (wo.status === "waiting_for_parts" ||
      wo.status === "waiting_for_approval") &&
    wo.expected_ready_at &&
    isWorkOrderPastExpectedReady(wo, now)
  ) {
    reasons.push({
      label: "Waiting on dependency past expected ready",
      blocking: true,
      category: "schedule",
    });
  }

  // 5. Expected ready approaching soon (within 2 days) — attention.
  const readyDays = daysUntil(wo.expected_ready_at, now);
  if (readyDays !== null && readyDays >= 0 && readyDays <= 2) {
    reasons.push({
      label: `Expected ready in ${readyDays} day${readyDays === 1 ? "" : "s"}`,
      blocking: false,
      category: "schedule",
    });
  }

  // 6. No assignee on an active order — attention.
  if (!wo.assigned_user_id) {
    reasons.push({
      label: "No technician assigned",
      blocking: false,
      category: "assignment",
    });
  }

  // 7. No vendor where one might be expected (non-routine, non-detailing work
  //    with no vendor and not yet completed) — attention. Routine/detailing
  //    are often done in-house, so we don't flag those.
  const inHouseOk =
    wo.maintenance_type === "routine_service" ||
    wo.maintenance_type === "detailing" ||
    wo.maintenance_type === "inspection";
  if (!wo.vendor_id && !inHouseOk) {
    reasons.push({
      label: "No vendor assigned",
      blocking: false,
      category: "assignment",
    });
  }

  // 8. Missing estimate on an active order — attention (cost planning gap).
  if (wo.estimated_cost === null) {
    reasons.push({
      label: "No cost estimate recorded",
      blocking: false,
      category: "cost",
    });
  }

  // 9. Next service threshold approaching (date within 14 days) — attention.
  const nextDays = daysUntil(wo.next_service_due_date, now);
  if (nextDays !== null && nextDays >= 0 && nextDays <= 14) {
    reasons.push({
      label: `Next service due in ${nextDays} days`,
      blocking: false,
      category: "service",
    });
  }

  const hasBlocking = reasons.some((r) => r.blocking);
  const level: MaintenanceAttentionLevel = hasBlocking
    ? "critical"
    : reasons.length > 0
      ? "attention"
      : "healthy";

  return { level, reasons };
}

export const MAINTENANCE_ATTENTION_LABELS: Record<
  MaintenanceAttentionLevel,
  string
> = {
  healthy: "Healthy",
  attention: "Attention",
  critical: "Critical",
};
