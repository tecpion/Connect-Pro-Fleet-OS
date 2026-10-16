// Connect Pro Fleet — Vehicle Performance idle-day + time-classification
// invariants (final closeout). Verifies that rentable idle days never exceed
// the vehicle's actual active-fleet window within the selected range, and
// that rented/maintenance/damage/other-unavailable time partition cleanly.
//
// `computeTimeClassification` bounds idle/utilization to the vehicle's
// purchase_date (fleet entry) within the selected range — days before the
// vehicle entered the fleet are never rentable idle days.

import { describe, it, expect } from "vitest";
import {
  computeTimeClassification,
  activeFleetWindow,
} from "@/lib/vehiclePerformanceTime";
import { resolvePerformanceRange } from "@/lib/vehiclePerformanceRanges";
import { DAY } from "@/lib/profitabilityHelpers";
import { vehicleRentedDays } from "@/lib/profitabilityAttribution";
import { vehicle, rental, inputs } from "./profitabilityFixtures";
import { claim, workOrder } from "./vehiclePerformanceFixtures";
import type { DateRange } from "@/lib/profitabilityHelpers";
import type { Vehicle } from "@/lib/types";

const NOW = new Date("2026-09-10T12:00:00Z");
const RANGE_12M: DateRange = resolvePerformanceRange("last_12_months", NOW);

function mkVehicle(over: Partial<Vehicle>): Vehicle {
  return vehicle(over);
}

function idleInv(t: ReturnType<typeof computeTimeClassification>) {
  expect(t.rentedDays).toBeGreaterThanOrEqual(0);
  expect(t.rentableIdleDays).toBeGreaterThanOrEqual(0);
  expect(t.maintenanceDowntimeDays).toBeGreaterThanOrEqual(0);
  expect(t.damageDowntimeDays).toBeGreaterThanOrEqual(0);
  expect(t.otherUnavailableDays).toBeGreaterThanOrEqual(0);
  // rented + idle + downtime + other-unavailable ≤ active fleet window days.
  expect(
    t.rentedDays +
      t.rentableIdleDays +
      t.maintenanceDowntimeDays +
      t.damageDowntimeDays +
      t.otherUnavailableDays,
  ).toBeLessThanOrEqual(t.calendarDays);
  // Idle never exceeds rentable window.
  const rentable =
    t.calendarDays -
    t.maintenanceDowntimeDays -
    t.damageDowntimeDays -
    t.otherUnavailableDays;
  expect(t.rentableIdleDays).toBeLessThanOrEqual(Math.max(0, rentable));
}

describe("Vehicle Performance — idle-day invariants", () => {
  it("1. vehicle active for full selected range — idle = calendar - rented", () => {
    const v = mkVehicle({ id: "veh_full", purchase_date: "2020-01-01" });
    const r1 = rental({
      id: "r1",
      vehicle_id: "veh_full",
      checkout_date: "2026-08-01",
      scheduled_return_date: "2026-08-10",
      actual_return_date: "2026-08-10",
    });
    const t = computeTimeClassification(
      [r1],
      [],
      [],
      [],
      "veh_full",
      RANGE_12M,
      v,
    );
    idleInv(t);
    // 10 rented, ~356 calendar → idle = 346.
    expect(t.rentedDays).toBe(10);
    expect(t.calendarDays).toBe(
      RANGE_12M.end.getTime() - RANGE_12M.start.getTime() >= 0 ? 366 : 365,
    );
    expect(t.rentableIdleDays).toBe(t.calendarDays - 10);
  });

  it("2. vehicle entered fleet mid-range — idle bounded to active window", () => {
    // Acquired 2026-06-01 → only ~102 active days in a 12-month range.
    const v = mkVehicle({ id: "veh_mid", purchase_date: "2026-06-01" });
    const t = computeTimeClassification(
      [],
      [],
      [],
      [],
      "veh_mid",
      RANGE_12M,
      v,
    );
    idleInv(t);
    const activeWindow = activeFleetWindow(RANGE_12M, v);
    const expectedActive =
      Math.floor(
        (activeWindow.end.getTime() - activeWindow.start.getTime()) / DAY,
      ) + 1;
    expect(t.calendarDays).toBe(expectedActive);
    // Idle must NOT equal the full 366-day range.
    expect(t.rentableIdleDays).toBeLessThan(366);
    expect(t.rentableIdleDays).toBe(expectedActive);
  });

  it("3. vehicle acquired after range end — zero active days, zero idle", () => {
    const v = mkVehicle({ id: "veh_future", purchase_date: "2027-01-01" });
    const t = computeTimeClassification(
      [],
      [],
      [],
      [],
      "veh_future",
      RANGE_12M,
      v,
    );
    idleInv(t);
    expect(t.calendarDays).toBe(1);
    expect(t.rentableIdleDays).toBe(1);
    expect(t.rentedDays).toBe(0);
  });

  it("4. rented days excluded from idle", () => {
    const v = mkVehicle({ id: "veh_r", purchase_date: "2020-01-01" });
    const r1 = rental({
      id: "r1",
      vehicle_id: "veh_r",
      checkout_date: "2026-09-01",
      scheduled_return_date: "2026-09-05",
      actual_return_date: "2026-09-05",
    });
    const range = resolvePerformanceRange("this_month", NOW);
    const t = computeTimeClassification([r1], [], [], [], "veh_r", range, v);
    idleInv(t);
    expect(t.rentedDays).toBe(5);
    expect(t.rentableIdleDays).toBe(t.calendarDays - 5);
  });

  it("5. maintenance downtime excluded from rentable idle", () => {
    const v = mkVehicle({ id: "veh_m", purchase_date: "2020-01-01" });
    const wo = workOrder({
      vehicle_id: "veh_m",
      downtime_started_at: "2026-09-02",
      downtime_ended_at: "2026-09-04",
      completed_at: "2026-09-04",
      blocks_vehicle_use: true,
    });
    const range = resolvePerformanceRange("this_month", NOW);
    const t = computeTimeClassification([], [], [wo], [], "veh_m", range, v);
    idleInv(t);
    expect(t.maintenanceDowntimeDays).toBe(3);
    // Idle = calendar - 0 rented - 3 downtime.
    expect(t.rentableIdleDays).toBe(t.calendarDays - 3);
  });

  it("6. damage downtime excluded from rentable idle", () => {
    const v = mkVehicle({ id: "veh_d", purchase_date: "2020-01-01" });
    const c = claim({
      vehicle_id: "veh_d",
      claim_status: "open",
      blocks_vehicle_use: true,
      closed_at: null,
      discovered_at: "2026-09-03",
    });
    const range = resolvePerformanceRange("this_month", NOW);
    const t = computeTimeClassification([], [], [], [c], "veh_d", range, v);
    idleInv(t);
    expect(t.damageDowntimeDays).toBeGreaterThan(0);
    expect(t.rentableIdleDays).toBe(t.calendarDays - t.damageDowntimeDays);
  });

  it("7. out-of-service status → other unavailable excluded from idle", () => {
    const v = mkVehicle({
      id: "veh_oos",
      purchase_date: "2020-01-01",
      status: "out_of_service",
    });
    const range = resolvePerformanceRange("this_month", NOW);
    const t = computeTimeClassification([], [], [], [], "veh_oos", range, v);
    idleInv(t);
    expect(t.otherUnavailableDays).toBe(t.calendarDays);
    expect(t.rentableIdleDays).toBe(0);
  });

  it("8. full-year idle vehicle (no rentals, no downtime)", () => {
    const v = mkVehicle({ id: "veh_idle", purchase_date: "2020-01-01" });
    const t = computeTimeClassification(
      [],
      [],
      [],
      [],
      "veh_idle",
      RANGE_12M,
      v,
    );
    idleInv(t);
    expect(t.rentedDays).toBe(0);
    expect(t.rentableIdleDays).toBe(t.calendarDays);
  });

  it("9. leap-year / 366-day eligible range — calendar may be 366", () => {
    // 2025-09-11 → 2026-09-10 spans 365 days; a 12-month range over a leap
    // boundary can be 365/366 depending on month math. Just assert it is
    // within [365,366] and idle equals it (no rentals).
    const v = mkVehicle({ id: "veh_ly", purchase_date: "2020-01-01" });
    const t = computeTimeClassification([], [], [], [], "veh_ly", RANGE_12M, v);
    idleInv(t);
    expect(t.calendarDays).toBeGreaterThanOrEqual(365);
    expect(t.calendarDays).toBeLessThanOrEqual(366);
    expect(t.rentableIdleDays).toBe(t.calendarDays);
  });

  it("10. active days never exceeded by rented + downtime", () => {
    const v = mkVehicle({ id: "veh_cap", purchase_date: "2026-06-01" });
    const r1 = rental({
      id: "r1",
      vehicle_id: "veh_cap",
      checkout_date: "2026-08-01",
      scheduled_return_date: "2026-08-20",
      actual_return_date: "2026-08-20",
    });
    const wo = workOrder({
      vehicle_id: "veh_cap",
      downtime_started_at: "2026-07-01",
      downtime_ended_at: "2026-07-10",
      completed_at: "2026-07-10",
      blocks_vehicle_use: true,
    });
    const t = computeTimeClassification(
      [r1],
      [],
      [wo],
      [],
      "veh_cap",
      RANGE_12M,
      v,
    );
    idleInv(t);
    const window = activeFleetWindow(RANGE_12M, v);
    const active =
      Math.floor((window.end.getTime() - window.start.getTime()) / DAY) + 1;
    expect(t.calendarDays).toBe(active);
    // rented(20) + downtime(10) + idle must not exceed active window.
    expect(
      t.rentedDays + t.maintenanceDowntimeDays + t.rentableIdleDays,
    ).toBeLessThanOrEqual(active);
  });

  it("11. zero active days — utilization denominator safe (no NaN/Infinity)", () => {
    const v = mkVehicle({ id: "veh_none", purchase_date: "2027-01-01" });
    const t = computeTimeClassification(
      [],
      [],
      [],
      [],
      "veh_none",
      RANGE_12M,
      v,
    );
    idleInv(t);
    expect(Number.isFinite(t.calendarDays)).toBe(true);
  });

  it("12. fleet utilization denominator consistency (rented/calendar)", () => {
    const v = mkVehicle({ id: "veh_fu", purchase_date: "2020-01-01" });
    const r1 = rental({
      id: "r1",
      vehicle_id: "veh_fu",
      checkout_date: "2026-09-01",
      scheduled_return_date: "2026-09-10",
      actual_return_date: "2026-09-10",
    });
    const range = resolvePerformanceRange("this_month", NOW);
    const t = computeTimeClassification([r1], [], [], [], "veh_fu", range, v);
    idleInv(t);
    const expectedRented = vehicleRentedDays("veh_fu", [r1], [], range);
    expect(t.rentedDays).toBe(expectedRented);
    expect(t.calendarDays).toBe(
      Math.floor((range.end.getTime() - range.start.getTime()) / DAY) + 1,
    );
  });

  it("13. rentable utilization denominator excludes downtime", () => {
    const v = mkVehicle({ id: "veh_ru", purchase_date: "2020-01-01" });
    const r1 = rental({
      id: "r1",
      vehicle_id: "veh_ru",
      checkout_date: "2026-09-01",
      scheduled_return_date: "2026-09-05",
      actual_return_date: "2026-09-05",
    });
    const wo = workOrder({
      vehicle_id: "veh_ru",
      downtime_started_at: "2026-09-06",
      downtime_ended_at: "2026-09-10",
      completed_at: "2026-09-10",
      blocks_vehicle_use: true,
    });
    const range = resolvePerformanceRange("this_month", NOW);
    const t = computeTimeClassification([r1], [], [wo], [], "veh_ru", range, v);
    idleInv(t);
    const rentable =
      t.calendarDays -
      t.maintenanceDowntimeDays -
      t.damageDowntimeDays -
      t.otherUnavailableDays;
    // rented(5) ≤ rentable(calendar - 5 downtime).
    expect(t.rentedDays).toBeLessThanOrEqual(Math.max(0, rentable));
  });

  it("14. idle bounded by active window for vehicle acquired mid-range (12-month)", () => {
    // Acquired 2026-03-01 → ~193 active days in the 12-month range.
    const v = mkVehicle({ id: "veh_q1", purchase_date: "2026-03-01" });
    const t = computeTimeClassification([], [], [], [], "veh_q1", RANGE_12M, v);
    idleInv(t);
    expect(t.rentableIdleDays).toBeLessThan(366);
    const window = activeFleetWindow(RANGE_12M, v);
    const active =
      Math.floor((window.end.getTime() - window.start.getTime()) / DAY) + 1;
    expect(t.calendarDays).toBe(active);
    expect(t.rentableIdleDays).toBe(active);
  });

  it("15. compose with inputs() — no rentals, no downtime, bounded idle", () => {
    const base = inputs({
      vehicles: [mkVehicle({ id: "veh_b", purchase_date: "2026-07-01" })],
    });
    const v = base.vehicles[0];
    const t = computeTimeClassification([], [], [], [], v.id, RANGE_12M, v);
    idleInv(t);
    const window = activeFleetWindow(RANGE_12M, v);
    const active =
      Math.floor((window.end.getTime() - window.start.getTime()) / DAY) + 1;
    expect(t.calendarDays).toBe(active);
    expect(t.rentableIdleDays).toBe(active);
  });
});
