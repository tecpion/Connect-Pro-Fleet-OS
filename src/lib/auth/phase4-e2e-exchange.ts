// Phase 4 E2E — vehicle-exchange possession matrix.
//
// Proves the frozen resolveVehiclePossessionAt is EXCHANGE-AWARE against a
// real RentalVehicleExchange record:
//   - Rental A starts on Vehicle 1, exchanges to Vehicle 2 at T2.
//   - Vehicle 1 event during [T1,T2]  → matches A (possession interval).
//   - Vehicle 2 event during [T2,T3]  → matches A (acquired at exchange).
//   - Vehicle 1 event AFTER T2       → does NOT match A (exchanged away) →
//                                       no_match / after_return, never A's
//                                       customer merely because A still has
//                                       the overall rental.
//
// No product/domain logic is changed — test-harness only. Uses the frozen
// RentalVehicleExchange shape from store/rentalVehicleExchange.

import { resolveVehiclePossessionAt } from "@/lib/violationPossession";
import type { RentalAgreement } from "@/lib/types";
import type { RentalVehicleExchange } from "@/lib/store/rentalVehicleExchange";
import type { Phase4Context } from "./phase4-e2e-builders";
import type { Step } from "./phase4-e2e.server";

export interface ExchangeMatrixRow {
  case: string;
  eventId: string;
  vehicleId: string;
  timestamp: string;
  intervalUsed: string;
  matchedRentalId: string | null;
  matchedCustomerId: string | null;
  matchStatus: string;
  method: string;
}

export interface ExchangePossessionResult {
  steps: Step[];
  matrix: ExchangeMatrixRow[];
}

const DAY = 86_400_000;

export async function runExchangePossessionMatrix(
  ctx: Phase4Context,
  veh1Id: string,
  veh2Id: string,
  rentalForExchange: RentalAgreement,
): Promise<ExchangePossessionResult> {
  const steps: Step[] = [];
  const now = ctx.now;

  // Timeline: T1 = now-1d (checkout), T2 = now (exchange), T3 = now+2d (return).
  const t1Iso = new Date(now.getTime() - DAY).toISOString();
  const t2Iso = new Date(now.getTime()).toISOString();
  const t3Iso = new Date(now.getTime() + 2 * DAY).toISOString();

  // The rental currently sits on Vehicle 2 (exchanged INTO it at T2).
  const rentals = [
    { ...rentalForExchange, vehicle_id: veh2Id } as RentalAgreement,
  ];

  // The real exchange record: Vehicle 1 out, Vehicle 2 in, at T2.
  const exchange: RentalVehicleExchange = {
    id: `xchg_${ctx.stamp}`,
    tenant_id: ctx.orgA,
    rental_id: rentalForExchange.id,
    customer_id: rentalForExchange.customer_id,
    old_vehicle_id: veh1Id,
    new_vehicle_id: veh2Id,
    exchange_at: t2Iso,
    reason: "mechanical_issue",
    old_mileage_in: 12100,
    old_fuel_in: 50,
    new_mileage_out: 8000,
    new_fuel_out: 100,
    old_vehicle_disposition: "maintenance",
    rate_changed: false,
    old_rate: 90,
    new_rate: null,
    created_by: ctx.userAId,
    created_at: t2Iso,
  };

  // Case 1 — Vehicle 1 event during [T1, T2] → exact_match to A.
  const ev1Ts = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(); // ~3h before T2, inside [T1,T2]
  const m1 = resolveVehiclePossessionAt(veh1Id, ev1Ts, rentals, [exchange]);
  steps.push({
    step: "xchg_1_veh1_during_interval_matches_A",
    ok:
      m1.status === "exact_match" &&
      m1.rental?.id === rentalForExchange.id &&
      m1.customerId === rentalForExchange.customer_id,
    detail: `status=${m1.status} rental=${m1.rental?.id ?? "none"} cust=${m1.customerId ?? "none"}`,
  });

  // Case 2 — Vehicle 2 event during [T2, T3] → exact_match to A.
  const ev2Ts = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(); // ~3h after T2, inside [T2,T3]
  const m2 = resolveVehiclePossessionAt(veh2Id, ev2Ts, rentals, [exchange]);
  steps.push({
    step: "xchg_2_veh2_during_interval_matches_A",
    ok:
      m2.status === "exact_match" &&
      m2.rental?.id === rentalForExchange.id &&
      m2.customerId === rentalForExchange.customer_id,
    detail: `status=${m2.status} rental=${m2.rental?.id ?? "none"} cust=${m2.customerId ?? "none"}`,
  });

  // Case 3 — Vehicle 1 event AFTER T2 (post-exchange) → must NOT match A.
  const ev3Ts = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(); // 6h after T2
  const m3 = resolveVehiclePossessionAt(veh1Id, ev3Ts, rentals, [exchange]);
  const blockedCorrectly =
    (m3.status === "no_match" || m3.status === "after_return") &&
    m3.rental?.id !== rentalForExchange.id;
  steps.push({
    step: "xchg_3_veh1_after_exchange_does_not_match_A",
    ok: blockedCorrectly,
    detail: `status=${m3.status} rental=${m3.rental?.id ?? "none"} cust=${m3.customerId ?? "none"}`,
  });

  const matrix: ExchangeMatrixRow[] = [
    {
      case: "Case 1 — Vehicle 1 event during [T1,T2]",
      eventId: `XCHG-V1-${ctx.stamp}`,
      vehicleId: veh1Id,
      timestamp: ev1Ts,
      intervalUsed: `[${t1Iso}, ${t2Iso}]`,
      matchedRentalId: m1.rental?.id ?? null,
      matchedCustomerId: m1.customerId,
      matchStatus: m1.status,
      method: "exchange-truncated possession interval",
    },
    {
      case: "Case 2 — Vehicle 2 event during [T2,T3]",
      eventId: `XCHG-V2-${ctx.stamp}`,
      vehicleId: veh2Id,
      timestamp: ev2Ts,
      intervalUsed: `[${t2Iso}, ${t3Iso}]`,
      matchedRentalId: m2.rental?.id ?? null,
      matchedCustomerId: m2.customerId,
      matchStatus: m2.status,
      method: "exchange-acquired possession interval",
    },
    {
      case: "Case 3 — Vehicle 1 event after T2 (post-exchange)",
      eventId: `XCHG-V1AFTER-${ctx.stamp}`,
      vehicleId: veh1Id,
      timestamp: ev3Ts,
      intervalUsed: "none (released at T2)",
      matchedRentalId: m3.rental?.id ?? null,
      matchedCustomerId: m3.customerId,
      matchStatus: m3.status,
      method: "exchange-release guard (not current renter)",
    },
  ];

  return { steps, matrix };
}
