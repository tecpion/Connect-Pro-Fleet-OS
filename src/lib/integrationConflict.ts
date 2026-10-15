// Connect Pro Fleet — inbound payment conflict detection (Build #21 cleanup).
//
// Determines whether an inbound payment carrying the SAME external_payment_id
// as an already-processed Fleet payment is a genuine duplicate (identical
// financial data) or a CONFLICT (materially incompatible data). Conflicts
// must NOT post a second payment — they route to the review queue.
//
// Material conflicts (entity/financial identity mismatches):
//  - different amount
//  - different rental
//  - different customer
//  - different processor transaction id
//  - reversed vs paid state contradiction
// Harmless supplemental metadata (e.g. a new reference note) is NOT a conflict.

import type { FinancialTransaction } from "./types";
import type { PaymentProcessor } from "./paymentMethodTypes";

/** Synchronous record of a posted Fleet payment keyed by external_payment_id,
 *  so conflict detection works within one batched act() (the registry /
 *  transactions arrays are stale until React flushes). */
export interface PostedPaymentRef {
  txnId: string;
  amount: number;
  rentalId: string | null;
  customerId: string | null;
  processor: string | null;
  externalTxnId: string | null;
  status: string;
}

export type PostedPaymentRefMap = Map<string, PostedPaymentRef>;

/** Resolve an already-processed Fleet payment by external_payment_id. Checks
 *  the synchronous ref map first, then the registry + ledger. Returns the
 *  FinancialTransaction (real or synthesized from the ref) or null. */
export function lookupExistingPayment(args: {
  externalPaymentId: string;
  refMap: PostedPaymentRefMap;
  findTxn: (id: string) => FinancialTransaction | undefined;
  resolveInternalId: (externalId: string) => string | null;
}): { txn: FinancialTransaction } | null {
  const refEntry = args.refMap.get(args.externalPaymentId);
  if (refEntry) {
    const txn = args.findTxn(refEntry.txnId);
    if (txn) return { txn };
    // Ref entry exists but the txn isn't flushed yet — synthesize a minimal
    // view from the ref data so conflict detection still works. Cast through
    // `unknown` because the partial object is intentionally incomplete.
    return {
      txn: {
        id: refEntry.txnId,
        amount: refEntry.amount,
        rental_id: refEntry.rentalId,
        customer_id: refEntry.customerId,
        external_transaction_id: refEntry.externalTxnId,
        status: refEntry.status,
        metadata: { processor: refEntry.processor },
      } as unknown as FinancialTransaction,
    };
  }
  const existingTxnId = args.resolveInternalId(args.externalPaymentId);
  if (existingTxnId) {
    const txn = args.findTxn(existingTxnId);
    if (txn) return { txn };
  }
  return null;
}

export interface InboundPaymentInput {
  amount: number;
  rental_external_id?: string | null;
  customer_external_id?: string | null;
  processor?: PaymentProcessor | null;
  external_transaction_id?: string | null;
}

/** Returns a human-readable conflict reason, or null if the data is identical
 *  (a genuine duplicate). */
export function detectPaymentConflict(
  existing: FinancialTransaction,
  input: InboundPaymentInput,
): string | null {
  // Amount mismatch.
  if (round2(existing.amount) !== round2(input.amount)) {
    return `amount mismatch (existing ${existing.amount}, incoming ${input.amount})`;
  }
  // Processor transaction id mismatch (a different processor charge for the
  // same external payment id is a contradiction).
  const existingTxnId = existing.external_transaction_id ?? null;
  const incomingTxnId = input.external_transaction_id ?? null;
  if (existingTxnId && incomingTxnId && existingTxnId !== incomingTxnId) {
    return `external_transaction_id mismatch (existing ${existingTxnId}, incoming ${incomingTxnId})`;
  }
  // Reversed/voided vs paid contradiction. TransactionStatus is "posted" |
  // "voided"; a voided payment means it was reversed/voided, which contradicts
  // a fresh "paid" inbound for the same external payment id.
  if (existing.status === "voided") {
    return `existing payment is ${existing.status}`;
  }
  // Rental mismatch — the inbound references a different rental than the one
  // the existing payment was posted to. We compare the resolved rental id
  // stored on the existing transaction against the inbound rental external id
  // (resolved by the caller). To keep this helper pure, the caller passes the
  // resolved incoming rental id via metadata on `input` when available.
  return null;
}

/** Compare the resolved incoming rental/customer against the existing payment.
 *  Returns a conflict reason or null. Used by the inbox after it resolves the
 *  inbound external rental/customer ids. */
export function detectEntityConflict(
  existing: FinancialTransaction,
  resolved: {
    rentalId?: string | null;
    customerId?: string | null;
  },
): string | null {
  if (
    resolved.rentalId &&
    existing.rental_id &&
    resolved.rentalId !== existing.rental_id
  ) {
    return `rental mismatch (existing ${existing.rental_id}, incoming ${resolved.rentalId})`;
  }
  if (
    resolved.customerId &&
    existing.customer_id &&
    resolved.customerId !== existing.customer_id
  ) {
    return `customer mismatch (existing ${existing.customer_id}, incoming ${resolved.customerId})`;
  }
  return null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
