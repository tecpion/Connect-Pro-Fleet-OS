// Connect Pro Fleet — deposit ledger posting helper (Build #8 / cleanup).
//
// Posts a deposit-linked FinancialTransaction tagged with deposit_id AND a
// semantic deposit_kind so selectors can treat each kind correctly:
//   collection  — held cash in (NOT rental revenue)
//   application — held funds applied to an existing charge (reduces obligation)
//   refund      — held funds returned (NOT negative revenue)
//   forfeiture  — held funds retained as recognized revenue (a real charge)
//   reversal    — undoes a prior deposit event (carries reversal_of = original kind)
// The ledger remains the financial source of truth; deposit_kind is metadata
// that lets revenue/obligation selectors distinguish held money from
// obligation settlement without blanket-excluding deposit transactions.

import type { FinancialTransaction, PaymentMethod } from "../types";
import type { DepositKind } from "../deposit";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";

export function postDepositTransaction(
  s: StoreState,
  input: {
    depositId: string;
    rentalId: string | null;
    reservationId: string | null;
    customerId: string;
    vehicleId: string | null;
    transactionType: FinancialTransaction["transaction_type"];
    category: FinancialTransaction["category"];
    description: string;
    amount: number;
    direction: FinancialTransaction["direction"];
    paymentMethod?: PaymentMethod | null;
    notes?: string | null;
    relatedTransactionId?: string | null;
    /** Semantic kind of this deposit movement. */
    depositKind: DepositKind;
    /** For reversals: the kind of the original event being reversed. */
    reversalOf?: DepositKind | null;
  },
): string {
  const now = new Date().toISOString();
  const txn: FinancialTransaction = {
    id: uid("txn"),
    tenant_id: TENANT_ID,
    rental_id: input.rentalId ?? "",
    reservation_id: input.reservationId,
    customer_id: input.customerId,
    vehicle_id: input.vehicleId,
    invoice_id: null,
    deposit_id: input.depositId,
    transaction_type: input.transactionType,
    category: input.category,
    description: input.description,
    amount: input.amount,
    direction: input.direction,
    payment_method: input.paymentMethod ?? null,
    external_transaction_id: null,
    status: "posted",
    effective_date: now.slice(0, 10),
    created_at: now,
    created_by: s.currentStaffId,
    notes: input.notes ?? null,
    related_transaction_id: input.relatedTransactionId ?? null,
    billing_period: null,
    metadata: {
      deposit: true,
      deposit_kind: input.depositKind,
      ...(input.reversalOf ? { reversal_of: input.reversalOf } : {}),
    },
  };
  s.setTransactions((ts) => [...ts, txn]);
  return txn.id;
}
