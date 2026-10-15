// Connect Pro Fleet — inbound payment payload + entity resolution helpers
// (Build #21 final cleanup). Extracted from integrationInbox.ts to keep that
// module under the line limit.

import type { IntegrationEventPayload } from "./integrationTypes";
import type { TenderMethod, PaymentProcessor } from "./paymentMethodTypes";

export type InboundPaymentInput = {
  external_event_id: string;
  external_payment_id?: string | null;
  customer_external_id?: string | null;
  rental_external_id?: string | null;
  billing_period_external_id?: string | null;
  invoice_external_id?: string | null;
  amount: number;
  tender_method: TenderMethod | string;
  processor?: PaymentProcessor | null;
  payment_source?: string;
  paid_at?: string;
  reference?: string | null;
  external_transaction_id?: string | null;
  notes?: string | null;
};

/** Build the strongly-typed inbound_payment payload. */
export function inboundPayload(
  input: InboundPaymentInput,
): Extract<IntegrationEventPayload, { kind: "inbound_payment" }> {
  return {
    kind: "inbound_payment",
    external_event_id: input.external_event_id,
    external_payment_id: input.external_payment_id ?? null,
    customer_external_id: input.customer_external_id ?? null,
    rental_external_id: input.rental_external_id ?? null,
    billing_period_external_id: input.billing_period_external_id ?? null,
    invoice_external_id: input.invoice_external_id ?? null,
    amount: input.amount,
    tender_method: String(input.tender_method),
    processor: input.processor ?? null,
    payment_source: input.payment_source ?? "connect_pro",
    paid_at: input.paid_at ?? new Date().toISOString(),
    reference: input.reference ?? null,
    external_transaction_id: input.external_transaction_id ?? null,
    notes: input.notes ?? null,
  };
}
