// Connect Pro Fleet — DepositMethods interface (Build #8 / Build #12 split).
// Extracted from storeContext to keep it under the line limit.

import type { PaymentMethod } from "../types";
import type { RentalDeposit, ForfeitureReason } from "../depositTypes";

export interface DepositMethods {
  depositForReservation: (reservationId: string) => RentalDeposit | null;
  depositForRental: (rentalId: string) => RentalDeposit | null;
  depositForCustomer: (customerId: string) => RentalDeposit[];
  ensureDepositForReservation: (input: {
    reservationId: string;
    customerId: string;
    vehicleId: string | null;
    requiredAmount: number;
    policyId?: string | null;
    source: "vehicle_override" | "class" | "company_default" | "manual";
    policyName?: string | null;
    className?: string | null;
  }) => RentalDeposit;
  linkDepositToRental: (reservationId: string, rentalId: string) => void;
  collectDeposit: (
    depositId: string,
    input: {
      amount: number;
      method: PaymentMethod;
      reference?: string;
      notes?: string;
    },
    requestKey: string,
  ) => { ok: boolean; error?: string };
  applyDeposit: (
    depositId: string,
    input: { amount: number; notes?: string },
    requestKey: string,
  ) => { ok: boolean; error?: string };
  refundDeposit: (
    depositId: string,
    input: { amount: number; method: PaymentMethod; notes?: string },
    requestKey: string,
  ) => { ok: boolean; error?: string };
  markRefundPending: (depositId: string) => void;
  forfeitDeposit: (
    depositId: string,
    input: { amount: number; reason: ForfeitureReason; notes?: string },
    requestKey: string,
  ) => { ok: boolean; error?: string };
  overrideDepositRequirement: (
    depositId: string,
    input: { newRequiredAmount: number; reason: string },
  ) => { ok: boolean; error?: string };
  reverseDepositAction: (historyEventId: string, reason: string) => void;
  cancelDeposit: (depositId: string, reason?: string) => void;
  /** Build #19 — migrate a pre-existing held deposit from a previous system.
   *  Creates a RentalDeposit in "held" status with the collected amount
   *  pre-set, and posts a held-money ledger transaction tagged with
   *  deposit_kind "collection" + metadata.migration so it's excluded from
   *  current-period collections/revenue. NOT a current-day cash collection. */
  migrateHeldDeposit: (input: {
    rental_id: string;
    customer_id: string;
    vehicle_id: string | null;
    amount: number;
    method: PaymentMethod;
    notes?: string | null;
  }) => string;
}
