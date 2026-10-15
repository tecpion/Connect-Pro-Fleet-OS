// Connect Pro Fleet — V1 Tolls & Violations Automation: inbound ingestion
// selector + possession matching wrapper.
//
// resolveViolationPossession is the ONE authoritative matching selector. It
// determines who possessed the vehicle at the event time using:
//   vehicle + occurred_at + rental possession window + vehicle exchange history
//
// Results: matched | ambiguous | company_possession | unmatched
//   - matched: exactly one rental possessed the vehicle at event time
//   - ambiguous: multiple possible records / insufficient certainty
//   - company_possession: no renter possessed the vehicle at event time
//   - unmatched: vehicle/event cannot be reliably resolved
//
// NEVER assigns renter responsibility solely because they are the CURRENT
// renter. Historical event time controls. Ambiguous records are NEVER
// auto-charged.
//
// ingestViolationProviderEvent is idempotent by provider + external_event_id:
// a duplicate inbound event creates NO duplicate violation record. It does NOT
// create a Customer Charge — a charge is created only after an allowed
// responsibility decision (manual confirm or auto-assign-exact-match policy).
//
// Pure + testable. No mutations to the store; the provider wires the result.

import type { Vehicle, RentalAgreement } from "./types";
import type { RentalVehicleExchange } from "./store/rentalVehicleExchange";
import type { Violation } from "./violationTypes";
import type { MatchingConfidence } from "./violationTypes";
import type { ViolationProviderEvent } from "./violationAdapters";
import {
  resolveVehiclePossessionAt,
  type PossessionResult,
} from "./violationPossession";

// ---------------------------------------------------------------------------
// resolveViolationPossession — the authoritative matching selector
// ---------------------------------------------------------------------------

export { resolveVehiclePossessionAt, type PossessionResult };

/** Map the low-level possession resolver status to the spec's matching
 *  confidence vocabulary. The resolver's before_rental / after_return both
 *  indicate no renter had the vehicle at event time → company_possession when
 *  the vehicle exists; no_match → unmatched. */
export function resolveViolationPossession(
  vehicleId: string | null,
  occurredAt: string,
  rentals: RentalAgreement[],
  exchanges: RentalVehicleExchange[],
): { confidence: MatchingConfidence; rental: RentalAgreement | null } {
  if (!vehicleId) return { confidence: "unmatched", rental: null };
  const res = resolveVehiclePossessionAt(
    vehicleId,
    occurredAt,
    rentals,
    exchanges,
  );
  switch (res.status) {
    case "exact_match":
      return { confidence: "matched", rental: res.rental };
    case "multiple_match":
      return { confidence: "ambiguous", rental: null };
    case "no_match":
      return { confidence: "unmatched", rental: null };
    case "before_rental":
    case "after_return":
      // Vehicle existed but no renter possessed it at event time.
      return { confidence: "company_possession", rental: null };
    default:
      return { confidence: "unmatched", rental: null };
  }
}

// ---------------------------------------------------------------------------
// Vehicle resolution from an inbound event (plate / vin)
// ---------------------------------------------------------------------------

/** Resolve a vehicle from an inbound event by plate or VIN. Returns null when
 *  no vehicle in this organization matches. Org-scoped by construction (the
 *  vehicles array is the tenant's). */
export function resolveVehicleFromEvent(
  event: ViolationProviderEvent,
  vehicles: Vehicle[],
): string | null {
  const vin = event.vin?.trim().toUpperCase();
  if (vin) {
    const v = vehicles.find((x) => x.vin?.toUpperCase() === vin);
    if (v) return v.id;
  }
  const plate = event.plate?.trim().toUpperCase();
  if (plate) {
    const v = vehicles.find((x) => x.license_plate?.toUpperCase() === plate);
    if (v) return v.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Idempotent ingestion result
// ---------------------------------------------------------------------------

export interface IngestViolationResult {
  /** The existing violation id if this external event was already ingested
   *  (duplicate). Null otherwise. */
  duplicateOf: string | null;
  /** The vehicle id resolved from plate/VIN. Null if no match. */
  vehicle_id: string | null;
  /** Possession-match confidence. */
  confidence: MatchingConfidence;
  /** Matched rental (only when confidence === matched). */
  rental_id: string | null;
  /** Matched customer (only when confidence === matched). */
  customer_id: string | null;
  /** Issues requiring staff review (empty when clean). */
  issues: string[];
}

/** Idempotency key for inbound ingestion: provider + external_event_id. */
export function ingestionKey(
  provider: string,
  externalEventId: string,
): string {
  return `${provider}|${externalEventId}`;
}

/** Detect whether an inbound event duplicates an existing violation (by
 *  provider + external_event_id). Also falls back to authority + notice_number
 *  for events ingested before the V1 provider fields existed. */
export function findDuplicateIngestion(
  event: ViolationProviderEvent,
  existing: Violation[],
): Violation | null {
  const key = ingestionKey(event.provider, event.external_event_id);
  const byKey = existing.find(
    (v) =>
      v.provider === event.provider &&
      v.external_event_id === event.external_event_id,
  );
  if (byKey) return byKey;
  // Fallback: authority + notice_number (covers legacy CSV-imported records).
  if (event.authority && event.notice_number) {
    return (
      existing.find(
        (v) =>
          v.issuing_authority === event.authority &&
          v.citation_number === event.notice_number,
      ) ?? null
    );
  }
  void key;
  return null;
}

/** Run the full inbound ingestion pipeline for a single event. Pure: returns
 *  the resolution WITHOUT mutating the store. The provider's createViolation
 *  uses this result to build the record. Duplicate events return duplicateOf
 *  set and NO new record should be created. */
export function ingestViolationProviderEvent(
  event: ViolationProviderEvent,
  ctx: {
    vehicles: Vehicle[];
    rentals: RentalAgreement[];
    exchanges: RentalVehicleExchange[];
    existing: Violation[];
  },
): IngestViolationResult {
  // 1. Idempotency: duplicate by provider + external_event_id.
  const dup = findDuplicateIngestion(event, ctx.existing);
  if (dup) {
    return {
      duplicateOf: dup.id,
      vehicle_id: dup.vehicle_id,
      confidence: dup.matching_confidence ?? "unmatched",
      rental_id: dup.rental_id,
      customer_id: dup.customer_id,
      issues: ["Duplicate inbound provider event"],
    };
  }

  // 2. Resolve vehicle from plate/VIN (org-scoped).
  const vehicleId = resolveVehicleFromEvent(event, ctx.vehicles);
  const issues: string[] = [];
  if (!vehicleId) issues.push("No vehicle match for plate/VIN");

  // 3. Possession matching (exchange-aware, historical event time).
  let confidence: MatchingConfidence = "unmatched";
  let rentalId: string | null = null;
  let customerId: string | null = null;
  if (vehicleId) {
    const match = resolveViolationPossession(
      vehicleId,
      event.occurred_at,
      ctx.rentals,
      ctx.exchanges,
    );
    confidence = match.confidence;
    if (match.confidence === "matched" && match.rental) {
      rentalId = match.rental.id;
      customerId = match.rental.customer_id;
    } else if (match.confidence === "ambiguous") {
      issues.push("Multiple conflicting possession matches");
    } else if (match.confidence === "company_possession") {
      issues.push(
        "No renter possessed vehicle at event time (company possession)",
      );
    } else if (match.confidence === "unmatched") {
      issues.push("No rental possession match found");
    }
  }

  return {
    duplicateOf: null,
    vehicle_id: vehicleId,
    confidence,
    rental_id: rentalId,
    customer_id: customerId,
    issues,
  };
}

/** Admin fee for a violation type from policy. Returns 0 when not configured —
 *  never a hardcoded fee. */
export function adminFeeForType(
  type: ViolationProviderEvent["type"],
  policy: {
    admin_fee_amount: number;
    toll_admin_fee: number;
    parking_admin_fee: number;
    camera_admin_fee: number;
    other_admin_fee: number;
  },
): number {
  switch (type) {
    case "toll":
      return policy.toll_admin_fee || 0;
    case "parking_ticket":
      return policy.parking_admin_fee || 0;
    case "red_light_camera":
    case "speed_camera":
      return policy.camera_admin_fee || 0;
    default:
      return policy.other_admin_fee || 0;
  }
}
