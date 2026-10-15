// Connect Pro Fleet — Vehicle Digital Twin selectors (Build #27).
//
// The Digital Twin is an AGGREGATION layer over the authoritative modules.
// Utilization, blocked days, and idle days are DERIVED — never stored. Blocked
// intervals merge overlapping maintenance + damage + compliance blocks so the
// same calendar day is never double-counted. Utilization is exchange-aware:
// a vehicle is credited as "rented" only for the days it actually served
//  within a rental (via the existing vehicleDayFractions attribution).
//
// Money is NOT recomputed here — profitability reuses the existing Build #16
// VehicleProfitability selectors. This module exposes the structured data a
// future AI / Daily Briefing needs ("which vehicles can't be rented today?",
// "how long has vehicle 42 been idle?").

import type { FleetStore } from "./store/storeContext";
import type { Vehicle, RentalAgreement } from "./types";
import type { MaintenanceWorkOrder } from "./maintenanceTypes";
import type { DamageClaim } from "./damageClaimTypes";
import type { Violation } from "./violationTypes";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
  ComplianceStatus,
} from "./complianceTypes";
import type { DateRange } from "./profitabilityHelpers";
import { DAY, startOfDay, endOfDay } from "./profitabilityHelpers";
import type { ProfitabilityInputs } from "./profitabilitySelectors";
import {
  vehicleRentedDays,
  vehicleAvailableDays,
} from "./profitabilityAttribution";
import { isWorkOrderBlocking } from "./maintenanceSelectors";
import { getComplianceBlock } from "./complianceAvailability";
import { DAMAGE_CLAIM_ACTIVE_STATUSES } from "./damageClaimTypes";
import { VIOLATION_OPEN_STATUSES } from "./violationTypes";
import { safeParseDate } from "./timelineShared";

export interface VehicleTwinSources {
  store: FleetStore;
  damageClaims?: DamageClaim[];
  violations?: Violation[];
  documents?: DocumentRecord[];
  requirements?: ComplianceRequirement[];
  overrides?: ComplianceOverride[];
  /** Profitability date range (resolved by useEntitySources). Required by the
   *  utilization / twin-summary selectors; optional on the interface so pure
   *  callers that pass a range explicitly aren't forced to duplicate it. */
  range?: DateRange;
  /** Profitability inputs (resolved by useEntitySources). Required only by the
   *  profitability display in the Digital Twin overview; optional so pure
   *  utilization callers aren't forced to assemble them. */
  inputs?: ProfitabilityInputs;
}

export interface BlockedInterval {
  source: "maintenance" | "damage" | "compliance";
  start: string;
  end: string | null;
  reason: string;
}

export interface VehicleUtilization {
  calendarDays: number;
  blockedDays: number;
  rentableDays: number;
  rentedDays: number;
  idleDays: number;
  utilizationPct: number;
}

export interface VehicleDigitalTwinSummary {
  vehicleId: string;
  currentStatus: string;
  currentRentalId: string | null;
  currentCustomerId: string | null;
  utilization: VehicleUtilization;
  openViolations: number;
  complianceStatus: ComplianceStatus;
  blockingReasons: string[];
  ownershipType: string | null;
  lastActivityAt: string | null;
}

/** Merge overlapping blocked intervals into a set of non-overlapping spans
 *  so the same calendar day is never double-counted. Returns merged day-count. */
export function mergeBlockedIntervals(
  intervals: BlockedInterval[],
): BlockedInterval[] {
  const valid = intervals.filter((i) => safeParseDate(i.start) > 0);
  if (valid.length === 0) return [];
  const sorted = [...valid].sort(
    (a, b) => safeParseDate(a.start) - safeParseDate(b.start),
  );
  const merged: BlockedInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    const curStart = safeParseDate(cur.start);
    const lastEndTs = last.end ? safeParseDate(last.end) : Infinity;
    if (curStart <= lastEndTs) {
      // Overlap or adjacent — extend the merged span to the later end and
      // combine reasons so coexisting block sources (maintenance + damage +
      // compliance) are never hidden (spec §18/§28/§45).
      const curEnd = cur.end ? safeParseDate(cur.end) : Infinity;
      if (curEnd > lastEndTs) {
        last.end = cur.end;
      }
      const reasons = new Set(
        [...last.reason.split("; "), ...cur.reason.split("; ")].filter(Boolean),
      );
      last.reason = [...reasons].join("; ");
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

/** Count distinct blocked calendar days across merged intervals. */
export function countBlockedDays(
  intervals: BlockedInterval[],
  now: Date = new Date(),
): number {
  const merged = mergeBlockedIntervals(intervals);
  let days = 0;
  for (const iv of merged) {
    const start = startOfDay(new Date(safeParseDate(iv.start)));
    const endTs = iv.end ? safeParseDate(iv.end) : now.getTime();
    const end = endOfDay(new Date(endTs));
    const d = Math.floor((end.getTime() - start.getTime()) / DAY) + 1;
    days += Math.max(0, d);
  }
  return days;
}

/** Derive blocked intervals for a vehicle from maintenance + damage + compliance.
 *  Maintenance uses downtime_started_at → downtime_ended_at. Damage uses
 *  discovered_at → closed_at when blocks_vehicle_use. Compliance contributes
 *  only date-bound blocking (current active blocks have no end → open-ended). */
export function getVehicleBlockedIntervals(
  vehicleId: string,
  src: VehicleTwinSources,
  now: Date = new Date(),
): BlockedInterval[] {
  const intervals: BlockedInterval[] = [];
  const s = src.store;

  for (const wo of s.workOrders) {
    if (wo.vehicle_id !== vehicleId) continue;
    if (!isWorkOrderBlocking(wo)) continue;
    if (!wo.downtime_started_at) continue;
    intervals.push({
      source: "maintenance",
      start: wo.downtime_started_at,
      end: wo.downtime_ended_at,
      reason: `Maintenance: ${wo.title}`,
    });
  }

  for (const c of src.damageClaims ?? []) {
    if (c.vehicle_id !== vehicleId) continue;
    if (!c.blocks_vehicle_use) continue;
    if (!DAMAGE_CLAIM_ACTIVE_STATUSES.includes(c.claim_status)) continue;
    intervals.push({
      source: "damage",
      start: c.discovered_at ?? c.created_at,
      end: c.closed_at,
      reason: `Damage: ${c.claim_number}`,
    });
  }

  // Compliance blocking is current-state (no date interval); represent as an
  // open-ended interval starting now so it counts toward today's blocked days.
  const block = getComplianceBlock(
    vehicleId,
    s.vehicles.find((v) => v.id === vehicleId)
      ? `${s.vehicles.find((v) => v.id === vehicleId)!.year} ${s.vehicles.find((v) => v.id === vehicleId)!.make} ${s.vehicles.find((v) => v.id === vehicleId)!.model}`
      : "Vehicle",
    src.requirements ?? [],
    src.documents ?? [],
    src.overrides ?? [],
    now,
  );
  if (block.blocked) {
    intervals.push({
      source: "compliance",
      start: now.toISOString(),
      end: null,
      reason: `Compliance: ${block.reasons.join("; ")}`,
    });
  }

  return mergeBlockedIntervals(intervals);
}

/** Exchange-aware utilization for a vehicle over a date range.
 *  rentableDays = calendarDays - blockedDays.
 *  rentedDays = days the vehicle actually served (via vehicleDayFractions).
 *  idleDays = rentableDays - rentedDays.
 *  utilizationPct = rentedDays / rentableDays (0 when rentable = 0). */
export function getVehicleUtilization(
  vehicleId: string,
  src: VehicleTwinSources,
  range: DateRange,
  now: Date = new Date(),
): VehicleUtilization {
  const s = src.store;
  const calendarDays = vehicleAvailableDays(range);
  const blockedIntervals = getVehicleBlockedIntervals(vehicleId, src, now);
  // Only count blocked days that fall within the range.
  const inRangeBlocked = blockedIntervals.filter((iv) => {
    const start = safeParseDate(iv.start);
    return (
      start <= range.end.getTime() && start >= range.start.getTime() - DAY * 365
    );
  });
  const blockedDays = Math.min(
    calendarDays,
    countBlockedDays(inRangeBlocked, now),
  );
  const rentableDays = Math.max(0, calendarDays - blockedDays);
  const rentedDays = vehicleRentedDays(
    vehicleId,
    s.rentals,
    s.rentals.flatMap((r) => s.vehicleExchanges(r.id)),
    range,
  );
  const idleDays = Math.max(0, rentableDays - rentedDays);
  const utilizationPct =
    rentableDays > 0 ? (rentedDays / rentableDays) * 100 : 0;
  return {
    calendarDays,
    blockedDays,
    rentableDays,
    rentedDays,
    idleDays,
    utilizationPct: Math.round(utilizationPct * 10) / 10,
  };
}

/** The full Vehicle Digital Twin summary. Profitability is NOT recomputed here —
 *  callers pass the existing VehicleProfitability in when they need money. */
export function getVehicleDigitalTwinSummary(
  vehicleId: string,
  src: VehicleTwinSources,
  range: DateRange,
  now: Date = new Date(),
): VehicleDigitalTwinSummary {
  const s = src.store;
  const vehicle = s.vehicles.find((v) => v.id === vehicleId);
  const activeRental = s.rentals.find(
    (r) =>
      r.vehicle_id === vehicleId &&
      ["active", "late", "overdue", "payment_due", "return_pending"].includes(
        r.status,
      ),
  );

  const openViolations = (src.violations ?? []).filter(
    (v) =>
      v.vehicle_id === vehicleId && VIOLATION_OPEN_STATUSES.includes(v.status),
  ).length;

  const block = getComplianceBlock(
    vehicleId,
    vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Vehicle",
    src.requirements ?? [],
    src.documents ?? [],
    src.overrides ?? [],
    now,
  );

  // Last activity across rentals + maintenance + transactions.
  const ts: number[] = [];
  for (const r of s.rentals.filter((r) => r.vehicle_id === vehicleId)) {
    ts.push(safeParseDate(r.updated_at));
  }
  for (const wo of s.workOrders.filter((w) => w.vehicle_id === vehicleId)) {
    ts.push(safeParseDate(wo.updated_at));
  }
  for (const t of s.transactions.filter((t) => t.vehicle_id === vehicleId)) {
    ts.push(safeParseDate(t.effective_date));
  }
  const lastTs = ts.length > 0 ? Math.max(...ts) : 0;

  return {
    vehicleId,
    currentStatus: vehicle?.status ?? "unknown",
    currentRentalId: activeRental?.id ?? null,
    currentCustomerId: activeRental?.customer_id ?? null,
    utilization: getVehicleUtilization(vehicleId, src, range, now),
    openViolations,
    complianceStatus: block.blocked ? "blocked" : "compliant",
    blockingReasons: block.reasons,
    ownershipType: vehicle?.ownership_type ?? null,
    lastActivityAt: lastTs > 0 ? new Date(lastTs).toISOString() : null,
  };
}

export interface IdleVehicle {
  vehicleId: string;
  label: string;
  idleDays: number;
  status: string;
  dailyRate: number;
}

/** Vehicles that are available and idle, sorted longest-idle first. Feeds the
 *  future "Money Left on the Table" insight — but does NOT compute speculative
 *  lost revenue as factual profit. */
export function getAvailableIdleVehicles(
  src: VehicleTwinSources,
  range: DateRange,
  now: Date = new Date(),
): IdleVehicle[] {
  const s = src.store;
  const out: IdleVehicle[] = [];
  for (const v of s.vehicles) {
    if (v.status !== "available") continue;
    const util = getVehicleUtilization(v.id, src, range, now);
    if (util.idleDays <= 0) continue;
    out.push({
      vehicleId: v.id,
      label: `${v.year} ${v.make} ${v.model} (${v.license_plate})`,
      idleDays: util.idleDays,
      status: v.status,
      dailyRate: v.daily_rate,
    });
  }
  return out.sort((a, b) => b.idleDays - a.idleDays);
}

/** Simple factual damage frequency count (no risk label). */
export function getVehicleDamageFrequency(
  vehicleId: string,
  claims: DamageClaim[],
  withinDays = 365,
  now: Date = new Date(),
): number {
  const cutoff = now.getTime() - withinDays * DAY;
  return claims.filter(
    (c) =>
      c.vehicle_id === vehicleId &&
      safeParseDate(c.discovered_at ?? c.created_at) >= cutoff,
  ).length;
}

export type VehicleAttentionType =
  | "maintenance_block"
  | "damage_block"
  | "compliance_block"
  | "open_damage"
  | "unresolved_violation"
  | "long_idle"
  | "active_work_order";

export interface VehicleAttentionItem {
  type: VehicleAttentionType;
  severity: "critical" | "high" | "medium" | "normal";
  label: string;
  detail: string | null;
}

/** Derive actionable attention items for a vehicle. Only REAL issues. */
export function getVehicleAttentionItems(
  vehicleId: string,
  src: VehicleTwinSources,
  range: DateRange,
  now: Date = new Date(),
): VehicleAttentionItem[] {
  const s = src.store;
  const items: VehicleAttentionItem[] = [];
  const intervals = getVehicleBlockedIntervals(vehicleId, src, now);

  for (const iv of intervals) {
    // A merged interval may combine multiple block sources (e.g. maintenance +
    // damage + compliance). Surface each as a distinct attention item so no
    // coexisting block is hidden (spec §18/§28/§45).
    const reason = iv.reason.toLowerCase();
    if (reason.includes("maintenance")) {
      items.push({
        type: "maintenance_block",
        severity: "critical",
        label: "Maintenance block",
        detail: iv.reason,
      });
    }
    if (reason.includes("damage")) {
      items.push({
        type: "damage_block",
        severity: "critical",
        label: "Damage block",
        detail: iv.reason,
      });
    }
    if (reason.includes("compliance")) {
      items.push({
        type: "compliance_block",
        severity: "critical",
        label: "Compliance block",
        detail: iv.reason,
      });
    }
  }

  const openDamage = (src.damageClaims ?? []).filter(
    (c) =>
      c.vehicle_id === vehicleId &&
      DAMAGE_CLAIM_ACTIVE_STATUSES.includes(c.claim_status),
  ).length;
  if (openDamage > 0) {
    items.push({
      type: "open_damage",
      severity: "medium",
      label: `${openDamage} open damage claim${openDamage > 1 ? "s" : ""}`,
      detail: null,
    });
  }

  const openVio = (src.violations ?? []).filter(
    (v) =>
      v.vehicle_id === vehicleId && VIOLATION_OPEN_STATUSES.includes(v.status),
  ).length;
  if (openVio > 0) {
    items.push({
      type: "unresolved_violation",
      severity: "medium",
      label: `${openVio} unresolved violation${openVio > 1 ? "s" : ""}`,
      detail: null,
    });
  }

  const activeWo = s.workOrders.filter(
    (w) => w.vehicle_id === vehicleId && isWorkOrderBlocking(w),
  ).length;
  if (activeWo > 0) {
    items.push({
      type: "active_work_order",
      severity: "high",
      label: `${activeWo} active blocking work order${activeWo > 1 ? "s" : ""}`,
      detail: null,
    });
  }

  const util = getVehicleUtilization(vehicleId, src, range, now);
  if (util.idleDays >= 7) {
    items.push({
      type: "long_idle",
      severity: "normal",
      label: `Idle for ${util.idleDays} days`,
      detail: null,
    });
  }

  return items;
}
