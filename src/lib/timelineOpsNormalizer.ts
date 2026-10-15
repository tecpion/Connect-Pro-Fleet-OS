// Connect Pro Fleet — operational timeline normalizers (Build #27).
//
// Damage claims, violations, and maintenance work orders each contribute
// timeline events. These normalizers transform the authoritative module
// records into UnifiedTimelineEvent entries. Financial values (claim cost,
// violation amount, work-order cost) are carried for permission-gated
// rendering only — they are stripped by the permission filter when the viewer
// lacks the relevant financial permission. Deep links route to the
// authoritative entity detail.

import type { DamageClaim } from "./damageClaimTypes";
import type { Violation } from "./violationTypes";
import type {
  MaintenanceWorkOrder,
  MaintenanceWorkOrderEvent,
} from "./maintenanceTypes";
import type { UnifiedTimelineEvent } from "./timelineTypes";
import { timelineId, safeParseDate } from "./timelineShared";

const SEVERITY_MAP: Record<string, "info" | "warning" | "critical"> = {
  minor: "info",
  moderate: "warning",
  severe: "critical",
};

/** Damage claim timeline events (opened, closed). */
export function damageTimelineEvents(
  claim: DamageClaim,
): UnifiedTimelineEvent[] {
  const events: UnifiedTimelineEvent[] = [];
  const base = {
    entity_type: "damage_claim",
    entity_id: claim.id,
    related_entity_type: "vehicle" as const,
    related_entity_id: claim.vehicle_id,
    source_module: "damage_claims",
    actor_id: claim.discovered_by_user_id,
    actor_name: null,
    financial_amount: null,
    financial_direction: null,
    severity: (SEVERITY_MAP[claim.severity] ?? "info") as
      "info" | "warning" | "critical",
    customer_id: claim.customer_id,
    vehicle_id: claim.vehicle_id,
    rental_id: claim.rental_id,
    sensitive: false,
    metadata: null,
  };

  events.push({
    ...base,
    id: timelineId("damage_claims", claim.id, "opened"),
    occurred_at: claim.discovered_at ?? claim.created_at,
    event_type: "damage_claim_opened",
    category: "damage",
    title: `Damage claim ${claim.claim_number} opened`,
    description: claim.description,
    status: claim.claim_status,
    deep_link: "/damage-claims",
  });

  if (claim.closed_at) {
    events.push({
      ...base,
      id: timelineId("damage_claims", claim.id, "closed"),
      occurred_at: claim.closed_at,
      event_type: "damage_claim_closed",
      category: "damage",
      title: `Damage claim ${claim.claim_number} closed`,
      description: claim.closure_reason,
      status: claim.claim_status,
      deep_link: "/damage-claims",
      severity: "info",
    });
  }

  return events;
}

/** Violation timeline events (received, resolved). */
export function violationTimelineEvents(v: Violation): UnifiedTimelineEvent[] {
  const events: UnifiedTimelineEvent[] = [];
  const base = {
    entity_type: "violation",
    entity_id: v.id,
    related_entity_type: "vehicle" as const,
    related_entity_id: v.vehicle_id,
    source_module: "violations",
    actor_id: v.created_by,
    actor_name: null,
    financial_amount: null,
    financial_direction: null,
    severity: "warning" as const,
    customer_id: v.customer_id,
    vehicle_id: v.vehicle_id,
    rental_id: v.rental_id,
    sensitive: false,
    metadata: null,
  };

  events.push({
    ...base,
    id: timelineId("violations", v.id, "received"),
    occurred_at: v.received_at ?? v.created_at,
    event_type: "violation_received",
    category: "violation",
    title: `Violation ${v.violation_number} received`,
    description: v.description,
    status: v.status,
    deep_link: "/violations",
  });

  if (v.status === "resolved" && v.resolved_at) {
    events.push({
      ...base,
      id: timelineId("violations", v.id, "resolved"),
      occurred_at: v.resolved_at,
      event_type: "violation_resolved",
      category: "violation",
      title: `Violation ${v.violation_number} resolved`,
      description: null,
      status: v.status,
      deep_link: "/violations",
      severity: "info",
    });
  }

  return events;
}

/** Maintenance work-order timeline events (created, completed). */
export function maintenanceTimelineEvents(
  wo: MaintenanceWorkOrder,
): UnifiedTimelineEvent[] {
  const events: UnifiedTimelineEvent[] = [];
  const base = {
    entity_type: "work_order",
    entity_id: wo.id,
    related_entity_type: "vehicle" as const,
    related_entity_id: wo.vehicle_id,
    source_module: "maintenance",
    actor_id: wo.opened_by_user_id,
    actor_name: null,
    financial_amount: null,
    financial_direction: null,
    severity: wo.blocks_vehicle_use ? ("warning" as const) : ("info" as const),
    customer_id: null,
    vehicle_id: wo.vehicle_id,
    rental_id: null,
    sensitive: false,
    metadata: null,
  };

  events.push({
    ...base,
    id: timelineId("maintenance", wo.id, "created"),
    occurred_at: wo.opened_at,
    event_type: "work_order_created",
    category: "maintenance",
    title: `Work order ${wo.work_order_number} opened`,
    description: wo.reported_issue ?? wo.title,
    status: wo.status,
    deep_link: "/maintenance",
  });

  if (wo.completed_at) {
    events.push({
      ...base,
      id: timelineId("maintenance", wo.id, "completed"),
      occurred_at: wo.completed_at,
      event_type: "work_order_completed",
      category: "maintenance",
      title: `Work order ${wo.work_order_number} completed`,
      description: wo.work_performed,
      status: wo.status,
      deep_link: "/maintenance",
      severity: "success",
    });
  }

  return events;
}

/** Maintenance work-order EVENT log → timeline (status changes, downtime). */
export function maintenanceEventTimeline(
  ev: MaintenanceWorkOrderEvent,
  vehicleId: string,
): UnifiedTimelineEvent | null {
  if (ev.event_type === "note_added") return null;
  return {
    id: timelineId("maintenance_events", ev.id, ev.event_type),
    occurred_at: ev.created_at,
    event_type: `work_order_${ev.event_type}`,
    category: "maintenance",
    title: ev.label,
    description: ev.note,
    entity_type: "work_order",
    entity_id: ev.work_order_id,
    related_entity_type: "vehicle",
    related_entity_id: vehicleId,
    source_module: "maintenance",
    actor_id: ev.actor_user_id,
    actor_name: null,
    financial_amount: null,
    financial_direction: null,
    severity: "info",
    status: null,
    deep_link: "/maintenance",
    metadata: {
      old_value: ev.old_value,
      new_value: ev.new_value,
    },
    sensitive: false,
    customer_id: null,
    vehicle_id: vehicleId,
    rental_id: null,
  };
}

/** Sort helper: newest-first by timestamp (malformed → 0 → last). */
export function sortNewestFirst<T extends { occurred_at: string }>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) => safeParseDate(b.occurred_at) - safeParseDate(a.occurred_at),
  );
}
