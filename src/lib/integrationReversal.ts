// Connect Pro Fleet — inbound reversal processing (Build #21).
//
// Extracted from integrationInbox.ts to keep that module under the line limit.
// Reverses a mapped Fleet payment (via the authoritative voidTransaction
// path) when an external reversal event arrives. Idempotent by event_key.
// Unmapped reversals route to the review queue (no money moves).

import type { IntegrationEventPayload } from "./integrationTypes";
import type { PaymentAck } from "./integrationTypes";

export interface ReversalDeps {
  recordInboundEvent: (input: {
    event_type: "payment.reversed_external";
    payload: Extract<IntegrationEventPayload, { kind: "inbound_reversal" }>;
    event_key: string;
    external_entity_id: string;
  }) => { eventId: string; duplicate: boolean };
  createReview: (input: {
    event_id: string;
    review_type: "unmatched_payment";
    reason: string;
    severity?: "info" | "warning" | "error" | "blocking";
  }) => string;
  markInboundProcessed: (
    eventId: string,
    ok: boolean,
    message?: string,
  ) => void;
  findPaymentRef: (externalPaymentId: string) => string | null;
  voidTransaction: (txnId: string, reason: string) => void;
}

export function processInboundReversal(
  input: {
    external_event_id: string;
    external_payment_id: string;
    amount: number;
    reason?: string | null;
  },
  deps: ReversalDeps,
): PaymentAck {
  const eventKey = `inbound_reversal:${input.external_event_id}`;
  const { eventId, duplicate } = deps.recordInboundEvent({
    event_type: "payment.reversed_external",
    payload: {
      kind: "inbound_reversal",
      external_event_id: input.external_event_id,
      external_payment_id: input.external_payment_id,
      amount: input.amount,
      reason: input.reason ?? null,
    },
    event_key: eventKey,
    external_entity_id: input.external_payment_id,
  });
  if (duplicate) {
    return {
      status: "duplicate",
      transaction_id: null,
      message: "duplicate_already_processed",
    };
  }
  const foundId = deps.findPaymentRef(input.external_payment_id);
  if (!foundId) {
    deps.createReview({
      event_id: eventId,
      review_type: "unmatched_payment",
      reason: `No mapped Fleet payment for external_payment_id ${input.external_payment_id}.`,
      severity: "warning",
    });
    deps.markInboundProcessed(eventId, false, "Unmapped reversal");
    return {
      status: "needs_review",
      transaction_id: null,
      message: "Unmapped reversal",
    };
  }
  deps.voidTransaction(foundId, input.reason ?? "Reversed via Connect Pro");
  deps.markInboundProcessed(eventId, true);
  return {
    status: "accepted",
    transaction_id: foundId,
    message: "Reversal posted",
  };
}
