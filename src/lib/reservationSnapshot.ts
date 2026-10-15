// Connect Pro Fleet — reservation deposit + pricing snapshot helpers (Build #2).
//
// Thin orchestration helpers used by the reservation creation flow:
//   - resolveDeposit: resolve the deposit for a checkout vehicle (wrapper over
//     resolveVehicleDeposit so NewReservationDialog doesn't import vehicleClass
//     internals directly).
//   - buildReservationSnapshot: capture a frozen pricing snapshot at save time
//     so historical reservations never change when a Vehicle Class default is
//     edited later. Reuses resolveVehiclePricing + the rate recommendation so
//     reservation pricing and billing stay consistent.

import type {
  Vehicle,
  VehicleClass,
  ReservationPricingSnapshot,
} from "./types";
import type { DepositPolicy } from "./settingsTypes";
import {
  resolveVehiclePricing,
  resolveVehicleDeposit,
  type ResolvedDeposit,
} from "./vehicleClass";
import type { RateRecommendation } from "./reservationPricing";

/** Resolve the deposit for a reservation/checkout vehicle. */
export function resolveDeposit(
  vehicle: Vehicle,
  classes: VehicleClass[],
  depositPolicies: DepositPolicy[],
): ResolvedDeposit {
  return resolveVehicleDeposit(vehicle, classes, depositPolicies);
}

export interface ReservationSnapshotInput {
  selectedVehicle: Vehicle;
  recommendation: RateRecommendation;
  vehicleClasses: VehicleClass[];
  classId: string;
  durationDays: number;
  customPrice: number | null;
  recommendedTotal: number;
  finalPrice: number;
  overrideReason: string;
  currentStaffId: string | null;
}

/** Capture a frozen pricing snapshot at reservation save time. */
export function buildReservationSnapshot(
  input: ReservationSnapshotInput,
): ReservationPricingSnapshot {
  const cls = input.vehicleClasses.find((c) => c.id === input.classId);
  const pricing = resolveVehiclePricing(
    input.selectedVehicle,
    input.vehicleClasses,
  );
  const overrideActive =
    input.customPrice != null && input.customPrice !== input.recommendedTotal;
  return {
    vehicle_class_id: cls?.id ?? pricing.classId ?? null,
    vehicle_class_name: cls?.name ?? pricing.className ?? null,
    daily_rate: pricing.daily_rate,
    weekly_rate: pricing.weekly_rate,
    minimum_rental_duration: pricing.minimum_rental_duration,
    duration_days: input.durationDays,
    recommended_total: input.recommendedTotal,
    recommended_rate_type: input.recommendation.recommended_rate_type,
    components: input.recommendation.components,
    override_amount: overrideActive
      ? input.finalPrice - input.recommendedTotal
      : null,
    override_reason: overrideActive ? input.overrideReason || null : null,
    override_by: overrideActive ? input.currentStaffId : null,
    override_at: overrideActive ? new Date().toISOString() : null,
  };
}
