// Connect Pro Fleet — Executive Dashboard fleet utilization + idle selectors
// (Build #30).
//
// DERIVED from the authoritative Build #27 Vehicle Digital Twin selectors.
// Never invents a second utilization formula. Fleet-level utilization sums
// per-vehicle rented/rentable/blocked/idle days; overlapping blockers
// (maintenance + damage + compliance) are merged so one vehicle-day counts
// once (Build #27 mergeBlockedIntervals). Idle fleet reuses Build #28 idle
// definitions. Prior-period utilization uses the same selectors over the
// preceding equivalent range.

import type { FleetStore } from "./store/storeContext";
import type { Vehicle } from "./types";
import type { DamageClaim } from "./damageClaimTypes";
import type { Violation } from "./violationTypes";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
} from "./complianceTypes";
import type {
  FleetUtilizationSnapshot,
  IdleFleetSnapshot,
  IdleByClass,
  IdleByLocation,
  IdleOpportunity,
  TrendDirection,
} from "./executiveTypes";
import type { DateRange } from "./profitabilityHelpers";
import {
  getVehicleUtilization,
  getVehicleBlockedIntervals,
  getAvailableIdleVehicles,
  type VehicleTwinSources,
} from "./vehicleTwinSelectors";
import { getFutureReservationsForVehicle } from "./maintenanceSelectors";
import {
  precedingRange,
  safePercentChange,
} from "./executiveFinancialSelectors";
import { DAY, round2 } from "./profitabilityHelpers";

export interface ExecutiveFleetSources {
  store: FleetStore;
  damageClaims?: DamageClaim[];
  violations?: Violation[];
  documents?: DocumentRecord[];
  requirements?: ComplianceRequirement[];
  overrides?: ComplianceOverride[];
}

function twinSources(src: ExecutiveFleetSources): VehicleTwinSources {
  return {
    store: src.store,
    damageClaims: src.damageClaims,
    violations: src.violations,
    documents: src.documents,
    requirements: src.requirements,
    overrides: src.overrides,
  };
}

/** Fleet-level utilization snapshot. Sums per-vehicle days; overlapping
 *  blockers merged so one vehicle-day counts once. */
export function buildFleetUtilizationSnapshot(
  src: ExecutiveFleetSources,
  range: DateRange,
  now: Date = new Date(),
): FleetUtilizationSnapshot {
  const s = src.store;
  const ts = twinSources(src);
  let rentedDays = 0;
  let rentableDays = 0;
  let blockedDays = 0;
  let idleAvailableDays = 0;

  let availableNow = 0;
  let rentedNow = 0;
  let blockedNow = 0;
  let reservedNow = 0;

  for (const v of s.vehicles) {
    const util = getVehicleUtilization(v.id, ts, range, now);
    rentedDays += util.rentedDays;
    rentableDays += util.rentableDays;
    blockedDays += util.blockedDays;
    idleAvailableDays += util.idleDays;

    // Current status counts (mutually exclusive by vehicle.status).
    if (v.status === "available") availableNow++;
    else if (v.status === "rented") rentedNow++;
    else if (v.status === "maintenance" || v.status === "out_of_service")
      blockedNow++;
    else if (v.status === "reserved") reservedNow++;
  }

  const utilizationPct =
    rentableDays > 0 ? round2((rentedDays / rentableDays) * 100) : 0;

  // Prior-period utilization for trend.
  const prior = precedingRange(range.start, range.end);
  let priorRented = 0;
  let priorRentable = 0;
  for (const v of s.vehicles) {
    const pu = getVehicleUtilization(v.id, ts, prior, now);
    priorRented += pu.rentedDays;
    priorRentable += pu.rentableDays;
  }
  const priorUtilizationPct =
    priorRentable > 0 ? round2((priorRented / priorRentable) * 100) : 0;
  const trend = safePercentChange(utilizationPct, priorUtilizationPct);

  return {
    rented_days: rentedDays,
    rentable_days: rentableDays,
    blocked_days: blockedDays,
    idle_available_days: idleAvailableDays,
    utilization_pct: utilizationPct,
    available_now: availableNow,
    rented_now: rentedNow,
    blocked_now: blockedNow,
    reserved_now: reservedNow,
    prior_utilization_pct: priorRentable > 0 ? priorUtilizationPct : null,
    utilization_trend: trend.direction as TrendDirection,
  };
}

/** Idle fleet snapshot. Reuses Build #28 getAvailableIdleVehicles. Aggregates
 *  by class + location; surfaces top longest-idle. Idle is a non-dollar
 *  opportunity (no rate multiplication). */
export function buildIdleFleetSnapshot(
  src: ExecutiveFleetSources,
  range: DateRange,
  idleThresholdDays: number,
  now: Date = new Date(),
): IdleFleetSnapshot {
  const s = src.store;
  const ts = twinSources(src);
  const idleVehicles = getAvailableIdleVehicles(ts, range, now);

  const idleCount = idleVehicles.length;
  const totalIdleDays = idleVehicles.reduce((sum, i) => sum + i.idleDays, 0);
  const pastThreshold = idleVehicles.filter(
    (i) => i.idleDays >= idleThresholdDays,
  );
  const idlePastThresholdCount = pastThreshold.length;

  const sorted = [...idleVehicles].sort((a, b) => b.idleDays - a.idleDays);
  const longest = sorted[0] ?? null;

  // Idle by class.
  const byClassMap = new Map<string, IdleByClass>();
  // Idle by location.
  const byLocMap = new Map<string, IdleByLocation>();

  const items: IdleOpportunity[] = [];
  for (const iv of idleVehicles) {
    const v = s.vehicles.find((x) => x.id === iv.vehicleId);
    const cls = v?.vehicle_class_id
      ? s.vehicleClasses.find((c) => c.id === v.vehicle_class_id)
      : null;
    const className = cls?.name ?? "Unclassified";
    const classCur = byClassMap.get(className) ?? {
      class_name: className,
      idle_count: 0,
      total_idle_days: 0,
    };
    classCur.idle_count++;
    classCur.total_idle_days += iv.idleDays;
    byClassMap.set(className, classCur);

    const locName = v?.location ?? "Unassigned";
    const locCur = byLocMap.get(locName) ?? {
      location_name: locName,
      idle_count: 0,
      total_idle_days: 0,
    };
    locCur.idle_count++;
    locCur.total_idle_days += iv.idleDays;
    byLocMap.set(locName, locCur);

    // Next reservation in days (null = no future reservation).
    const futureRes = getFutureReservationsForVehicle(
      s.reservations,
      iv.vehicleId,
      now,
    );
    const nextRes = futureRes.length > 0 ? futureRes[0] : null;
    let nextReservationInDays: number | null = null;
    if (nextRes?.start_date) {
      const pickup = new Date(nextRes.start_date + "T00:00:00").getTime();
      const diff = Math.round((pickup - now.getTime()) / DAY);
      nextReservationInDays = isNaN(diff) ? null : Math.max(0, diff);
    }

    items.push({
      vehicle_id: iv.vehicleId,
      label: iv.label,
      idle_days: iv.idleDays,
      daily_rate: iv.dailyRate,
      next_reservation_in_days: nextReservationInDays,
      location: v?.location ?? null,
    });
  }

  const noFuture = items.filter(
    (i) => i.next_reservation_in_days === null,
  ).length;

  // Top 5 longest idle (bounded for large fleets).
  const topIdle = sorted.slice(0, 5).map((iv) => {
    const v = s.vehicles.find((x) => x.id === iv.vehicleId);
    const futureRes = getFutureReservationsForVehicle(
      s.reservations,
      iv.vehicleId,
      now,
    );
    const nextRes = futureRes.length > 0 ? futureRes[0] : null;
    let nextReservationInDays: number | null = null;
    if (nextRes?.start_date) {
      const pickup = new Date(nextRes.start_date + "T00:00:00").getTime();
      const diff = Math.round((pickup - now.getTime()) / DAY);
      nextReservationInDays = isNaN(diff) ? null : Math.max(0, diff);
    }
    return {
      vehicle_id: iv.vehicleId,
      label: iv.label,
      idle_days: iv.idleDays,
      daily_rate: iv.dailyRate,
      next_reservation_in_days: nextReservationInDays,
    };
  });

  return {
    idle_count: idleCount,
    total_idle_days: totalIdleDays,
    idle_past_threshold_count: idlePastThresholdCount,
    longest_idle_vehicle_id: longest?.vehicleId ?? null,
    longest_idle_days: longest?.idleDays ?? 0,
    longest_idle_label: longest?.label ?? null,
    classes_with_idle: [...byClassMap.keys()],
    vehicles_without_future_reservation: noFuture,
    by_class: [...byClassMap.values()],
    by_location: [...byLocMap.values()],
    top_idle: topIdle,
  };
}

/** Convenience: idle opportunities (non-dollar) for the Money Left on Table. */
export function buildIdleOpportunities(
  src: ExecutiveFleetSources,
  range: DateRange,
  now: Date = new Date(),
): IdleOpportunity[] {
  const s = src.store;
  const ts = twinSources(src);
  const idleVehicles = getAvailableIdleVehicles(ts, range, now);
  const out: IdleOpportunity[] = [];
  for (const iv of idleVehicles) {
    const v = s.vehicles.find((x) => x.id === iv.vehicleId);
    const futureRes = getFutureReservationsForVehicle(
      s.reservations,
      iv.vehicleId,
      now,
    );
    const nextRes = futureRes.length > 0 ? futureRes[0] : null;
    let nextReservationInDays: number | null = null;
    if (nextRes?.start_date) {
      const pickup = new Date(nextRes.start_date + "T00:00:00").getTime();
      const diff = Math.round((pickup - now.getTime()) / DAY);
      nextReservationInDays = isNaN(diff) ? null : Math.max(0, diff);
    }
    out.push({
      vehicle_id: iv.vehicleId,
      label: iv.label,
      idle_days: iv.idleDays,
      daily_rate: iv.dailyRate,
      next_reservation_in_days: nextReservationInDays,
      location: v?.location ?? null,
    });
  }
  return out;
}

// Re-export for the operations selectors (blocked intervals).
export { getVehicleBlockedIntervals };
export type { Vehicle };
