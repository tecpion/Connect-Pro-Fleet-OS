// Connect Pro Fleet — payment arrangement context interface (Build #10).
//
// Extracted from storeContext.ts to keep that file under the line limit. The
// FleetStore interface composes this so the public `useStore()` API exposes
// payment arrangement methods without bloating the main interface file.

import type {
  ArrangementEvent,
  PaymentArrangement,
  PaymentArrangementInstallment,
} from "../paymentArrangementTypes";

export interface PaymentArrangementMethods {
  arrangementsForRental: (rentalId: string) => PaymentArrangement[];
  activeArrangementForRental: (rentalId: string) => PaymentArrangement | null;
  arrangementsForCustomer: (customerId: string) => PaymentArrangement[];
  installmentsForArrangement: (
    arrangementId: string,
  ) => PaymentArrangementInstallment[];
  arrangementEventLog: (arrangementId: string) => ArrangementEvent[];
  createPaymentArrangement: (input: {
    customerId: string;
    rentalId?: string | null;
    invoiceId?: string | null;
    billingPeriodIds?: string[];
    arrangementAmount: number;
    originalOutstandingAmount: number;
    startDate: string;
    gracePeriodDays?: number;
    termsSummary: string;
    reason?: string | null;
    installments: { amount: number; due_date: string }[];
  }) => { ok: boolean; error?: string; arrangementId?: string };
  restructureArrangement: (
    arrangementId: string,
    input: {
      newInstallments: { amount: number; due_date: string }[];
      termsSummary: string;
      reason?: string | null;
    },
  ) => { ok: boolean; error?: string };
  cancelArrangement: (arrangementId: string, reason: string) => void;
  linkPaymentToArrangement: (
    arrangementId: string,
    paymentTxnId: string,
    txn?: import("../types").FinancialTransaction | null,
  ) => void;
  refreshArrangementStatuses: () => void;
}
