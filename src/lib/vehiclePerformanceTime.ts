// Connect Pro Fleet — Vehicle Performance time classification.
//
// Breaks vehicle time into: Rented Days, Rentable-but-Idle Days, Maintenance
// Downtime, Damage Downtime, Other Unavailable Days. "Idle" is NEVER used for
// unavailable days — only for rentable-but-not-rented days. Downtime derives
// from actual out-of-service / returned-to-service events (blocking work
// orders + blocking/closed damage claims). Pure function, no React.

import type { Vehicle, RentalAgreement } from "./types";
import type { RentalVehicleExchange } from "./store/storeContext";
import type { DamageClaim } from "./damageClaimTypes";
import type { MaintenanceWorkOrder } from "./maintenanceTypes";
import type { DateRange } from "./profitabilityHelpers";
import { DAY, round2, startOfDay } from "./profitabilityHelpers";
import { vehicleRentedDays } from "./profitabilityAttribution";
import { isClaimBlocking } from "./damageClaimSelectors";

export interface TimeClassification {
  rentedDays: number;
  rentableIdleDays: number;
  maintenanceDowntimeDays: number;
  damageDowntimeDays: number;
  otherUnavailableDays: number;
  calendarDays: number;
}

function daysInOverlap(
  startIso: string,
  endIso: string,
  range: DateRange,
): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const s = start < range.start ? range.start : start;
  const e = end > range.end ? range.end : end;
  if (e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / DAY) + 1;
}

/** Effective active-fleet window for a vehicle within the selected range:
 *  bounded by the vehicle's purchase_date (fleet entry). A vehicle acquired
 *  mid-range only counts days from acquisition — not the full selected range —
 *  so idle/utilization stay within its actual active period. Days before the
 *  vehicle entered the fleet are never "rentable idle" days. */
export function activeFleetWindow(
  range: DateRange,
  vehicle: Vehicle | undefined,
): DateRange {
  if (!vehicle?.purchase_date) return range;
  const acquired = startOfDay(new Date(vehicle.purchase_date + "T00:00:00"));
  if (acquired > range.end) {
    // Acquired after the range end → no active days in this range.
    return { start: range.end, end: range.end };
  }
  return {
    start: acquired < range.start ? range.start : acquired,
    end: range.end,
  };
}

export function computeTimeClassification(
  rentals: RentalAgreement[],
  exchanges: RentalVehicleExchange[],
  workOrders: MaintenanceWorkOrder[],
  damageClaims: DamageClaim[],
  vehicleId: string,
  range: DateRange,
  vehicle: Vehicle | undefined,
): TimeClassification {
  // Bound idle/utilization to the vehicle's actual active-fleet window within
  // the selected range — days before fleet entry are never rentable idle days.
  const activeWindow = activeFleetWindow(range, vehicle);
  const rentedDays = vehicleRentedDays(
    vehicleId,
    rentals,
    exchanges,
    activeWindow,
  );
  const calendarDays =
    Math.floor(
      (activeWindow.end.getTime() - activeWindow.start.getTime()) / DAY,
    ) + 1;

  let maintenanceDowntimeDays = 0;
  for (const wo of workOrders) {
    if (wo.vehicle_id !== vehicleId) continue;
    if (!wo.blocks_vehicle_use) continue;
    if (!wo.downtime_started_at) continue;
    const endRaw =
      wo.downtime_ended_at ?? wo.completed_at ?? activeWindow.end.toISOString();
    maintenanceDowntimeDays += daysInOverlap(
      wo.downtime_started_at,
      endRaw,
      activeWindow,
    );
  }

  let damageDowntimeDays = 0;
  for (const c of damageClaims) {
    if (c.vehicle_id !== vehicleId) continue;
    if (!c.blocks_vehicle_use) continue;
    // Active blocking claim: discovered → now (or closed).
    if (isClaimBlocking(c)) {
      const endRaw = c.closed_at ?? activeWindow.end.toISOString();
      damageDowntimeDays += daysInOverlap(
        c.discovered_at,
        endRaw,
        activeWindow,
      );
    } else if (c.claim_status === "closed" && c.closed_at) {
      // Closed blocking claim: discovered → closed.
      damageDowntimeDays += daysInOverlap(
        c.discovered_at,
        c.closed_at,
        activeWindow,
      );
    }
  }

  const otherUnavailableDays =
    vehicle &&
    (vehicle.status === "out_of_service" || vehicle.status === "maintenance")
      ? Math.max(
          0,
          calendarDays -
            rentedDays -
            maintenanceDowntimeDays -
            damageDowntimeDays,
        )
      : 0;

  const downtimeTotal =
    maintenanceDowntimeDays + damageDowntimeDays + otherUnavailableDays;
  const rentableIdleDays = Math.max(
    0,
    calendarDays - rentedDays - downtimeTotal,
  );

  return {
    rentedDays,
    rentableIdleDays,
    maintenanceDowntimeDays,
    damageDowntimeDays,
    otherUnavailableDays,
    calendarDays,
  };
}

/** Days between two ISO date strings (inclusive). */
export function daysBetween(startIso: string, endIso: string): number {
  const s = new Date(startIso + "T00:00:00");
  const e = new Date(endIso + "T00:00:00");
  if (e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / DAY) + 1;
}

export { round2 };
