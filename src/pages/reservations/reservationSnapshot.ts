// Connect Pro Fleet — reservation snapshot + submit helpers (Build #2/#26).
// Extracted from NewReservationDialog to keep it under the per-file line limit.
// buildReservationSnapshot freezes the pricing snapshot at save time so
// historical reservations never change when a Vehicle Class default is edited.

import type { Reservation, ReservationPricingSnapshot } from "@/lib/types";
import type { EligibleVehicle } from "@/lib/reservationPricing";
import type { VehicleClass, DepositPolicy } from "@/lib/types";
import {
  getMinimumRentalDays,
  type RateRecommendation,
} from "@/lib/reservationPricing";
import { resolveVehicleDeposit } from "@/lib/vehicleClass";

export interface SnapshotInput {
  selectedVehicle: EligibleVehicle;
  recommendation: RateRecommendation;
  vehicleClasses: VehicleClass[];
  depositPolicies: DepositPolicy[];
  classId: string;
  durationDays: number;
  customPrice: number | null;
  recommendedTotal: number;
  finalPrice: number;
  overrideReason: string;
  currentStaffId: string | null;
}

export function buildReservationSnapshot(
  input: SnapshotInput,
): ReservationPricingSnapshot | null {
  const {
    selectedVehicle,
    recommendation,
    vehicleClasses,
    classId,
    durationDays,
    customPrice,
    recommendedTotal,
    finalPrice,
    overrideReason,
    currentStaffId,
  } = input;
  const cls = vehicleClasses.find((c) => c.id === classId);
  const overridden = customPrice != null && customPrice !== recommendedTotal;
  return {
    vehicle_class_id: classId,
    vehicle_class_name: cls?.name ?? null,
    daily_rate: selectedVehicle.pricing.daily_rate,
    weekly_rate: selectedVehicle.pricing.weekly_rate,
    minimum_rental_duration: getMinimumRentalDays(
      selectedVehicle,
      vehicleClasses,
    ),
    duration_days: durationDays,
    recommended_total: recommendedTotal,
    recommended_rate_type: recommendation.recommended_rate_type,
    components: recommendation.components,
    override_amount: overridden ? finalPrice - recommendedTotal : null,
    override_reason: overridden ? overrideReason.trim() : null,
    override_by: overridden ? currentStaffId : null,
    override_at: overridden ? new Date().toISOString() : null,
  };
}

export function resolveDeposit(
  selectedVehicle: EligibleVehicle,
  vehicleClasses: VehicleClass[],
  depositPolicies: DepositPolicy[],
) {
  return resolveVehicleDeposit(
    selectedVehicle,
    vehicleClasses,
    depositPolicies,
  );
}

export function buildReservation(input: {
  form: {
    renter_name: string;
    renter_email: string;
    renter_phone: string;
    start_date: string;
    end_date: string;
    vehicle_id: string;
  };
  finalPrice: number;
  depositAmount: number;
  snapshot: ReservationPricingSnapshot | null;
  currentStaffId: string | null;
  creatorLabel: string;
}): Reservation {
  const {
    form,
    finalPrice,
    depositAmount,
    snapshot,
    currentStaffId,
    creatorLabel,
  } = input;
  return {
    id: `res_${Date.now().toString(36)}`,
    vehicle_id: form.vehicle_id,
    renter_name: form.renter_name,
    renter_email: form.renter_email,
    renter_phone: form.renter_phone,
    start_date: form.start_date,
    end_date: form.end_date,
    status: "pending_verification",
    source: "manual",
    ghl_opportunity_id: null,
    total_price: finalPrice,
    deposit_amount: depositAmount,
    deposit_status: "held",
    amount_paid: 0,
    pricing_snapshot: snapshot,
    created_at: new Date().toISOString(),
    created_by: currentStaffId,
    created_by_name: creatorLabel,
    tenant_id: "tnt_connectpro",
  };
}
