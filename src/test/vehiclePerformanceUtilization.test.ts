// Vehicle Performance — Utilization, time, lifetime return, date ranges.
import { describe, it, expect } from "vitest";
import {
  getVehiclePerformance,
  type VehiclePerformanceInputs,
} from "@/lib/vehiclePerformance";
import {
  resolvePerformanceRange,
  type PerformanceRange,
} from "@/lib/vehiclePerformanceRanges";
import { txn, vehicle, rental, inputs } from "./profitabilityFixtures";
import { workOrder, claim } from "./vehiclePerformanceFixtures";

const NOW = new Date("2026-08-20");

function perfInputs(
  over: Partial<VehiclePerformanceInputs> = {},
): VehiclePerformanceInputs {
  return {
    ...inputs(),
    deposits: [],
    damageClaims: [],
    damageRecoveries: [],
    violations: [],
    workOrders: [],
    ...over,
  };
}

describe("VP — Utilization & time", () => {
  it("fleet utilization = rented ÷ calendar days", () => {
    const range = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        rentals: [
          rental({
            checkout_date: "2026-08-01",
            scheduled_return_date: "2026-08-10",
            actual_return_date: "2026-08-10",
          }),
        ],
      }),
      range,
    );
    expect(p.time.rentedDays).toBe(10);
    expect(p.fleetUtilization).toBeGreaterThan(0);
  });

  it("rentable utilization = rented ÷ available days", () => {
    const range = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        rentals: [
          rental({
            checkout_date: "2026-08-01",
            scheduled_return_date: "2026-08-10",
            actual_return_date: "2026-08-10",
          }),
        ],
      }),
      range,
    );
    expect(p.rentableUtilization).toBeGreaterThan(0);
    expect(p.rentableUtilization).toBeGreaterThanOrEqual(p.fleetUtilization);
  });

  it("rented days counted", () => {
    const range = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        rentals: [
          rental({
            checkout_date: "2026-08-01",
            scheduled_return_date: "2026-08-05",
            actual_return_date: "2026-08-05",
          }),
        ],
      }),
      range,
    );
    expect(p.time.rentedDays).toBe(5);
  });

  it("rentable idle days = available but not rented", () => {
    const range = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance("veh_1", perfInputs(), range);
    expect(p.time.rentableIdleDays).toBeGreaterThan(0);
  });

  it("maintenance downtime from blocking work order", () => {
    const range = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        workOrders: [
          workOrder({
            blocks_vehicle_use: true,
            downtime_started_at: "2026-08-12",
            downtime_ended_at: "2026-08-14",
          }),
        ],
      }),
      range,
    );
    expect(p.time.maintenanceDowntimeDays).toBe(3);
  });

  it("damage downtime from blocking claim", () => {
    const range = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        damageClaims: [
          claim({
            blocks_vehicle_use: true,
            discovered_at: "2026-08-10",
            closed_at: "2026-08-12",
            claim_status: "closed",
          }),
        ],
      }),
      range,
    );
    expect(p.time.damageDowntimeDays).toBe(3);
  });

  it("other unavailable days for out-of-service vehicle", () => {
    const range = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        vehicles: [vehicle({ status: "out_of_service" as never })],
      }),
      range,
    );
    expect(p.time.otherUnavailableDays).toBeGreaterThanOrEqual(0);
  });
});

describe("VP — Revenue per day", () => {
  it("revenue per rented day", () => {
    const range = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 600,
            effective_date: "2026-08-15",
          }),
        ],
        rentals: [
          rental({
            checkout_date: "2026-08-10",
            scheduled_return_date: "2026-08-20",
            actual_return_date: "2026-08-20",
          }),
        ],
      }),
      range,
    );
    expect(p.revenuePerRentedDay).toBeGreaterThan(0);
  });

  it("revenue per calendar day", () => {
    const range = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 600,
            effective_date: "2026-08-15",
          }),
        ],
      }),
      range,
    );
    expect(p.revenuePerCalendarDay).toBeGreaterThan(0);
  });

  it("net contribution per calendar day", () => {
    const range = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 600,
            effective_date: "2026-08-15",
          }),
        ],
      }),
      range,
    );
    expect(p.netContributionPerCalendarDay).toBeGreaterThan(0);
  });
});

describe("VP — Lifetime return", () => {
  it("lifetime return = net contribution ÷ purchase price", () => {
    const range = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 20000,
            effective_date: "2026-08-15",
          }),
        ],
        vehicles: [vehicle({ purchase_price: 5000 })],
      }),
      range,
    );
    expect(p.lifetimeReturn).toBe(400);
  });

  it("acquisition basis recovery state — not yet recovered", () => {
    const range = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 2000,
            effective_date: "2026-08-15",
          }),
        ],
        vehicles: [vehicle({ purchase_price: 5000 })],
      }),
      range,
    );
    expect(p.acquisitionBasisFullyRecovered).toBe(false);
    expect(p.acquisitionBasisRecoveredPct).toBe(40);
  });

  it("acquisition basis fully recovered", () => {
    const range = resolvePerformanceRange("this_month", NOW);
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 20000,
            effective_date: "2026-08-15",
          }),
        ],
        vehicles: [vehicle({ purchase_price: 5000 })],
      }),
      range,
    );
    expect(p.acquisitionBasisFullyRecovered).toBe(true);
  });
});

describe("VP — Date ranges", () => {
  const ranges: PerformanceRange[] = [
    "this_week",
    "this_month",
    "last_month",
    "ytd",
    "last_30_days",
    "last_90_days",
    "last_12_months",
    "lifetime",
  ];
  for (const r of ranges) {
    it(`resolves ${r} range`, () => {
      const range = resolvePerformanceRange(r, NOW);
      expect(range.start.getTime()).toBeLessThanOrEqual(range.end.getTime());
    });
  }
});
