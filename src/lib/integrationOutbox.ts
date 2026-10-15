// Connect Pro Fleet — integration outbox (Build #21).
//
// Outbox: Fleet financial action → enqueue IntegrationEvent → attempt
// delivery via the transport. Failed delivery NEVER rolls back Fleet state.
// Idempotent by event_key (synchronous ref registry). Loop prevention:
// outbound events carry origin_system + origin_event_id.

import type {
  DeliveryResult,
  EventFailureType,
  ExternalEntityType,
  IntegrationEvent,
  IntegrationEventPayload,
  IntegrationEventType,
  IntegrationSystem,
  SyncOrigin,
} from "./integrationTypes";
import { TENANT_ID, uid } from "./store/ids";
import type { MockConnectProTransport } from "./integrationTransport";

/** Type guard for the failed-delivery variant. A user-defined type predicate
 *  narrows reliably even inside nested callbacks (TS control-flow narrowing
 *  through closures is conservative and was failing for this union). */
function isFailedDelivery(r: DeliveryResult): r is {
  ok: false;
  reason: string;
  retryable: boolean;
  failure_type: EventFailureType;
} {
  return !r.ok;
}

export const MAX_ATTEMPTS = 5;

export interface OutboxState {
  /** Live getter backed by a ref so retry/flush read the latest events. */
  events: () => IntegrationEvent[];
  setEvents: (
    updater: (prev: IntegrationEvent[]) => IntegrationEvent[],
  ) => void;
  processedEventKeys: React.MutableRefObject<Set<string>>;
}

export interface OutboxDeps {
  transport: MockConnectProTransport;
  isEnabled: () => boolean;
  setLastSync: (ts: string) => void;
  setLastError: (ts: string, message: string) => void;
}

export function buildOutboxMethods(os: OutboxState, deps: OutboxDeps) {
  const now = () => new Date().toISOString();

  function deliverOne(event: IntegrationEvent): DeliveryResult {
    if (!deps.isEnabled()) {
      return {
        ok: false,
        reason: "Integration disabled",
        retryable: false,
        failure_type: "unsupported" as EventFailureType,
      };
    }
    return deps.transport.sendEvent(event);
  }

  function applyDelivery(
    eventId: string,
    result: DeliveryResult,
    currentAttempts: number,
  ) {
    const ts = now();
    if (result.ok) {
      os.setEvents((evs) =>
        evs.map((e) =>
          e.id === eventId
            ? {
                ...e,
                status: "succeeded",
                attempts: currentAttempts + 1,
                last_attempt_at: ts,
                processed_at: ts,
                error_code: null,
                error_message: null,
              }
            : e,
        ),
      );
      deps.setLastSync(ts);
      return;
    }
    if (!isFailedDelivery(result)) return; // unreachable; satisfies the compiler
    // Bind the narrowed failure object to a local so the closures below use the
    // narrowed type (not the union) — destructure alone was losing narrowing.
    const failure = result;
    const failure_type = failure.failure_type;
    const reason = failure.reason;
    if (failure_type === "unsupported") {
      os.setEvents((evs) =>
        evs.map((e) =>
          e.id === eventId
            ? {
                ...e,
                status: "ignored",
                attempts: currentAttempts + 1,
                last_attempt_at: ts,
                error_code: failure_type,
                error_message: reason,
              }
            : e,
        ),
      );
      return;
    }
    os.setEvents((evs) =>
      evs.map((e) =>
        e.id === eventId
          ? {
              ...e,
              status:
                currentAttempts + 1 >= MAX_ATTEMPTS ? "dead_letter" : "failed",
              attempts: currentAttempts + 1,
              last_attempt_at: ts,
              error_code: failure_type,
              error_message: reason,
            }
          : e,
      ),
    );
    deps.setLastError(ts, reason);
  }

  function enqueueOutbound(input: {
    event_type: IntegrationEventType;
    entity_type: ExternalEntityType | null;
    entity_id: string | null;
    payload: IntegrationEventPayload;
    event_key: string;
    origin_system?: SyncOrigin;
    origin_event_id?: string | null;
  }): string {
    if (os.processedEventKeys.current.has(input.event_key)) {
      const existing = os.events().find((e) => e.event_key === input.event_key);
      return existing?.id ?? "";
    }
    os.processedEventKeys.current.add(input.event_key);
    const id = uid("iev");
    const event: IntegrationEvent = {
      id,
      tenant_id: TENANT_ID,
      integration: "connect_pro" as IntegrationSystem,
      event_type: input.event_type,
      direction: "outbound",
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      external_entity_id: null,
      payload: input.payload,
      event_key: input.event_key,
      status: "pending",
      attempts: 0,
      last_attempt_at: null,
      processed_at: null,
      error_code: null,
      error_message: null,
      origin_system: input.origin_system ?? "fleet",
      origin_event_id: input.origin_event_id ?? null,
      schema_version: 1,
      created_at: now(),
    };
    os.setEvents((evs) => [event, ...evs]);
    const result = deliverOne(event);
    applyDelivery(id, result, 0);
    return id;
  }

  function retryEvent(eventId: string) {
    const event = os.events().find((e) => e.id === eventId);
    if (
      !event ||
      event.status === "succeeded" ||
      event.direction !== "outbound"
    )
      return;
    const result = deliverOne(event);
    applyDelivery(eventId, result, event.attempts);
  }

  function flushOutbox() {
    let delivered = 0;
    let failed = 0;
    for (const e of os.events()) {
      if (
        e.direction === "outbound" &&
        (e.status === "pending" || e.status === "failed")
      ) {
        retryEvent(e.id);
        const updated = os.events().find((x) => x.id === e.id);
        if (updated?.status === "succeeded") delivered++;
        else failed++;
      }
    }
    return { delivered, failed };
  }

  return { enqueueOutbound, retryEvent, flushOutbox };
}

export type OutboxMethods = ReturnType<typeof buildOutboxMethods>;
