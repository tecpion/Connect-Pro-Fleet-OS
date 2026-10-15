// Connect Pro Fleet — ledger → integration event emission (Build #21).
//
// Extracted from ledgerStore.ts to keep that module under the line limit.
// Emits outbound sync events for payment posting, payment reversal (void),
// and late-fee application. All events carry origin_system="fleet" so an
// inbound echo of Fleet's own action is recognized as a duplicate, never
// re-posted (loop prevention). Emission is gated on `emitter.enabled` — if
// the integration is disabled, emission is a safe no-op and the financial
// action still succeeds.

import { getIntegrationEmitter } from "../integrationEmitterRef";
import { rentalTransactions, summarize } from "../ledger";
import type { FinancialTransaction } from "../types";
import type { StoreState } from "./storeState";

/** Emit PAYMENT_RECEIVED + BALANCE_CHANGED for a Fleet-originated payment.
 *  Skipped for payments whose source is Connect Pro (those post their own
 *  events with the inbound event as origin — see integrationInbox). */
export function emitPaymentPosted(
  s: StoreState,
  txn: FinancialTransaction,
  updatedTxns: FinancialTransaction[],
  paymentSource?: string | null,
) {
  const emitter = getIntegrationEmitter();
  if (!emitter.enabled) return;
  if (paymentSource?.startsWith("connect_pro")) return;
  if (!txn.rental_id) return;
  const newBalance = summarize(
    rentalTransactions(updatedTxns, txn.rental_id),
  ).balance;
  const tender =
    (txn.metadata as { tender_method?: string } | null)?.tender_method ??
    "other";
  const processor =
    (txn.metadata as { processor?: string | null } | null)?.processor ?? null;
  emitter.enqueueOutbound({
    event_type: "payment.received",
    entity_type: "payment",
    entity_id: txn.id,
    payload: {
      kind: "payment_received",
      customer_id: txn.customer_id,
      rental_id: txn.rental_id,
      amount: txn.amount,
      tender_method: tender,
      processor,
      external_payment_id: null,
      external_transaction_id: txn.external_transaction_id,
      paid_at: txn.created_at,
    },
    event_key: `outbound_payment_received:fleet:${txn.id}`,
    origin_system: "fleet",
  });
  emitter.enqueueOutbound({
    event_type: "balance.changed",
    entity_type: "rental",
    entity_id: txn.rental_id,
    payload: {
      kind: "balance_changed",
      customer_id: txn.customer_id,
      rental_id: txn.rental_id,
      prior_balance: newBalance + txn.amount,
      new_balance: newBalance,
      reason: "payment_received",
      related_transaction_id: txn.id,
      is_paid_in_full: newBalance <= 0,
      is_late: false,
    },
    event_key: `outbound_balance_changed:fleet:${txn.id}`,
    origin_system: "fleet",
  });
}

/** Emit PAYMENT_REVERSED + BALANCE_CHANGED when a payment is voided. */
export function emitPaymentReversed(
  s: StoreState,
  original: FinancialTransaction,
  reversalId: string,
  reason?: string,
) {
  const emitter = getIntegrationEmitter();
  if (!emitter.enabled) return;
  if (original.category !== "payment") return;
  emitter.enqueueOutbound({
    event_type: "payment.reversed",
    entity_type: "payment",
    entity_id: original.id,
    payload: {
      kind: "payment_reversed",
      customer_id: original.customer_id,
      rental_id: original.rental_id,
      amount: original.amount,
      reason: reason ?? null,
      related_transaction_id: original.id,
    },
    event_key: `outbound_payment_reversed:fleet:${reversalId}`,
    origin_system: "fleet",
  });
  if (original.rental_id) {
    const newBal = summarize(
      rentalTransactions(s.transactions, original.rental_id),
    ).balance;
    emitter.enqueueOutbound({
      event_type: "balance.changed",
      entity_type: "rental",
      entity_id: original.rental_id,
      payload: {
        kind: "balance_changed",
        customer_id: original.customer_id,
        rental_id: original.rental_id,
        prior_balance: newBal - original.amount,
        new_balance: newBal,
        reason: "payment_reversed",
        related_transaction_id: original.id,
        is_paid_in_full: newBal <= 0,
        is_late: newBal > 0,
      },
      event_key: `outbound_balance_changed:fleet:${reversalId}`,
      origin_system: "fleet",
    });
  }
}

/** Emit LATE_FEE_APPLIED — Fleet is authoritative; Connect Pro only notifies. */
export function emitLateFeeApplied(
  rentalId: string,
  customerId: string,
  amount: number,
  txnId: string,
) {
  const emitter = getIntegrationEmitter();
  if (!emitter.enabled) return;
  emitter.enqueueOutbound({
    event_type: "late_fee.applied",
    entity_type: "rental",
    entity_id: rentalId,
    payload: {
      kind: "late_fee_applied",
      customer_id: customerId,
      rental_id: rentalId,
      amount,
      billing_period_id: null,
    },
    event_key: `outbound_late_fee:fleet:${txnId}`,
    origin_system: "fleet",
  });
}
