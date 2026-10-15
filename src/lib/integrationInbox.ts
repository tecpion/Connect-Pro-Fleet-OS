// Connect Pro Fleet — integration inbox (Build #21).
//
// Inbox: inbound event → idempotency check → resolve external ids → post
// authoritative Fleet action ONCE → mark processed. Unmatched/unsafe events
// become IntegrationReviewItems (no money moves until a human resolves).
// Idempotency by external_event_id → external_payment_id →
// external_transaction_id → event_key (never amount+customer+date). Loop
// prevention: outbound echoes carry origin_system=fleet so an inbound echo
// of Fleet's own payment is recognized as a duplicate.
//
// Build #21 final cleanup: same external_payment_id + materially different
// financial data → CONFLICT (review item, no money moves); identical data →
// duplicate. Reversal + payload helpers live in sibling modules.

import type {
  ExternalEntityReference,
  IntegrationEvent,
  IntegrationEventPayload,
  IntegrationEventType,
  IntegrationReviewItem,
  PaymentAck,
  ReviewType,
} from "./integrationTypes";
import { normalizePaymentMethod } from "./paymentMethodTypes";
import { TENANT_ID, uid } from "./store/ids";
import type { FleetStore } from "./store/storeContext";
import type { RegistryMethods } from "./integrationRegistry";
import type { OutboxMethods } from "./integrationOutbox";
import { makeReviewItem } from "./integrationReview";
import {
  detectPaymentConflict,
  detectEntityConflict,
  lookupExistingPayment,
  type PostedPaymentRefMap,
} from "./integrationConflict";
import {
  inboundPayload,
  type InboundPaymentInput,
} from "./integrationInboundPayload";
import { processInboundReversal } from "./integrationReversal";

export interface InboxState {
  events: () => IntegrationEvent[];
  setEvents: (
    updater: (prev: IntegrationEvent[]) => IntegrationEvent[],
  ) => void;
  reviewItems: () => IntegrationReviewItem[];
  setReviewItems: (
    updater: (prev: IntegrationReviewItem[]) => IntegrationReviewItem[],
  ) => void;
  processedEventKeys: React.MutableRefObject<Set<string>>;
  processedExternalPaymentIds: React.MutableRefObject<Set<string>>;
  processedExternalTxnIds: React.MutableRefObject<Set<string>>;
  /** Synchronous map of external_payment_id → posted Fleet txn id, so conflict
   *  detection works within one batched act() (the registry/transactions are
   *  stale until React flushes). */
  postedPaymentByExternalId: React.MutableRefObject<PostedPaymentRefMap>;
  externalRefs: () => ExternalEntityReference[];
}

export interface InboxDeps {
  store: FleetStore;
  registry: RegistryMethods;
  outbox: OutboxMethods;
}

export function buildInboxMethods(is: InboxState, deps: InboxDeps) {
  const now = () => new Date().toISOString();

  function recordInboundEvent(input: {
    event_type: IntegrationEventType;
    payload: IntegrationEventPayload;
    event_key: string;
    external_entity_id?: string | null;
  }): { eventId: string; duplicate: boolean } {
    if (is.processedEventKeys.current.has(input.event_key)) {
      const existing = is.events().find((e) => e.event_key === input.event_key);
      return { eventId: existing?.id ?? "", duplicate: true };
    }
    is.processedEventKeys.current.add(input.event_key);
    const id = uid("iev");
    const event: IntegrationEvent = {
      id,
      tenant_id: TENANT_ID,
      integration: "connect_pro",
      event_type: input.event_type,
      direction: "inbound",
      entity_type: null,
      entity_id: null,
      external_entity_id: input.external_entity_id ?? null,
      payload: input.payload,
      event_key: input.event_key,
      status: "processing",
      attempts: 1,
      last_attempt_at: now(),
      processed_at: null,
      error_code: null,
      error_message: null,
      origin_system: "connect_pro",
      origin_event_id: null,
      schema_version: 1,
      created_at: now(),
    };
    is.setEvents((evs) => [event, ...evs]);
    return { eventId: id, duplicate: false };
  }

  function markInboundProcessed(
    eventId: string,
    ok: boolean,
    message?: string,
  ) {
    const ts = now();
    is.setEvents((evs) =>
      evs.map((e) =>
        e.id === eventId
          ? {
              ...e,
              status: ok ? "succeeded" : "ignored",
              processed_at: ts,
              error_message: ok ? null : (message ?? null),
            }
          : e,
      ),
    );
  }

  function createReview(input: {
    event_id: string;
    review_type: ReviewType;
    reason: string;
    severity?: "info" | "warning" | "error" | "blocking";
    candidate_entity_ids?: Record<string, string[]>;
    metadata?: Record<string, unknown> | null;
  }): string {
    const item = makeReviewItem(input);
    is.setReviewItems((rs) => [item, ...rs]);
    return item.id;
  }

  function paymentAlreadyProcessed(input: {
    external_event_id: string;
    external_payment_id?: string | null;
    external_transaction_id?: string | null;
  }): boolean {
    if (
      input.external_payment_id &&
      is.processedExternalPaymentIds.current.has(input.external_payment_id)
    )
      return true;
    if (
      input.external_transaction_id &&
      is.processedExternalTxnIds.current.has(input.external_transaction_id)
    )
      return true;
    return false;
  }

  /** Resolve inbound external rental/customer ids to Fleet ids. */
  function resolveEntities(input: {
    rental_external_id?: string | null;
    customer_external_id?: string | null;
  }): { rentalId: string | null; customerId: string | null } {
    const rentalId = input.rental_external_id
      ? deps.registry.resolveInternalId({
          system: "connect_pro",
          entity_type: "rental",
          external_id: input.rental_external_id,
        })
      : null;
    const customerId = input.customer_external_id
      ? deps.registry.resolveInternalId({
          system: "connect_pro",
          entity_type: "customer",
          external_id: input.customer_external_id,
        })
      : null;
    return { rentalId, customerId };
  }

  function processInboundPayment(input: InboundPaymentInput): PaymentAck {
    // --- Conflict detection (Build #21 final cleanup) ---------------------
    // Same external payment identity + materially incompatible financial data
    // → CONFLICT (no money moves). A genuine identical re-delivery → duplicate.
    if (input.external_payment_id) {
      const existing = lookupExistingPayment({
        externalPaymentId: input.external_payment_id,
        refMap: is.postedPaymentByExternalId.current,
        findTxn: (id) => deps.store.transactions.find((t) => t.id === id),
        resolveInternalId: (extId) =>
          deps.registry.resolveInternalId({
            system: "connect_pro",
            entity_type: "payment",
            external_id: extId,
          }) ?? null,
      });
      if (existing) {
        const conflict =
          detectPaymentConflict(existing.txn, {
            amount: input.amount,
            rental_external_id: input.rental_external_id ?? null,
            customer_external_id: input.customer_external_id ?? null,
            processor: input.processor ?? undefined,
            external_transaction_id: input.external_transaction_id ?? null,
          }) ?? detectEntityConflict(existing.txn, resolveEntities(input));
        if (conflict) {
          const { eventId } = recordInboundEvent({
            event_type: "payment.recorded",
            payload: inboundPayload(input),
            event_key: `inbound_payment:${input.external_event_id}`,
            external_entity_id: input.external_payment_id,
          });
          createReview({
            event_id: eventId,
            review_type: "conflict",
            severity: "blocking",
            reason: `EXTERNAL_PAYMENT_MISMATCH — ${conflict}`,
            metadata: {
              external_payment_id: input.external_payment_id,
              existing_fleet_payment_id: existing.txn.id,
              existing_amount: existing.txn.amount,
              incoming_amount: input.amount,
              existing_rental_id: existing.txn.rental_id,
              existing_processor:
                (existing.txn.metadata as { processor?: string | null } | null)
                  ?.processor ?? null,
              incoming_processor: input.processor ?? undefined,
            },
          });
          markInboundProcessed(eventId, false, "Conflict — needs review");
          return {
            status: "conflict",
            transaction_id: existing.txn.id,
            message: "EXTERNAL_PAYMENT_MISMATCH",
          };
        }
        return {
          status: "duplicate",
          transaction_id: existing.txn.id,
          message: "duplicate_already_processed",
        };
      }
    }

    if (paymentAlreadyProcessed(input)) {
      return {
        status: "duplicate",
        transaction_id: null,
        message: "duplicate_already_processed",
      };
    }
    const eventKey = `inbound_payment:${input.external_event_id}`;
    const { eventId, duplicate } = recordInboundEvent({
      event_type: "payment.recorded",
      payload: inboundPayload(input),
      event_key: eventKey,
      external_entity_id: input.external_payment_id ?? input.external_event_id,
    });
    if (duplicate) {
      return {
        status: "duplicate",
        transaction_id: null,
        message: "duplicate_already_processed",
      };
    }

    let rentalId: string | null = null;
    let customerId: string | null = null;
    if (input.rental_external_id) {
      rentalId = deps.registry.resolveInternalId({
        system: "connect_pro",
        entity_type: "rental",
        external_id: input.rental_external_id,
      });
    }
    if (input.customer_external_id) {
      customerId = deps.registry.resolveInternalId({
        system: "connect_pro",
        entity_type: "customer",
        external_id: input.customer_external_id,
      });
    }
    if (rentalId) {
      const rental = deps.store.rentals.find((r) => r.id === rentalId);
      if (rental) customerId = rental.customer_id;
    }

    if (!input.amount || input.amount <= 0) {
      createReview({
        event_id: eventId,
        review_type: "failed_event",
        reason: `Invalid payment amount: ${input.amount}`,
        severity: "error",
      });
      markInboundProcessed(eventId, false, "Invalid amount");
      return {
        status: "rejected",
        transaction_id: null,
        message: "Invalid amount",
      };
    }

    if (!rentalId && !customerId) {
      createReview({
        event_id: eventId,
        review_type: "unmatched_payment",
        reason:
          "Could not resolve customer or rental from external references.",
        severity: "warning",
        metadata: {
          amount: input.amount,
          external_payment_id: input.external_payment_id ?? null,
          external_transaction_id: input.external_transaction_id ?? null,
        },
      });
      markInboundProcessed(eventId, false, "Needs review — unmatched");
      return {
        status: "needs_review",
        transaction_id: null,
        message: "Needs review",
      };
    }

    if (!rentalId && customerId) {
      const candidateRentals = deps.store.rentals
        .filter(
          (r) =>
            r.customer_id === customerId &&
            !["completed", "cancelled"].includes(r.status),
        )
        .map((r) => r.id);
      createReview({
        event_id: eventId,
        review_type: "unknown_rental",
        reason: "Customer resolved but rental not specified.",
        severity: "warning",
        candidate_entity_ids: { rental: candidateRentals },
        metadata: { customer_id: customerId, amount: input.amount },
      });
      markInboundProcessed(eventId, false, "Needs review — rental unknown");
      return {
        status: "needs_review",
        transaction_id: null,
        message: "Needs review",
      };
    }

    const tender = normalizePaymentMethod(input.tender_method);
    const balanceBefore = deps.store.rentalFinancials(rentalId!).balance;
    const newBalance = deps.store.recordLedgerPayment(
      rentalId!,
      input.amount,
      tender,
      {
        processor: input.processor ?? undefined,
        reference: input.external_transaction_id ?? input.reference ?? null,
        notes: input.notes ?? "Synced from Connect Pro",
        paymentSource: input.payment_source ?? "connect_pro",
      },
    );

    // Register external payment id → Fleet payment transaction so a later
    // re-delivery is recognized as a duplicate (or conflict if data differs).
    // The ref map is updated SYNCHRONOUSLY so conflict detection works within
    // one batched act() (the registry/transactions are stale until React
    // flushes).
    if (input.external_payment_id) {
      const postedTxn = [...deps.store.transactions]
        .reverse()
        .find(
          (t) =>
            t.rental_id === rentalId &&
            t.category === "payment" &&
            t.status === "posted",
        );
      const txnId = postedTxn?.id ?? uid("txn");
      is.postedPaymentByExternalId.current.set(input.external_payment_id, {
        txnId,
        amount: input.amount,
        rentalId,
        customerId,
        processor: input.processor ?? undefined,
        externalTxnId: input.external_transaction_id ?? null,
        status: "posted",
      });
      deps.registry.mapExternalId({
        system: "connect_pro",
        entity_type: "payment",
        internal_id: txnId,
        external_id: input.external_payment_id,
      });
      is.processedExternalPaymentIds.current.add(input.external_payment_id);
    }
    if (input.external_transaction_id)
      is.processedExternalTxnIds.current.add(input.external_transaction_id);

    deps.outbox.enqueueOutbound({
      event_type: "payment.received",
      entity_type: "payment",
      entity_id: null,
      payload: {
        kind: "payment_received",
        customer_id: customerId!,
        rental_id: rentalId!,
        amount: input.amount,
        tender_method: tender,
        processor: input.processor ?? undefined,
        external_payment_id: input.external_payment_id ?? null,
        external_transaction_id: input.external_transaction_id ?? null,
        paid_at: input.paid_at ?? now(),
      },
      event_key: `outbound_payment_received:${input.external_event_id}`,
      origin_system: "fleet",
      origin_event_id: eventId,
    });
    deps.outbox.enqueueOutbound({
      event_type: "balance.changed",
      entity_type: "rental",
      entity_id: rentalId!,
      payload: {
        kind: "balance_changed",
        customer_id: customerId!,
        rental_id: rentalId!,
        prior_balance: balanceBefore,
        new_balance: newBalance,
        reason: "payment_received",
        related_transaction_id: null,
        is_paid_in_full: newBalance <= 0,
        is_late: false,
      },
      event_key: `outbound_balance_changed:${rentalId}:${input.external_event_id}`,
      origin_system: "fleet",
      origin_event_id: eventId,
    });

    markInboundProcessed(eventId, true);
    return {
      status: "accepted",
      transaction_id: null,
      message: "Payment posted",
    };
  }

  function processReversal(input: {
    external_event_id: string;
    external_payment_id: string;
    amount: number;
    reason?: string | null;
  }): PaymentAck {
    return processInboundReversal(input, {
      recordInboundEvent: (i) =>
        recordInboundEvent({
          event_type: i.event_type,
          payload: i.payload,
          event_key: i.event_key,
          external_entity_id: i.external_entity_id,
        }),
      createReview: (i) =>
        createReview({
          event_id: i.event_id,
          review_type: i.review_type,
          reason: i.reason,
          severity: i.severity,
        }),
      markInboundProcessed,
      findPaymentRef: (externalPaymentId) => {
        const ref = is
          .externalRefs()
          .find(
            (r) =>
              r.system === "connect_pro" &&
              r.entity_type === "payment" &&
              r.external_id === externalPaymentId &&
              r.status === "active",
          );
        return ref?.internal_id ?? null;
      },
      voidTransaction: (txnId, reason) =>
        deps.store.voidTransaction(txnId, reason),
    });
  }

  return {
    processInboundPayment,
    processInboundReversal: processReversal,
    markInboundProcessed,
    createReview,
  };
}
