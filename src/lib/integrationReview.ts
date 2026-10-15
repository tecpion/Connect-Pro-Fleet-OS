// Connect Pro Fleet — sync review queue resolution (Build #21).
//
// Resolution of IntegrationReviewItems: matched/posted (re-post the inbound
// payment with the reviewer-chosen rental), ignored, duplicate. No financial
// transaction for ignored/duplicate. Matched posts through the AUTHORITATIVE
// ledger path (same recordLedgerPayment as manual Fleet payments) and emits
// outbound PAYMENT_RECEIVED + BALANCE_CHANGED with origin_system=fleet (loop
// safety).

import type {
  IntegrationEvent,
  IntegrationReviewItem,
  PaymentAck,
  ReviewResolution,
} from "./integrationTypes";
import {
  normalizePaymentMethod,
  normalizeProcessor,
} from "./paymentMethodTypes";
import { TENANT_ID, uid } from "./store/ids";
import type { FleetStore } from "./store/storeContext";
import type { OutboxMethods } from "./integrationOutbox";

export interface ReviewState {
  events: () => IntegrationEvent[];
  reviewItems: () => IntegrationReviewItem[];
  setReviewItems: (
    updater: (prev: IntegrationReviewItem[]) => IntegrationReviewItem[],
  ) => void;
  processedExternalPaymentIds: React.MutableRefObject<Set<string>>;
  processedExternalTxnIds: React.MutableRefObject<Set<string>>;
}

export interface ReviewDeps {
  store: FleetStore;
  outbox: OutboxMethods;
  markInboundProcessed: (
    eventId: string,
    ok: boolean,
    message?: string,
  ) => void;
}

export function buildReviewMethods(rs: ReviewState, deps: ReviewDeps) {
  const now = () => new Date().toISOString();

  function resolveReview(
    reviewId: string,
    resolution: ReviewResolution,
    input?: {
      rentalId?: string;
      customerId?: string;
      billingPeriodId?: string | null;
      reason?: string;
    },
  ): PaymentAck | { ok: boolean; message: string } {
    const review = rs.reviewItems().find((r) => r.id === reviewId);
    if (!review) return { ok: false, message: "Review not found" };
    const event = rs.events().find((e) => e.id === review.event_id);
    const ts = now();

    if (resolution === "ignored") {
      rs.setReviewItems((items) =>
        items.map((r) =>
          r.id === reviewId
            ? {
                ...r,
                status: "resolved",
                resolution: "ignored",
                resolved_by: deps.store.currentStaffId,
                resolved_at: ts,
              }
            : r,
        ),
      );
      deps.markInboundProcessed(review.event_id, false, "Ignored by reviewer");
      return { ok: true, message: "Ignored" };
    }

    if (resolution === "duplicate") {
      rs.setReviewItems((items) =>
        items.map((r) =>
          r.id === reviewId
            ? {
                ...r,
                status: "resolved",
                resolution: "duplicate",
                resolved_by: deps.store.currentStaffId,
                resolved_at: ts,
              }
            : r,
        ),
      );
      deps.markInboundProcessed(review.event_id, false, "Duplicate");
      return { ok: true, message: "Marked duplicate" };
    }

    if (resolution === "matched" || resolution === "posted") {
      if (!event || event.payload.kind !== "inbound_payment") {
        return { ok: false, message: "Not a payment review" };
      }
      const p = event.payload;
      const rentalId = input?.rentalId;
      if (!rentalId) return { ok: false, message: "Rental required" };
      const rental = deps.store.rentals.find((r) => r.id === rentalId);
      if (!rental) return { ok: false, message: "Rental not found" };
      const tender = normalizePaymentMethod(p.tender_method);
      const newBalance = deps.store.recordLedgerPayment(
        rentalId,
        p.amount,
        tender,
        {
          processor: normalizeProcessor(p.processor) ?? undefined,
          reference: p.external_transaction_id ?? p.reference ?? null,
          notes: "Resolved from sync review",
          paymentSource: p.payment_source ?? "connect_pro",
        },
      );
      if (p.external_payment_id)
        rs.processedExternalPaymentIds.current.add(p.external_payment_id);
      if (p.external_transaction_id)
        rs.processedExternalTxnIds.current.add(p.external_transaction_id);
      deps.outbox.enqueueOutbound({
        event_type: "payment.received",
        entity_type: "payment",
        entity_id: null,
        payload: {
          kind: "payment_received",
          customer_id: rental.customer_id,
          rental_id: rentalId,
          amount: p.amount,
          tender_method: tender,
          processor: p.processor ?? null,
          external_payment_id: p.external_payment_id,
          external_transaction_id: p.external_transaction_id,
          paid_at: p.paid_at,
        },
        event_key: `outbound_payment_received:${reviewId}`,
        origin_system: "fleet",
      });
      deps.outbox.enqueueOutbound({
        event_type: "balance.changed",
        entity_type: "rental",
        entity_id: rentalId,
        payload: {
          kind: "balance_changed",
          customer_id: rental.customer_id,
          rental_id: rentalId,
          prior_balance: null,
          new_balance: newBalance,
          reason: "payment_received",
          related_transaction_id: null,
          is_paid_in_full: newBalance <= 0,
          is_late: false,
        },
        event_key: `outbound_balance_changed:${rentalId}:${reviewId}`,
        origin_system: "fleet",
      });
      rs.setReviewItems((items) =>
        items.map((r) =>
          r.id === reviewId
            ? {
                ...r,
                status: "resolved",
                resolution: "posted",
                resolved_by: deps.store.currentStaffId,
                resolved_at: ts,
              }
            : r,
        ),
      );
      deps.markInboundProcessed(review.event_id, true);
      return {
        status: "accepted",
        transaction_id: null,
        message: "Payment posted",
      };
    }

    return { ok: false, message: "Unsupported resolution" };
  }

  function ignoreReview(reviewId: string, reason: string) {
    resolveReview(reviewId, "ignored", { reason });
  }

  return { resolveReview, ignoreReview };
}

/** Standalone review-item factory (used by the inbox to create reviews). */
export function makeReviewItem(input: {
  event_id: string;
  review_type: import("./integrationTypes").ReviewType;
  reason: string;
  severity?: "info" | "warning" | "error" | "blocking";
  candidate_entity_ids?: Record<string, string[]>;
  metadata?: Record<string, unknown> | null;
}): IntegrationReviewItem {
  return {
    id: uid("rev"),
    tenant_id: TENANT_ID,
    event_id: input.event_id,
    review_type: input.review_type,
    severity: input.severity ?? "warning",
    status: "open",
    reason: input.reason,
    candidate_entity_ids: input.candidate_entity_ids ?? {},
    resolution: null,
    resolved_by: null,
    resolved_at: null,
    created_at: new Date().toISOString(),
    metadata: input.metadata ?? null,
  };
}
