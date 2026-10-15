// Connect Pro Fleet — Vehicle Class inheritance helpers.
//
// Vehicle Classes are the core pricing entity. Every vehicle belongs to a
// class which seeds its daily/weekly rate, minimum rental duration, and
// default deposit policy. Staff can override any of these per vehicle.
//
// Configuration hierarchy (most specific wins):
//   COMPANY DEFAULT  →  VEHICLE CLASS  →  INDIVIDUAL VEHICLE OVERRIDE
//
// These are pure selectors over store data — no duplicate state. Designed to
// become Supabase queries with RLS later.

import type { DepositPolicy, Vehicle, VehicleClass } from "./types";

// --- Rate suggestions -----------------------------------------------------
// Suggestions are defaults only — never permanently linked formulas. The UI
// lets staff override either amount; once overridden we don't clobber it.
// Uses normal currency precision (no arbitrary $5 rounding).

export function suggestDaily(weekly: number): number {
  return weekly > 0 ? weekly / 7 : 0;
}

export function suggestWeekly(daily: number): number {
  return daily > 0 ? daily * 7 : 0;
}

// --- Pricing resolution ---------------------------------------------------

export type PricingSource = "override" | "class" | "default";

export interface ResolvedPricing {
  daily_rate: number;
  weekly_rate: number;
  minimum_rental_duration: number;
  source: PricingSource;
  className?: string;
  classId?: string;
}

// Resolve the effective pricing for a vehicle. When the vehicle has not been
// overridden, its stored rates are kept in sync with the class (see
// syncVehiclesToClass in the store), so reading vehicle.daily_rate is safe —
// this helper just labels the source for display.
export function resolveVehiclePricing(
  vehicle: Vehicle,
  classes: VehicleClass[],
): ResolvedPricing {
  const cls = classes.find((c) => c.id === vehicle.vehicle_class_id);
  const overridden = !!vehicle.pricing_override;
  return {
    daily_rate: vehicle.daily_rate,
    weekly_rate: vehicle.weekly_rate,
    minimum_rental_duration:
      vehicle.min_rental_days_override ?? cls?.minimum_rental_duration ?? 1,
    source: overridden ? "override" : cls ? "class" : "default",
    className: cls?.name,
    classId: cls?.id,
  };
}

// --- Deposit resolution ---------------------------------------------------

export interface ResolvedDeposit {
  amount: number;
  source: PricingSource;
  policyName?: string;
  className?: string;
}

// Resolve the effective security deposit for a vehicle.
//   vehicle override  →  class default policy  →  company default policy
export function resolveVehicleDeposit(
  vehicle: Vehicle,
  classes: VehicleClass[],
  depositPolicies: DepositPolicy[],
): ResolvedDeposit {
  // 1. Explicit vehicle override.
  if (vehicle.deposit_override) {
    return { amount: vehicle.deposit_amount, source: "override" };
  }

  // 2. Class default deposit policy.
  const cls = classes.find((c) => c.id === vehicle.vehicle_class_id);
  if (cls?.default_deposit_policy_id) {
    const policy = depositPolicies.find(
      (p) => p.id === cls.default_deposit_policy_id && p.active,
    );
    if (policy) {
      return {
        amount: policy.amount,
        source: "class",
        policyName: policy.name,
        className: cls.name,
      };
    }
  }

  // 3. Company default deposit policy.
  const companyDefault = depositPolicies.find((p) => p.is_default && p.active);
  if (companyDefault) {
    return {
      amount: companyDefault.amount,
      source: "default",
      policyName: companyDefault.name,
    };
  }

  // Fallback — no policy configured.
  return { amount: vehicle.deposit_amount, source: "default" };
}

// --- Aggregations ---------------------------------------------------------

// Count of vehicles assigned to each class (active vehicles only by default).
export function vehicleCountByClass(
  classes: VehicleClass[],
  vehicles: Vehicle[],
  activeOnly = false,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of classes) counts[c.id] = 0;
  for (const v of vehicles) {
    if (!v.vehicle_class_id) continue;
    if (activeOnly && !cIsActive(v)) continue;
    counts[v.vehicle_class_id] = (counts[v.vehicle_class_id] ?? 0) + 1;
  }
  return counts;
}

function cIsActive(v: Vehicle): boolean {
  return v.status !== "out_of_service";
}

// Vehicles available for new assignment, optionally scoped by class/location.
// Excludes rented, maintenance, out-of-service, and vehicles with conflicting
// reservations. (Full date-range conflict checking lives in the planner; this
// is the lightweight eligibility filter for the reservation architecture prep.)
export function eligibleVehicles(
  vehicles: Vehicle[],
  opts?: { classId?: string | null; location?: string | null },
): Vehicle[] {
  return vehicles.filter((v) => {
    if (v.status !== "available") return false;
    if (opts?.classId && v.vehicle_class_id !== opts.classId) return false;
    if (opts?.location && v.location !== opts.location) return false;
    return true;
  });
}

// Apply a class's defaults to a vehicle's stored rates (used on assignment and
// when a class is edited — only non-overridden vehicles are re-synced).
export function classDefaultsForVehicle(
  cls: VehicleClass,
  depositPolicies: DepositPolicy[],
): {
  daily_rate: number;
  weekly_rate: number;
  min_rental_days_override: number | null;
  deposit_amount: number;
} {
  let deposit = 0;
  if (cls.default_deposit_policy_id) {
    const p = depositPolicies.find(
      (dp) => dp.id === cls.default_deposit_policy_id && dp.active,
    );
    if (p) deposit = p.amount;
  } else {
    const def = depositPolicies.find((dp) => dp.is_default && dp.active);
    if (def) deposit = def.amount;
  }
  return {
    daily_rate: cls.daily_rate,
    weekly_rate: cls.weekly_rate,
    min_rental_days_override: null, // inherit class minimum
    deposit_amount: deposit,
  };
}
