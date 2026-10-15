// Connect Pro Fleet — customer → integration event emission (Build #21 cleanup).
//
// Emits CUSTOMER_CREATED_OR_UPDATED so Connect Pro can map/create a contact
// and store the stable external reference. Emission is a safe no-op when the
// integration is disabled. Wired to the authoritative customer create/update
// actions (customerStore) so the declared outbound event type actually fires
// — it is no longer advertised-but-never-emitted.

import { getIntegrationEmitter } from "../integrationEmitterRef";
import type { Customer } from "../types";

export function emitCustomerUpserted(customer: Customer) {
  const emitter = getIntegrationEmitter();
  if (!emitter.enabled) return;
  // Include updated_at + a payload signature in the event_key so an update
  // emits a NEW event (the outbox dedupes by event_key; a stable per-customer
  // key would suppress updates). Each create/update carries its own identity.
  const sig = `${customer.first_name}|${customer.last_name}|${customer.phone ?? ""}`;
  emitter.enqueueOutbound({
    event_type: "customer.created_or_updated",
    entity_type: "customer",
    entity_id: customer.id,
    payload: {
      kind: "customer_updated",
      customer_id: customer.id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone ?? null,
      email: customer.email ?? null,
    },
    event_key: `outbound_customer:${customer.id}:${customer.updated_at}:${sig}`,
    origin_system: "fleet",
  });
}
