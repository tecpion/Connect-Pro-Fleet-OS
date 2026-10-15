// Connect Pro Fleet — financial timeline normalizers (Build #27).
//
// Transforms authoritative FinancialTransaction records into payment/billing
// timeline events. Voided transactions are excluded (they are not operational
// history the customer/vehicle timeline should surface). Refunds are direction
// "out"; payments are direction "in". The amount is carried for permission-gated
// rendering — the permission filter strips it before display when the viewer
// lacks financial permission.

import type { FinancialTransaction } from "./chargeTypes";
import type { UnifiedTimelineEvent } from "./timelineTypes";
import { timelineId } from "./timelineShared";

/** A single payment/billing event for a transaction, or null when the
 *  transaction should not appear (voided). */
export function paymentTimelineEvents(
  txn: FinancialTransaction,
): UnifiedTimelineEvent | null {
  if (txn.status === "voided") return null;

  const isPayment = txn.category === "payment";
  const isRefund = txn.category === "refund";
  const direction: "in" | "out" = isRefund ? "out" : "in";

  let event_type = "payment_recorded";
  let category: UnifiedTimelineEvent["category"] = "payment";
  let title = "Payment recorded";
  if (isRefund) {
    event_type = "refund_issued";
    title = "Refund issued";
    category = "payment";
  } else if (txn.category === "charge") {
    event_type = "charge_posted";
    title = "Charge posted";
    category = "billing";
  } else if (txn.category === "credit") {
    event_type = "credit_applied";
    title = "Credit applied";
    category = "billing";
  }

  return {
    id: timelineId("transactions", txn.id, event_type),
    occurred_at: txn.effective_date,
    event_type,
    category,
    title,
    description: txn.description,
    entity_type: "rental",
    entity_id: txn.rental_id,
    related_entity_type: txn.customer_id ? "customer" : null,
    related_entity_id: txn.customer_id ?? null,
    source_module: "ledger",
    actor_id: txn.created_by,
    actor_name: null,
    financial_amount: txn.amount,
    financial_direction: isPayment || isRefund ? direction : null,
    severity: "info",
    status: txn.status,
    deep_link: txn.rental_id ? `/rentals/${txn.rental_id}` : null,
    metadata: {
      payment_method: txn.payment_method ?? null,
      transaction_type: txn.transaction_type,
    },
    sensitive: false,
    customer_id: txn.customer_id,
    vehicle_id: txn.vehicle_id ?? null,
    rental_id: txn.rental_id,
  };
}
