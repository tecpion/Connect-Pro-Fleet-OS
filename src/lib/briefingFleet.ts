// Connect Pro Fleet — Daily Briefing fleet + idle selectors (Build #28).
//
// Composes the Build #27 vehicleTwin selectors (blocked intervals, idle
// vehicles) + the existing maintenance/damage/violation/compliance selectors.
// Blocked vehicles show ALL coexisting reasons (maintenance + damage +
// compliance never overwrite each other). A blocked vehicle with a reservation
// / rental starting today is escalated to a higher priority than one with no
// upcoming demand.
//
// Idle fleet reuses getAvailableIdleVehicles (longest-idle first). Idle priority
// is configurable (attention threshold + high-attention threshold). No
// speculative lost-revenue dollar figure is ever produced as factual profit.

import type {
  BriefingItem,
  BriefingSources,
  IdleFleetRollup,
} from "./briefingTypes";
import {
  getVehicleBlockedIntervals,
  getAvailableIdleVehicles,
  getVehicleDamageFrequency,
  type VehicleTwinSources,
} from "./vehicleTwinSelectors";
import { isWorkOrderActive, isWorkOrderBlocking } from "./maintenanceSelectors";
import { getComplianceBlock } from "./complianceAvailability";
import {
  getOpenViolations,
  getOverdueViolations,
  getViolationsDueSoon,
} from "./violationSelectors";
import { VIOLATION_OPEN_STATUSES } from "./violationTypes";
import { attentionKey, idlePriority } from "./briefingPriority";

const DAY = 86_400_000;

function toTwin(src: BriefingSources): VehicleTwinSources {
  return {
    store: src.store,
    damageClaims: src.damageClaims,
    violations: src.violations,
    documents: src.documents,
    requirements: src.requirements,
    overrides: src.overrides,
    range: src.range,
  };
}

function todayStr(asOf: Date): string {
  return asOf.toISOString().slice(0, 10);
}

/** Blocked vehicles — all coexisting block reasons surface. A block with an
 *  upcoming reservation/rental is escalated to Critical. */
export function getBlockedVehicles(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const twin = toTwin(src);
  const today = todayStr(asOf);
  const items: BriefingItem[] = [];
  for (const v of s.vehicles) {
    const intervals = getVehicleBlockedIntervals(v.id, twin, asOf);
    if (intervals.length === 0) continue;
    const hasUpcomingDemand =
      s.reservations.some(
        (r) =>
          r.vehicle_id === v.id &&
          r.start_date === today &&
          r.status === "confirmed",
      ) ||
      s.rentals.some(
        (r) =>
          r.vehicle_id === v.id &&
          r.checkout_date === today &&
          ACTIVE_HAS(r.status),
      );
    const reasons = intervals.map((i) => i.reason).join("; ");
    // Determine the dominant block source for the category.
    const combined = intervals.map((i) => i.source).join("+");
    const category: BriefingItem["category"] = combined.includes("compliance")
      ? "compliance"
      : combined.includes("damage")
        ? "damage"
        : "maintenance";
    items.push({
      id: attentionKey("fleet", "vehicle", v.id, "blocked"),
      category,
      priority: hasUpcomingDemand ? "critical" : "high",
      title: hasUpcomingDemand
        ? "Blocked vehicle with demand today"
        : "Vehicle blocked",
      reason: reasons,
      entity_type: "vehicle",
      entity_id: v.id,
      vehicle_id: v.id,
      occurred_at: intervals[0].start,
      status: "blocked",
      action_type: "view_vehicle",
      action_label: "View Vehicle",
      deep_link: `/vehicles/${v.id}`,
      source_module: "vehicle_twin",
      source_entity: "vehicle",
      source_id: v.id,
      sensitive: false,
    });
  }
  return items;
}

function ACTIVE_HAS(status: string): boolean {
  return [
    "active",
    "late",
    "overdue",
    "payment_due",
    "return_pending",
  ].includes(status);
}

/** Maintenance attention — blocking + overdue + waiting-for-approval work orders. */
export function getMaintenanceAttention(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const items: BriefingItem[] = [];
  for (const wo of s.workOrders) {
    if (!isWorkOrderActive(wo)) continue;
    if (!wo.blocks_vehicle_use && wo.status !== "waiting_for_approval")
      continue;
    const overdue =
      wo.expected_ready_at &&
      new Date(wo.expected_ready_at).getTime() < asOf.getTime();
    items.push({
      id: attentionKey("maintenance", "work_order", wo.id, "attention"),
      category: "maintenance",
      priority: wo.blocks_vehicle_use ? "high" : overdue ? "medium" : "medium",
      title: wo.blocks_vehicle_use
        ? "Vehicle unavailable — maintenance"
        : "Work order awaiting action",
      reason:
        wo.status === "waiting_for_approval"
          ? "Awaiting approval"
          : overdue
            ? `Past expected ready ${wo.expected_ready_at}`
            : wo.title,
      entity_type: "work_order",
      entity_id: wo.id,
      vehicle_id: wo.vehicle_id,
      occurred_at: wo.opened_at,
      status: wo.status,
      action_type: "view_work_order",
      action_label: "View Work Order",
      deep_link: "/maintenance",
      source_module: "maintenance",
      source_entity: "work_order",
      source_id: wo.id,
      sensitive: false,
    });
  }
  return items;
}

/** Damage attention — open blocking claims + responsibility unresolved. */
export function getDamageAttention(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const claims = src.damageClaims ?? [];
  const items: BriefingItem[] = [];
  for (const c of claims) {
    if (!c.blocks_vehicle_use) continue;
    if (["resolved", "closed", "cancelled"].includes(c.claim_status)) continue;
    items.push({
      id: attentionKey("damage", "claim", c.id, "open_blocking"),
      category: "damage",
      priority: "high",
      title: "Open blocking damage claim",
      reason: `${c.claim_number} blocks vehicle use`,
      entity_type: "damage_claim",
      entity_id: c.id,
      vehicle_id: c.vehicle_id,
      customer_id: c.customer_id ?? null,
      occurred_at: c.discovered_at ?? c.created_at,
      status: c.claim_status,
      action_type: "view_damage",
      action_label: "View Damage Claims",
      deep_link: "/damage-claims",
      source_module: "damage_claims",
      source_entity: "claim",
      source_id: c.id,
      sensitive: false,
    });
  }
  return items;
}

/** Compliance attention — expired / expiring soon / missing required / rejected. */
export function getComplianceAttention(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const items: BriefingItem[] = [];
  for (const v of s.vehicles) {
    const block = getComplianceBlock(
      v.id,
      `${v.year} ${v.make} ${v.model}`,
      src.requirements ?? [],
      src.documents ?? [],
      src.overrides ?? [],
      asOf,
    );
    if (block.blocked) {
      items.push({
        id: attentionKey("compliance", "vehicle", v.id, "blocked"),
        category: "compliance",
        priority: "high",
        title: "Compliance block",
        reason: block.reasons.join("; "),
        entity_type: "vehicle",
        entity_id: v.id,
        vehicle_id: v.id,
        status: "blocked",
        action_type: "view_compliance",
        action_label: "Review Compliance",
        deep_link: "/compliance",
        source_module: "compliance",
        source_entity: "vehicle",
        source_id: v.id,
        sensitive: false,
      });
    }
  }
  return items;
}

/** Violation attention — overdue + due soon + unresolved disputes. */
export function getViolationAttention(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const violations = src.violations ?? [];
  const items: BriefingItem[] = [];
  const overdue = getOverdueViolations(violations, asOf);
  for (const v of overdue) {
    items.push({
      id: attentionKey("violation", "violation", v.id, "overdue"),
      category: "violation",
      priority: "high",
      title: "Overdue violation",
      reason: `Due ${v.due_at ?? "—"} · overdue`,
      entity_type: "violation",
      entity_id: v.id,
      vehicle_id: v.vehicle_id,
      customer_id: v.customer_id,
      occurred_at: v.occurred_at,
      due_at: v.due_at,
      status: v.status,
      action_type: "view_violation",
      action_label: "View Violation",
      deep_link: "/violations",
      source_module: "violations",
      source_entity: "violation",
      source_id: v.id,
      sensitive: false,
    });
  }
  const dueSoon = getViolationsDueSoon(violations, asOf, 3);
  for (const v of dueSoon) {
    if (overdue.includes(v)) continue;
    items.push({
      id: attentionKey("violation", "violation", v.id, "due_soon"),
      category: "violation",
      priority: "medium",
      title: "Violation due soon",
      reason: `Due ${v.due_at}`,
      entity_type: "violation",
      entity_id: v.id,
      vehicle_id: v.vehicle_id,
      customer_id: v.customer_id,
      due_at: v.due_at,
      status: v.status,
      action_type: "view_violation",
      action_label: "View Violation",
      deep_link: "/violations",
      source_module: "violations",
      source_entity: "violation",
      source_id: v.id,
      sensitive: false,
    });
  }
  return items;
}

/** Idle fleet — available + idle vehicles, longest-idle first. Future
 *  reservation context is surfaced but the vehicle is NOT treated identically
 *  to one with no demand. No speculative lost-revenue figure. */
export function getIdleFleet(
  src: BriefingSources,
  asOf: Date,
  config: {
    idle_attention_threshold_days: number;
    idle_high_attention_days: number;
  },
): BriefingItem[] {
  const s = src.store;
  const twin = toTwin(src);
  const range = src.range;
  if (!range) return [];
  const idle = getAvailableIdleVehicles(twin, range, asOf);
  return idle.map((iv) => {
    const nextRes = s.reservations
      .filter(
        (r) =>
          r.vehicle_id === iv.vehicleId &&
          r.start_date > todayStr(asOf) &&
          r.status === "confirmed",
      )
      .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0];
    const daysToNext = nextRes
      ? Math.round(
          (new Date(nextRes.start_date + "T00:00:00").getTime() -
            new Date(todayStr(asOf) + "T00:00:00").getTime()) /
            DAY,
        )
      : null;
    return {
      id: attentionKey("idle", "vehicle", iv.vehicleId, "idle"),
      category: "idle" as const,
      priority: idlePriority(
        iv.idleDays,
        config.idle_attention_threshold_days,
        config.idle_high_attention_days,
      ),
      title: "Idle available vehicle",
      reason: nextRes
        ? `Idle ${iv.idleDays}d · next reservation in ${daysToNext}d`
        : `Idle ${iv.idleDays}d · no future reservation`,
      entity_type: "vehicle",
      entity_id: iv.vehicleId,
      vehicle_id: iv.vehicleId,
      occurred_at: todayStr(asOf),
      age_days: iv.idleDays,
      status: iv.status,
      amount: iv.dailyRate, // rate shown as context only, NOT multiplied
      action_type: "view_vehicle",
      action_label: "View Vehicle",
      deep_link: `/vehicles/${iv.vehicleId}`,
      source_module: "vehicle_twin",
      source_entity: "vehicle",
      source_id: iv.vehicleId,
      sensitive: false,
    };
  });
}

/** Idle fleet rollup — factual counts only (no speculative dollar loss). */
export function getIdleFleetRollup(
  src: BriefingSources,
  asOf: Date,
  config: { idle_attention_threshold_days: number },
): IdleFleetRollup {
  const twin = toTwin(src);
  const range = src.range;
  if (!range)
    return {
      idle_count: 0,
      total_idle_days: 0,
      idle_past_threshold_count: 0,
      longest_idle_vehicle_id: null,
      longest_idle_days: 0,
      classes_with_idle: [],
      vehicles_without_future_reservation: 0,
    };
  const idle = getAvailableIdleVehicles(twin, range, asOf);
  const s = src.store;
  const today = todayStr(asOf);
  let total = 0;
  let pastThreshold = 0;
  let longestId: string | null = null;
  let longestDays = 0;
  const classes = new Set<string>();
  let noFuture = 0;
  for (const iv of idle) {
    total += iv.idleDays;
    if (iv.idleDays >= config.idle_attention_threshold_days) pastThreshold++;
    if (iv.idleDays > longestDays) {
      longestDays = iv.idleDays;
      longestId = iv.vehicleId;
    }
    const v = s.vehicles.find((x) => x.id === iv.vehicleId);
    const cls = s.vehicleClasses.find((c) => c.id === v?.vehicle_class_id);
    if (cls) classes.add(cls.name);
    const hasFuture = s.reservations.some(
      (r) =>
        r.vehicle_id === iv.vehicleId &&
        r.start_date > today &&
        r.status === "confirmed",
    );
    if (!hasFuture) noFuture++;
  }
  return {
    idle_count: idle.length,
    total_idle_days: total,
    idle_past_threshold_count: pastThreshold,
    longest_idle_vehicle_id: longestId,
    longest_idle_days: longestDays,
    classes_with_idle: [...classes],
    vehicles_without_future_reservation: noFuture,
  };
}
