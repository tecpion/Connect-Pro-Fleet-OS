// Connect Pro Fleet — Connect Pro ↔ Fleet sync domain types (Build #21).
//
// This build defines the financial integration CONTRACT between Connect Pro
// Fleet (authoritative billing/balance/late-state) and Connect Pro IO
// (customer communication / automation / payment-link layer). The contract is
// provider-agnostic: a transport abstraction (mock now, real webhook later)
// carries IntegrationEvents in both directions.
//
// Core rules enforced by these types + the store:
//  - Fleet decides WHAT IS OWED; Connect Pro decides HOW to communicate it.
//  - A payment is recorded ONCE (idempotency by external event/payment/txn id).
//  - A late fee is created ONCE (Fleet is authoritative).
//  - An obligation has ONE authoritative identity (stable external refs).
//  - Loop prevention: outbound events carry origin_system / lineage so an
//    inbound echo of Fleet's own action never creates a duplicate.
//  - Failed Connect Pro delivery NEVER rolls back authoritative Fleet state.
//
// All records are tenant-scoped and designed to become Supabase tables + RLS.

// ---------------------------------------------------------------------------
// Systems + origins
// ---------------------------------------------------------------------------

/** External systems that can be mapped to Fleet entities. */
export type IntegrationSystem =
  "connect_pro" | "stripe" | "square" | "paypal" | "other";

export const INTEGRATION_SYSTEM_LABELS: Record<IntegrationSystem, string> = {
  connect_pro: "Connect Pro",
  stripe: "Stripe",
  square: "Square",
  paypal: "PayPal",
  other: "Other",
};

/** Where a payment / event originated — used for loop prevention. */
export type SyncOrigin =
  "fleet" | "connect_pro" | "stripe" | "square" | "paypal" | "manual" | "other";

export const SYNC_ORIGIN_LABELS: Record<SyncOrigin, string> = {
  fleet: "Fleet Manual",
  connect_pro: "Connect Pro",
  stripe: "Stripe via Connect Pro",
  square: "Square",
  paypal: "PayPal",
  manual: "Manual",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Integration config
// ---------------------------------------------------------------------------

export type ConnectionStatus =
  "not_connected" | "connected" | "degraded" | "error";

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  not_connected: "Not Connected",
  connected: "Connected",
  degraded: "Degraded",
  error: "Error",
};

/** Per-tenant Connect Pro integration configuration. Secrets are mock-only —
 *  never stored in plain text; `webhook_secret_status` tracks setup state. */
export interface ConnectProIntegrationConfig {
  tenant_id: string;
  enabled: boolean;
  connection_status: ConnectionStatus;
  external_location_id: string | null;
  default_sync_enabled: boolean;
  payment_sync_enabled: boolean;
  billing_event_sync_enabled: boolean;
  customer_sync_enabled: boolean;
  /** Mock-only: "configured" | "missing" | "invalid". Never the secret itself. */
  webhook_secret_status: "configured" | "missing" | "invalid";
  last_successful_sync_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// External entity reference registry
// ---------------------------------------------------------------------------

export type ExternalEntityType =
  | "customer"
  | "rental"
  | "billing_period"
  | "invoice"
  | "payment"
  | "damage_claim"
  | "deposit";

/** Stable mapping between a Fleet internal entity and an external-system id.
 *  The registry key is (tenant + system + entity_type + external_id) so the
 *  same external id string may exist across tenants without collision. */
export interface ExternalEntityReference {
  id: string;
  tenant_id: string;
  system: IntegrationSystem;
  entity_type: ExternalEntityType;
  internal_id: string;
  external_id: string;
  external_parent_id: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Integration events (outbox + inbox)
// ---------------------------------------------------------------------------

export type EventDirection = "outbound" | "inbound";

export type EventStatus =
  "pending" | "processing" | "succeeded" | "failed" | "dead_letter" | "ignored";

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  succeeded: "Succeeded",
  failed: "Failed",
  dead_letter: "Dead Letter",
  ignored: "Ignored",
};

/** Standardized failure categories for review/diagnostics. */
export type EventFailureType =
  | "validation"
  | "authentication"
  | "mapping"
  | "conflict"
  | "transient_delivery"
  | "unsupported"
  | "internal";

/** Outbound event types Fleet emits to inform Connect Pro. */
export type OutboundEventType =
  | "customer.created_or_updated"
  | "rental.started"
  | "rental.updated"
  | "billing_period.created"
  | "payment.due"
  | "payment.due_soon"
  | "payment.late"
  | "late_fee.applied"
  | "balance.changed"
  | "payment.received"
  | "payment.reversed"
  | "arrangement.created"
  | "arrangement.broken"
  | "deposit.applied"
  | "damage_charge.posted"
  | "rental.completed";

/** Inbound event types Connect Pro / processors send to Fleet. */
export type InboundEventType =
  "payment.recorded" | "payment.reversed_external" | "customer.updated";

export type IntegrationEventType = OutboundEventType | InboundEventType;

/** A single sync event. Outbound = Fleet → Connect Pro (outbox); inbound =
 *  Connect Pro → Fleet (inbox). Idempotency is by `event_key`. */
export interface IntegrationEvent {
  id: string;
  tenant_id: string;
  integration: IntegrationSystem;
  event_type: IntegrationEventType;
  direction: EventDirection;
  entity_type: ExternalEntityType | null;
  entity_id: string | null;
  external_entity_id: string | null;
  /** Strongly-typed payload (sanitized of secrets before display). */
  payload: IntegrationEventPayload;
  /** Stable idempotency key — repeated delivery never duplicates the effect. */
  event_key: string;
  status: EventStatus;
  attempts: number;
  last_attempt_at: string | null;
  processed_at: string | null;
  error_code: EventFailureType | null;
  error_message: string | null;
  /** Where this event originated (loop prevention). */
  origin_system: SyncOrigin;
  /** The external event that caused this one (lineage / loop prevention). */
  origin_event_id: string | null;
  /** Schema version for forward-compatible contract evolution. */
  schema_version: number;
  created_at: string;
}

/** Discriminated payload union. Keeps the contract strongly typed internally
 *  rather than `payload: any`. */
export type IntegrationEventPayload =
  | {
      kind: "payment_due";
      customer_id: string;
      rental_id: string;
      billing_period_id: string;
      invoice_id: string | null;
      due_amount: number;
      outstanding_amount: number;
      due_date: string;
      due_time: string | null;
      timezone: string;
      vehicle_label: string | null;
    }
  | {
      kind: "payment_due_soon";
      customer_id: string;
      rental_id: string;
      billing_period_id: string;
      due_amount: number;
      due_date: string;
      due_time: string | null;
      timezone: string;
    }
  | {
      kind: "payment_late";
      customer_id: string;
      rental_id: string;
      billing_period_id: string | null;
      due_at: string;
      late_since: string;
      balance: number;
      late_amount: number;
      grace_active: boolean;
      late_fee_applied: boolean;
    }
  | {
      kind: "late_fee_applied";
      customer_id: string;
      rental_id: string;
      amount: number;
      billing_period_id: string | null;
    }
  | {
      kind: "balance_changed";
      customer_id: string;
      rental_id: string;
      prior_balance: number | null;
      new_balance: number;
      reason: string;
      related_transaction_id: string | null;
      is_paid_in_full: boolean;
      is_late: boolean;
    }
  | {
      kind: "payment_received";
      customer_id: string;
      rental_id: string;
      amount: number;
      tender_method: string;
      processor: string | null;
      external_payment_id: string | null;
      external_transaction_id: string | null;
      paid_at: string;
    }
  | {
      kind: "payment_reversed";
      customer_id: string;
      rental_id: string;
      amount: number;
      reason: string | null;
      related_transaction_id: string | null;
    }
  | {
      kind: "billing_period_created";
      customer_id: string;
      rental_id: string;
      billing_period_id: string;
      sequence_number: number;
      period_start: string;
      period_end: string;
      due_at: string;
      due_time: string | null;
      total_amount: number;
      billing_frequency: string;
    }
  | {
      kind: "rental_started";
      customer_id: string;
      rental_id: string;
      vehicle_id: string;
      agreement_number: string;
      start_date: string;
      billing_frequency: string;
      recurring_amount: number | null;
    }
  | {
      kind: "rental_completed";
      customer_id: string;
      rental_id: string;
      completed_at: string;
      final_balance: number;
    }
  | {
      kind: "arrangement_created";
      customer_id: string;
      rental_id: string;
      arrangement_id: string;
      total_arranged: number;
      collectible_remaining: number;
      next_promise_date: string | null;
      next_promise_amount: number | null;
    }
  | {
      kind: "arrangement_broken";
      customer_id: string;
      rental_id: string;
      arrangement_id: string;
      missed_amount: number;
      missed_date: string | null;
    }
  | {
      kind: "deposit_applied";
      customer_id: string;
      rental_id: string;
      amount: number;
      remaining_held: number;
    }
  | {
      kind: "damage_charge_posted";
      customer_id: string;
      rental_id: string;
      damage_claim_id: string;
      amount: number;
    }
  | {
      kind: "customer_updated";
      customer_id: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      email: string | null;
    }
  | {
      kind: "inbound_payment";
      external_event_id: string;
      external_payment_id: string | null;
      customer_external_id: string | null;
      rental_external_id: string | null;
      billing_period_external_id: string | null;
      invoice_external_id: string | null;
      amount: number;
      tender_method: string;
      processor: string | null;
      payment_source: string;
      paid_at: string;
      reference: string | null;
      external_transaction_id: string | null;
      notes: string | null;
    }
  | {
      kind: "inbound_reversal";
      external_event_id: string;
      external_payment_id: string;
      amount: number;
      reason: string | null;
    }
  | { kind: "generic" };

// ---------------------------------------------------------------------------
// Sync review queue
// ---------------------------------------------------------------------------

export type ReviewType =
  | "unmatched_payment"
  | "duplicate_warning"
  | "conflict"
  | "failed_event"
  | "unknown_customer"
  | "unknown_rental";

export type ReviewSeverity = "info" | "warning" | "error" | "blocking";

export type ReviewStatus = "open" | "resolved";

export type ReviewResolution =
  "matched" | "ignored" | "duplicate" | "conflict_kept" | "posted" | null;

/** An inbound event that needs a human decision before any money moves. */
export interface IntegrationReviewItem {
  id: string;
  tenant_id: string;
  event_id: string;
  review_type: ReviewType;
  severity: ReviewSeverity;
  status: ReviewStatus;
  reason: string;
  /** Candidate Fleet entity ids the reviewer may choose from. */
  candidate_entity_ids: Record<string, string[]>;
  resolution: ReviewResolution;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Payment acknowledgement (returned to the transport / future webhook)
// ---------------------------------------------------------------------------

export type PaymentAckStatus =
  "accepted" | "duplicate" | "needs_review" | "conflict" | "rejected";

export interface PaymentAck {
  status: PaymentAckStatus;
  transaction_id: string | null;
  message: string;
}

// ---------------------------------------------------------------------------
// Transport abstraction
// ---------------------------------------------------------------------------

/** Provider-neutral result of attempting to deliver an event. */
export type DeliveryResult =
  | { ok: true; provider_message_id?: string }
  | {
      ok: false;
      reason: string;
      retryable: boolean;
      failure_type: EventFailureType;
    };

/** Abstraction over the sync transport. V1 = MockConnectProTransport. A real
 *  adapter later implements the same interface without touching domain stores. */
export interface IntegrationTransport {
  sendEvent(event: IntegrationEvent): DeliveryResult;
  testConnection(): { ok: boolean; message: string };
}
