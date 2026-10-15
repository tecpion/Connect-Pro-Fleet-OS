// Connect Pro Fleet — seed: payment arrangements (Build #10).
//
// Seeded against an existing rental with an outstanding balance so the promise
// lifecycle is testable from demo data. A promise is NOT a payment — these
// arrangements do not post any ledger entries; they only record the customer's
// promised schedule and link to actual payments that already exist in the ledger.

import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
  ArrangementEvent,
} from "../paymentArrangementTypes";
import { TENANT_ID } from "./ids";

// rnt_3 — Marcus Delgado, weekly Tesla rental, has an outstanding balance.
// He agreed to pay it back in two weekly installments. One installment is
// already satisfied by an existing ledger payment; the next is upcoming.
export const paymentArrangements: PaymentArrangement[] = [
  {
    id: "pa_1",
    tenant_id: TENANT_ID,
    arrangement_number: "PA-2026-000001",
    customer_id: "cus_3",
    rental_id: "rnt_3",
    invoice_id: null,
    billing_period_ids: [],
    original_outstanding_amount: 750,
    arrangement_amount: 750,
    status: "active",
    start_date: "2026-08-20",
    grace_period_days: 1,
    terms_summary: "$375 today, $375 next Friday",
    reason: "Customer requested split payment after partial week.",
    created_by: "stf_2",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    completed_at: null,
    broken_at: null,
    cancelled_at: null,
  },
];

export const arrangementInstallments: PaymentArrangementInstallment[] = [
  {
    id: "ins_1",
    tenant_id: TENANT_ID,
    arrangement_id: "pa_1",
    sequence: 1,
    amount_due: 375,
    due_date: "2026-08-20",
    // Linked to an existing posted payment on rnt_3 (txn_5 in seedFinancials).
    linked_payment_transaction_ids: ["txn_5"],
    linked_payments: [{ transaction_id: "txn_5", amount: 375 }],
    paid_at: "2026-08-20T11:30:00Z",
    notes: "First installment paid on time.",
    created_at: "2026-08-20T10:00:00Z",
  },
  {
    id: "ins_2",
    tenant_id: TENANT_ID,
    arrangement_id: "pa_1",
    sequence: 2,
    amount_due: 375,
    due_date: "2026-08-27",
    linked_payment_transaction_ids: [],
    linked_payments: [],
    paid_at: null,
    notes: null,
    created_at: "2026-08-20T10:00:00Z",
  },
];

export const arrangementEvents: ArrangementEvent[] = [
  {
    id: "aev_1",
    tenant_id: TENANT_ID,
    arrangement_id: "pa_1",
    type: "created",
    label: "Payment arrangement created — $375 today, $375 next Friday",
    at: "2026-08-20T10:00:00Z",
    staff_id: "stf_2",
    amount: 750,
    installment_id: null,
    notes: "Customer requested split payment after partial week.",
  },
  {
    id: "aev_2",
    tenant_id: TENANT_ID,
    arrangement_id: "pa_1",
    type: "payment_linked",
    label: "Payment linked to installment 1 — $375",
    at: "2026-08-20T11:30:00Z",
    staff_id: "stf_2",
    amount: 375,
    installment_id: "ins_1",
    notes: null,
  },
  {
    id: "aev_3",
    tenant_id: TENANT_ID,
    arrangement_id: "pa_1",
    type: "installment_paid",
    label: "Installment 1 paid — $375",
    at: "2026-08-20T11:30:00Z",
    staff_id: "stf_2",
    amount: 375,
    installment_id: "ins_1",
    notes: null,
  },
];
