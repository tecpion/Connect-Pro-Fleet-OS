// Connect Pro Fleet — rental + reservation timeline normalizers (Build #27).
//
// Transforms authoritative RentalAgreement / Reservation / RentalVehicleExchange
// records into UnifiedTimelineEvent entries. Pure functions — no store access.
// Deep links route to the authoritative entity. Malformed dates are handled by
// the shared safe-parse helper so a bad date never crashes the timeline.

import type { RentalAgreement, Reservation } from "./types";
import type { RentalVehicleExchange } from "./store/rentalVehicleExchange";
import type { UnifiedTimelineEvent } from "./timelineTypes";
import { safeParseDate } from "./timelineShared";

const ACTIVE_RENTAL_STATUSES = new Set([
  "active",
  "late",
  "overdue",
  "payment_due",
  "return_pending",
]);

/** Rental lifecycle events for one rental (created, started, returned, cancelled,
 *  + vehicle exchanges). Exchanges are passed explicitly so the normalizer stays
 *  pure and testable. */
export function rentalTimelineEvents(
  rental: RentalAgreement,
  exchanges: RentalVehicleExchange[] = [],
): UnifiedTimelineEvent[] {
  const events: UnifiedTimelineEvent[] = [];
  const base = {
    entity_type: "rental",
    entity_id: rental.id,
    related_entity_type: "customer" as const,
    related_entity_id: rental.customer_id,
    source_module: "rentals",
    actor_id: rental.created_by,
    actor_name: null,
    financial_amount: null,
    financial_direction: null,
    severity: "info" as const,
    customer_id: rental.customer_id,
    vehicle_id: rental.vehicle_id,
    rental_id: rental.id,
    sensitive: false,
    metadata: null,
  };

  events.push({
    ...base,
    id: `rentals:${rental.id}:created`,
    occurred_at: rental.created_at,
    event_type: "rental_created",
    category: "rental",
    title: `Rental ${rental.agreement_number} created`,
    description: null,
    status: rental.status,
    deep_link: `/rentals/${rental.id}`,
  });

  if (rental.checkout_date && ACTIVE_RENTAL_STATUSES.has(rental.status)) {
    events.push({
      ...base,
      id: `rentals:${rental.id}:started`,
      occurred_at: rental.checkout_date,
      event_type: "rental_started",
      category: "rental",
      title: `Rental ${rental.agreement_number} started`,
      description: `Vehicle ${rental.vehicle_id} checked out`,
      status: rental.status,
      deep_link: `/rentals/${rental.id}`,
    });
  }

  for (const ex of exchanges.filter((e) => e.rental_id === rental.id)) {
    events.push({
      ...base,
      id: `rentals:${rental.id}:exchange:${ex.id}`,
      occurred_at: ex.exchange_at,
      event_type: "vehicle_exchange",
      category: "rental",
      title: "Vehicle exchanged",
      description: ex.reason || `Swapped to vehicle ${ex.new_vehicle_id}`,
      status: null,
      deep_link: `/rentals/${rental.id}`,
      metadata: {
        old_vehicle_id: ex.old_vehicle_id,
        new_vehicle_id: ex.new_vehicle_id,
      },
      vehicle_id: ex.new_vehicle_id,
    });
  }

  if (rental.actual_return_date) {
    events.push({
      ...base,
      id: `rentals:${rental.id}:returned`,
      occurred_at: rental.actual_return_date,
      event_type: "rental_returned",
      category: "rental",
      title: `Rental ${rental.agreement_number} returned`,
      description: null,
      status: rental.status,
      deep_link: `/rentals/${rental.id}`,
      severity: "success",
    });
  }

  if (rental.status === "cancelled") {
    events.push({
      ...base,
      id: `rentals:${rental.id}:cancelled`,
      occurred_at: rental.actual_return_date ?? rental.updated_at,
      event_type: "rental_cancelled",
      category: "rental",
      title: `Rental ${rental.agreement_number} cancelled`,
      description: null,
      status: rental.status,
      deep_link: `/rentals/${rental.id}`,
      severity: "warning",
    });
  }

  return events;
}

/** Reservation timeline events (created, confirmed, cancelled). */
export function reservationTimelineEvents(
  res: Reservation,
): UnifiedTimelineEvent[] {
  const events: UnifiedTimelineEvent[] = [];
  const base = {
    entity_type: "reservation",
    entity_id: res.id,
    related_entity_type: "vehicle" as const,
    related_entity_id: res.vehicle_id,
    source_module: "reservations",
    actor_id: res.created_by,
    actor_name: res.created_by_name,
    financial_amount: null,
    financial_direction: null,
    severity: "info" as const,
    customer_id: res.customer_id ?? null,
    vehicle_id: res.vehicle_id,
    rental_id: null,
    sensitive: false,
    metadata: null,
  };

  events.push({
    ...base,
    id: `reservations:${res.id}:created`,
    occurred_at: res.created_at,
    event_type: "reservation_created",
    category: "reservation",
    title: `Reservation ${res.id} created`,
    description: res.renter_name,
    status: res.status,
    deep_link: `/reservations/${res.id}`,
  });

  if (res.status === "confirmed" || res.status === "active") {
    events.push({
      ...base,
      id: `reservations:${res.id}:confirmed`,
      occurred_at: res.created_at,
      event_type: "reservation_confirmed",
      category: "reservation",
      title: `Reservation ${res.id} confirmed`,
      description: null,
      status: res.status,
      deep_link: `/reservations/${res.id}`,
      severity: "success",
    });
  }

  if (res.status === "cancelled") {
    events.push({
      ...base,
      id: `reservations:${res.id}:cancelled`,
      occurred_at: res.created_at,
      event_type: "reservation_cancelled",
      category: "reservation",
      title: `Reservation ${res.id} cancelled`,
      description: null,
      status: res.status,
      deep_link: `/reservations/${res.id}`,
      severity: "warning",
    });
  }

  return events;
}

/** Resolve the effective date for a rental event, falling back safely. */
export function rentalEventDate(r: RentalAgreement): string {
  const parsed = safeParseDate(r.checkout_date);
  return parsed ? r.checkout_date! : r.created_at;
}
