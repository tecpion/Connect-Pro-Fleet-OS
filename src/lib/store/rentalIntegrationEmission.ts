// Connect Pro Fleet — rental lifecycle → integration event emission (Build #21).
//
// Extracted from rentalStore.ts to keep that module under the line limit.
// Emits RENTAL_STARTED and RENTAL_COMPLETED outbound events so Connect Pro can
// map the rental, begin automation, and stop reminders. Idempotent per rental.
// Emission is gated on `emitter.enabled` — a safe no-op when integration is off.

import { getIntegrationEmitter } from "../integrationEmitterRef";
import type { RentalAgreement } from "../types";
import type { RentalBillingConfig } from "../billingTypes";

export function emitRentalStarted(
  rental: RentalAgreement,
  billingConfig: RentalBillingConfig | null | undefined,
  today: string,
) {
  const emitter = getIntegrationEmitter();
  if (!emitter.enabled) return;
  const cfg = billingConfig ?? rental.billing_config;
  emitter.enqueueOutbound({
    event_type: "rental.started",
    entity_type: "rental",
    entity_id: rental.id,
    payload: {
      kind: "rental_started",
      customer_id: rental.customer_id,
      rental_id: rental.id,
      vehicle_id: rental.vehicle_id,
      agreement_number: rental.agreement_number,
      start_date: today,
      billing_frequency: cfg?.billing_frequency ?? "weekly",
      recurring_amount: cfg?.recurring_amount ?? null,
    },
    event_key: `outbound_rental_started:${rental.id}`,
    origin_system: "fleet",
  });
}

export function emitRentalCompleted(
  rental: RentalAgreement,
  finalBalance: number,
  now: string,
) {
  const emitter = getIntegrationEmitter();
  if (!emitter.enabled) return;
  emitter.enqueueOutbound({
    event_type: "rental.completed",
    entity_type: "rental",
    entity_id: rental.id,
    payload: {
      kind: "rental_completed",
      customer_id: rental.customer_id,
      rental_id: rental.id,
      completed_at: now,
      final_balance: finalBalance,
    },
    event_key: `outbound_rental_completed:${rental.id}`,
    origin_system: "fleet",
  });
}
