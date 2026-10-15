// Connect Pro Fleet — Reservation pricing & availability helpers (Build #2).
//
// Centralized domain logic for reservation creation:
//   - rental duration (billable days, careful with pickup/return times)
//   - effective vehicle pricing (reuses Build #1 resolveVehiclePricing)
//   - smart rate recommendation (daily / weekly / mixed, cheapest legit combo)
//   - minimum rental duration validation (vehicle override → class → default)
//   - eligible vehicle filtering with date-range conflict detection
//
// Pure selectors over store data — no duplicate state. Designed to become
// Supabase queries with RLS later. The billing engine (Build #3+) will reuse
// getRateRecommendation so reservation pricing and billing stay consistent.

import type {
  Vehicle,
  VehicleClass,
  RentalAgreement,
  Reservation,
  MaintenanceRecord,
} from "./types";
import { resolveVehiclePricing, type ResolvedPricing } from "./vehicleClass";

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

/**
 * Billable rental duration in days. Uses date-only math so a pickup at 9:00 AM
 * and return at 9:00 AM three days later is 3 days, not 4.
 *
 * Times are honored only to decide whether a partial final day counts: if the
 * return time is after the pickup time on the final day, we round up to the
 * next whole day (a rental that runs past the pickup hour is a billable day).
 *
 *   pickup 2026-08-28 09:00 → return 2026-08-31 09:00  = 3 days
 *   pickup 2026-08-28 09:00 → return 2026-08-31 12:00  = 4 days
 */
export function getRentalDuration(
  startISO: string,
  endISO: string,
  startTime = "10:00",
  endTime = "10:00",
): number {
  if (!startISO || !endISO) return 0;
  const start = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  const wholeDays = Math.round(ms / 86_400_000);
  // If the return time is later in the day than the pickup time, the final
  // partial day is billable.
  const spillsOver = endTime > startTime;
  return wholeDays + (spillsOver ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Effective pricing (thin wrapper over Build #1 selector)
// ---------------------------------------------------------------------------

export function getEffectiveVehiclePricing(
  vehicle: Vehicle,
  classes: VehicleClass[],
): ResolvedPricing {
  return resolveVehiclePricing(vehicle, classes);
}

// ---------------------------------------------------------------------------
// Minimum rental duration
// ---------------------------------------------------------------------------

/**
 * Resolve the effective minimum rental duration (in days).
 * Hierarchy: vehicle override → vehicle class → 1 (sensible default).
 */
export function getMinimumRentalDays(
  vehicle: Vehicle,
  classes: VehicleClass[],
): number {
  if (vehicle.min_rental_days_override != null)
    return vehicle.min_rental_days_override;
  const cls = classes.find((c) => c.id === vehicle.vehicle_class_id);
  return cls?.minimum_rental_duration ?? 1;
}

export interface MinDurationCheck {
  ok: boolean;
  minimum: number;
  requested: number;
  message: string;
}

export function validateMinimumRental(
  vehicle: Vehicle,
  classes: VehicleClass[],
  durationDays: number,
): MinDurationCheck {
  const minimum = getMinimumRentalDays(vehicle, classes);
  if (durationDays >= minimum) {
    return { ok: true, minimum, requested: durationDays, message: "" };
  }
  return {
    ok: false,
    minimum,
    requested: durationDays,
    message: `Minimum rental duration for this vehicle is ${minimum} day${minimum === 1 ? "" : "s"}.`,
  };
}

// ---------------------------------------------------------------------------
// Rate recommendation
// ---------------------------------------------------------------------------

export type RateComponentType = "weekly" | "daily";

export interface RateComponent {
  type: RateComponentType;
  quantity: number;
  rate: number;
  total: number;
}

export interface RateRecommendation {
  recommended_total: number;
  recommended_rate_type: "daily" | "weekly" | "mixed" | "none";
  components: RateComponent[];
  explanation: string;
  /** True when no usable rate is configured (blank/null treated as not offered). */
  hasPricing: boolean;
}

/**
 * Recommend the cheapest legitimate standard price for a rental duration using
 * the vehicle's effective daily and weekly rates.
 *
 * Rules:
 *  - A blank/zero rate means that rate type is NOT offered (we treat 0 as
 *    "not configured" per the build spec — $0 is not a valid rental price).
 *  - For durations >= 7 days, consider weekly + daily combinations and pick the
 *    cheapest legitimate combination that covers the period.
 *  - For durations < 7 days, compare the daily total against a single weekly
 *    charge (operators often make the weekly cheaper than 6× daily) and
 *    recommend the lower of the two when the weekly is offered.
 *  - Daily-only and weekly-only vehicles are handled gracefully.
 */
export function getRateRecommendation(
  pricing: ResolvedPricing,
  durationDays: number,
): RateRecommendation {
  const daily = pricing.daily_rate > 0 ? pricing.daily_rate : 0;
  const weekly = pricing.weekly_rate > 0 ? pricing.weekly_rate : 0;
  const hasDaily = daily > 0;
  const hasWeekly = weekly > 0;

  if (durationDays <= 0 || (!hasDaily && !hasWeekly)) {
    return {
      recommended_total: 0,
      recommended_rate_type: "none",
      components: [],
      explanation:
        hasWeekly || hasDaily
          ? "Enter pickup and return dates to calculate a rate."
          : "No weekly or daily rate is configured for this vehicle.",
      hasPricing: hasDaily || hasWeekly,
    };
  }

  // Build candidate combinations and pick the cheapest legitimate one.
  const candidates: {
    components: RateComponent[];
    total: number;
    type: RateRecommendation["recommended_rate_type"];
  }[] = [];

  if (hasWeekly) {
    const weeks = Math.floor(durationDays / 7);
    const remDays = durationDays - weeks * 7;

    // Weekly-only path: if no daily rate, charge full weeks and treat any
    // remaining days as a minimum weekly charge (operator chose not to offer
    // daily pricing — do not silently divide the weekly rate).
    if (!hasDaily) {
      const chargedWeeks = weeks + (remDays > 0 ? 1 : 0);
      const components: RateComponent[] = [
        {
          type: "weekly",
          quantity: chargedWeeks,
          rate: weekly,
          total: chargedWeeks * weekly,
        },
      ];
      candidates.push({
        components,
        total: chargedWeeks * weekly,
        type: "weekly",
      });
    } else {
      // Mixed weekly + daily for the remainder.
      if (weeks > 0 || remDays > 0) {
        const components: RateComponent[] = [];
        if (weeks > 0)
          components.push({
            type: "weekly",
            quantity: weeks,
            rate: weekly,
            total: weeks * weekly,
          });
        if (remDays > 0)
          components.push({
            type: "daily",
            quantity: remDays,
            rate: daily,
            total: remDays * daily,
          });
        const total = components.reduce((s, c) => s + c.total, 0);
        candidates.push({
          components,
          total,
          type:
            weeks > 0 && remDays > 0 ? "mixed" : weeks > 0 ? "weekly" : "daily",
        });
      }

      // Also consider pure-daily for comparison (cheapest legit combo).
      const dailyTotal = durationDays * daily;
      candidates.push({
        components: [
          {
            type: "daily",
            quantity: durationDays,
            rate: daily,
            total: dailyTotal,
          },
        ],
        total: dailyTotal,
        type: "daily",
      });

      // For sub-week rentals, also consider a single weekly charge if cheaper.
      if (durationDays < 7) {
        candidates.push({
          components: [
            { type: "weekly", quantity: 1, rate: weekly, total: weekly },
          ],
          total: weekly,
          type: "weekly",
        });
      }
    }
  } else if (hasDaily) {
    // Daily-only vehicle.
    const dailyTotal = durationDays * daily;
    candidates.push({
      components: [
        {
          type: "daily",
          quantity: durationDays,
          rate: daily,
          total: dailyTotal,
        },
      ],
      total: dailyTotal,
      type: "daily",
    });
  }

  if (candidates.length === 0) {
    return {
      recommended_total: 0,
      recommended_rate_type: "none",
      components: [],
      explanation: "No weekly or daily rate is configured for this vehicle.",
      hasPricing: false,
    };
  }

  const best = candidates.reduce((a, b) => (b.total < a.total ? b : a));
  const explanation = best.components
    .map(
      (c) =>
        `${c.quantity} ${c.type === "weekly" ? "week" : "day"}${c.quantity === 1 ? "" : c.type === "weekly" ? "s" : "s"} @ ${formatRate(c.rate)}`,
    )
    .join(" + ");

  return {
    recommended_total: best.total,
    recommended_rate_type: best.type,
    components: best.components,
    explanation,
    hasPricing: true,
  };
}

function formatRate(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

// ---------------------------------------------------------------------------
// Availability / eligibility
// ---------------------------------------------------------------------------

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

export interface VehicleConflict {
  vehicleId: string;
  reason: string;
}

/**
 * Determine whether a vehicle is available for a given date range, accounting
 * for operational status, existing reservations, active rentals, and
 * maintenance/unavailable periods. Reuses the same overlap semantics as the
 * Planner so reservation creation and the planner never disagree.
 *
 * Pass an optional `excludeReservationId` when editing an existing reservation
 * so the vehicle's own booking doesn't conflict with itself.
 */
export function isVehicleAvailable(
  vehicle: Vehicle,
  start: string,
  end: string,
  ctx: {
    reservations: Reservation[];
    rentals: RentalAgreement[];
    maintenance: MaintenanceRecord[];
    excludeReservationId?: string;
    /** Build #26 — compliance blocking reasons (when present, blocks rental). */
    complianceBlock?: { blocked: boolean; reasons: string[] };
  },
): { ok: boolean; reason: string } {
  if (!start || !end || start > end)
    return { ok: false, reason: "Invalid date range." };

  if (vehicle.status === "out_of_service")
    return { ok: false, reason: "Out of service" };
  if (vehicle.status === "maintenance")
    return { ok: false, reason: "In maintenance" };
  if (vehicle.status === "rented")
    return { ok: false, reason: "Already rented" };

  // Build #26 — compliance blocks (expired reg, missing insurance, failed
  // inspection) take precedence AFTER status checks so the reason is
  // "Compliance — …" not a generic status. Compliance blocks coexist with
  // maintenance/damage blocks; they never overwrite one another.
  if (ctx.complianceBlock?.blocked)
    return {
      ok: false,
      reason: `Compliance — ${ctx.complianceBlock.reasons.join("; ")}`,
    };

  // Reservations (exclude cancelled/blocked/completed/active and the one being edited).
  for (const r of ctx.reservations) {
    if (r.id === ctx.excludeReservationId) continue;
    if (
      ["cancelled", "blocked_license", "completed", "active"].includes(r.status)
    )
      continue;
    if (r.converted_to_rental_id) continue;
    if (r.vehicle_id !== vehicle.id) continue;
    if (overlaps(r.start_date, r.end_date, start, end))
      return { ok: false, reason: "Reserved for these dates" };
  }

  // Active rentals.
  for (const rt of ctx.rentals) {
    if (rt.status === "cancelled" || rt.status === "completed") continue;
    if (rt.vehicle_id !== vehicle.id) continue;
    const rStart = rt.checkout_date ?? rt.scheduled_return_date;
    const rEnd = rt.actual_return_date ?? rt.scheduled_return_date;
    if (overlaps(rStart, rEnd, start, end))
      return { ok: false, reason: "Already rented" };
  }

  // Maintenance periods (open/uncompleted).
  for (const m of ctx.maintenance) {
    if (m.completed_date) continue;
    if (m.vehicle_id !== vehicle.id) continue;
    // Treat maintenance as a 3-day block from the scheduled date (mirrors Planner).
    const mEnd = addDays(m.scheduled_date, 3);
    if (overlaps(m.scheduled_date, mEnd, start, end))
      return { ok: false, reason: "Scheduled maintenance" };
  }

  return { ok: true, reason: "" };
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface EligibleVehicle extends Vehicle {
  pricing: ResolvedPricing;
  available: boolean;
  conflictReason: string;
}

/**
 * Return vehicles for a class/location, each annotated with effective pricing
 * and availability for the requested date range. Unavailable vehicles are
 * included (with their reason) so the UI can show a secondary informational
 * list, but the form only permits selecting available ones.
 *
 * Extends Build #1's eligibleVehicles (which is a lightweight status-only
 * filter) with full date-range conflict detection.
 */
export function getEligibleVehicles(
  vehicles: Vehicle[],
  classes: VehicleClass[],
  opts: {
    classId?: string | null;
    location?: string | null;
    start?: string;
    end?: string;
    reservations: Reservation[];
    rentals: RentalAgreement[];
    maintenance: MaintenanceRecord[];
    excludeReservationId?: string;
    /** Build #26 — per-vehicle compliance blocks keyed by vehicle id. */
    complianceBlocks?: Record<string, { blocked: boolean; reasons: string[] }>;
  },
): EligibleVehicle[] {
  return vehicles
    .filter((v) => {
      if (opts.classId && v.vehicle_class_id !== opts.classId) return false;
      if (opts.location && v.location !== opts.location) return false;
      return true;
    })
    .map((v) => {
      const pricing = getEffectiveVehiclePricing(v, classes);
      const availability =
        opts.start && opts.end
          ? isVehicleAvailable(v, opts.start, opts.end, {
              reservations: opts.reservations,
              rentals: opts.rentals,
              maintenance: opts.maintenance,
              excludeReservationId: opts.excludeReservationId,
              complianceBlock: opts.complianceBlocks?.[v.id],
            })
          : {
              ok: v.status === "available",
              reason: v.status === "available" ? "" : "Unavailable",
            };
      return {
        ...v,
        pricing,
        available: availability.ok,
        conflictReason: availability.reason,
      };
    });
}
