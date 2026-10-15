// Connect Pro Fleet — V1 Tolls & Violations Automation: Connect Pro CRM
// outbound event contract (MOCK only — no live CRM calls).
//
// Fleet OS is the authoritative owner of toll/violation workflow. When a
// toll/violation reaches a customer-facing milestone, Fleet EMITS an outbound
// CRM event so Connect Pro can later communicate with the renter (send notice,
// reminder, receipt). V1 only RECORDS these events — no live delivery, no CRM
// credentials, no network. A production developer wires real transport later.
//
// These events are DERIVED from authoritative Fleet records (violation +
// customer charge + rental). They never carry provider secrets. They reference
// the customer/rental/violation by id so Connect Pro resolves renter contact
// info from its own authoritative records (tenant-safe, no PII duplication).

/** Outbound CRM event types for tolls & violations. */
export type TollViolationOutboundEventType =
  | "toll.customer_charge_created"
  | "violation.customer_charge_created"
  | "violation.disputed"
  | "violation.resolved";

export const TOLL_VIOLATION_OUTBOUND_EVENT_LABELS: Record<
  TollViolationOutboundEventType,
  string
> = {
  "toll.customer_charge_created": "Toll Charge Created",
  "violation.customer_charge_created": "Violation Charge Created",
  "violation.disputed": "Violation Disputed",
  "violation.resolved": "Violation Resolved",
};

/** A mock outbound CRM event. `delivery_state` is "recorded" only in V1. */
export interface TollViolationOutboundEvent {
  id: string;
  organization_id: string;
  event_type: TollViolationOutboundEventType;
  /** The Fleet violation the event refers to. */
  violation_id: string;
  /** Customer charge transaction (rental ledger) when applicable. */
  customer_charge_transaction_id: string | null;
  rental_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  /** Normalized payload for Connect Pro — ids only, never PII/secrets. */
  payload: Record<string, unknown>;
  /** Mock delivery state — "recorded" only (no live transport in V1). */
  delivery_state: "recorded";
  created_at: string;
}

/** Build the payload for an outbound event from authoritative fields. Pure. */
export function buildTollViolationOutboundPayload(input: {
  violation_number: string;
  violation_type: string;
  amount: number | null;
  occurred_at: string | null;
  due_at: string | null;
  dispute_reason?: string | null;
  resolution_note?: string | null;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    violation_number: input.violation_number,
    violation_type: input.violation_type,
    occurred_at: input.occurred_at,
    due_at: input.due_at,
  };
  if (input.amount != null) out.amount = input.amount;
  if (input.dispute_reason) out.dispute_reason = input.dispute_reason;
  if (input.resolution_note) out.resolution_note = input.resolution_note;
  return out;
}
