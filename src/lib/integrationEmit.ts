// Connect Pro Fleet — integration event emission helpers (Build #21).
//
// Centralized helpers that domain stores call to emit outbound events into
// the sync outbox. Stores receive an `IntegrationEmitter` (a thin wrapper
// over the IntegrationContext emit API) so they don't import the React
// context directly. Emission is gated on `enabled` inside the outbox — if the
// integration is disabled the event is recorded as `ignored` (audit) without
// failing the financial action.
//
// Loop prevention: every emitted event carries origin_system="fleet" so an
// inbound echo of Fleet's own payment is recognized as a duplicate.

import type {
  ExternalEntityType,
  IntegrationEventPayload,
  IntegrationEventType,
} from "./integrationTypes";

export interface IntegrationEmitter {
  enabled: boolean;
  enqueueOutbound: (input: {
    event_type: IntegrationEventType;
    entity_type: ExternalEntityType | null;
    entity_id: string | null;
    payload: IntegrationEventPayload;
    event_key: string;
    origin_system?: "fleet";
    origin_event_id?: string | null;
  }) => string;
}

/** No-op emitter used when the integration provider isn't mounted (e.g. in
 *  unit tests that exercise domain stores directly). Emission becomes a safe
 *  no-op rather than crashing — financial state is never affected. */
export const NULL_EMITTER: IntegrationEmitter = {
  enabled: false,
  enqueueOutbound: () => "",
};

export type { IntegrationEventPayload, IntegrationEventType };
