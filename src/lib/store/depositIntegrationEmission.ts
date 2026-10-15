// Connect Pro Fleet — deposit → integration event emission (Build #21).
//
// Emits DEPOSIT_APPLIED + BALANCE_CHANGED when a held deposit is applied to
// charges. Deposit application is NOT a new customer payment, so we emit
// deposit.applied (not payment.received) AND the authoritative balance.changed
// so Connect Pro can stop reminders / update the invoice. Emission is a safe
// no-op when the integration is disabled.

import { getIntegrationEmitter } from "../integrationEmitterRef";
import type { RentalDeposit } from "../depositTypes";

export function emitDepositApplied(
  deposit: RentalDeposit,
  txnId: string,
  amount: number,
  remainingHeld: number,
  newBalance?: number,
) {
  const emitter = getIntegrationEmitter();
  if (!emitter.enabled) return;
  if (!deposit.rental_id) return;
  emitter.enqueueOutbound({
    event_type: "deposit.applied",
    entity_type: "deposit",
    entity_id: deposit.id,
    payload: {
      kind: "deposit_applied",
      customer_id: deposit.customer_id,
      rental_id: deposit.rental_id,
      amount,
      remaining_held: remainingHeld,
    },
    event_key: `outbound_deposit_applied:${txnId}`,
    origin_system: "fleet",
  });
  // Authoritative balance change so Connect Pro can stop reminders. Deposit
  // application reduces the customer's outstanding obligation — it is not a
  // new payment, so we do NOT emit payment.received.
  emitter.enqueueOutbound({
    event_type: "balance.changed",
    entity_type: "rental",
    entity_id: deposit.rental_id,
    payload: {
      kind: "balance_changed",
      customer_id: deposit.customer_id,
      rental_id: deposit.rental_id,
      prior_balance: null,
      new_balance: newBalance ?? 0,
      reason: "deposit_applied",
      related_transaction_id: txnId,
      is_paid_in_full: (newBalance ?? 0) <= 0,
      is_late: (newBalance ?? 0) > 0,
    },
    event_key: `outbound_balance_changed:deposit:${txnId}`,
    origin_system: "fleet",
  });
}
