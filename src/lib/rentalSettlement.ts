// Connect Pro Fleet — rental settlement selector (Build #5 / Build #8 cleanup).
//
// Derives a final rental settlement from the authoritative ledger so the
// Return workflow and Rental Detail never calculate final balance
// independently. Categorizes charges by type and resolves deposit handling.
//
// Build #8 cleanup — deposit semantics:
// Previously every deposit-tagged transaction was excluded, which meant a
// deposit APPLICATION never reduced the customer's outstanding obligation and
// a FORFEITURE was never recognized as revenue. Now we apply deposit
// semantics: held collection/refund are excluded from the obligation, but an
// application reduces it (like a payment) and a forfeiture is a recognized
// charge. The final balance is two-way: customer_balance_due (customer owes
// company) vs deposit_refund_due (company owes customer).

import type {
  FinancialTransaction,
  RentalAgreement,
  TransactionType,
} from "./types";
import type { RentalDeposit } from "./depositTypes";
import {
  affectsRentalObligation,
  getDepositSettlementImpact,
  isDepositHeldEvent,
  obligationSignedAmount,
} from "./deposit";

export interface RentalSettlement {
  rentalCharges: number;
  addons: number;
  lateFees: number;
  damageCharges: number;
  ticketCharges: number;
  fuelCharges: number;
  mileageCharges: number;
  otherCharges: number;
  totalCharges: number;
  credits: number;
  payments: number;
  refunds: number;
  depositCollected: number;
  depositApplied: number;
  depositRefunded: number;
  depositForfeited: number;
  depositHeld: number;
  /** Refund the company still owes the customer from the held deposit. */
  depositRefundDue: number;
  outstandingBalance: number;
  /** Overpayment / account credit beyond all charges. */
  accountCredit: number;
  /** What the customer still owes the company (charges − payments − credits − deposit applied). */
  customerBalanceDue: number;
  /** What the company owes the customer (refundable held deposit). */
  depositRefundDueTotal: number;
}

const RENTAL_CHARGE_TYPES: TransactionType[] = [
  "rental_charge",
  "weekly_rental_charge",
];
const ADDON_TYPES: TransactionType[] = ["miscellaneous_charge", "exchange_fee"];
const LATE_TYPES: TransactionType[] = ["late_fee"];
const DAMAGE_TYPES: TransactionType[] = ["damage_charge"];
const TICKET_TYPES: TransactionType[] = ["ticket_charge", "violation_charge"];
const FUEL_TYPES: TransactionType[] = ["fuel_charge"];
const MILEAGE_TYPES: TransactionType[] = ["mileage_charge"];

function isObligationCharge(t: FinancialTransaction): boolean {
  return t.category === "charge" && affectsRentalObligation(t);
}

function sumByType(
  txns: FinancialTransaction[],
  types: TransactionType[],
): number {
  return txns
    .filter((t) => isObligationCharge(t) && types.includes(t.transaction_type))
    .reduce((s, t) => s + t.amount, 0);
}

/**
 * Final settlement for a rental, derived entirely from posted ledger entries
 * + the operational RentalDeposit record. Deposit application reduces what
 * the customer owes; the refundable held deposit is reported separately as
 * money the company owes back.
 */
export function getRentalSettlement(
  rental: RentalAgreement,
  transactions: FinancialTransaction[],
  deposit: RentalDeposit | null = null,
): RentalSettlement {
  const txns = transactions.filter(
    (t) => t.rental_id === rental.id && t.status === "posted",
  );

  // Categorized charges (obligation charges only — held collections excluded).
  const rentalCharges = sumByType(txns, RENTAL_CHARGE_TYPES);
  const lateFees = sumByType(txns, LATE_TYPES);
  const damageCharges = sumByType(txns, DAMAGE_TYPES);
  const ticketCharges = sumByType(txns, TICKET_TYPES);
  const fuelCharges = sumByType(txns, FUEL_TYPES);
  const mileageCharges = sumByType(txns, MILEAGE_TYPES);
  const addons = sumByType(txns, ADDON_TYPES);

  // Forfeiture is recognized revenue (a charge) — count it as other charges.
  const forfeitureCharges = txns
    .filter(
      (t) =>
        t.deposit_id &&
        t.category === "charge" &&
        affectsRentalObligation(t) &&
        !isDepositHeldEvent(t),
    )
    .reduce((s, t) => s + t.amount, 0);

  const categorized =
    rentalCharges +
    lateFees +
    damageCharges +
    ticketCharges +
    fuelCharges +
    mileageCharges +
    addons;

  // Total charges = all obligation charges (including forfeiture).
  let totalCharges = 0;
  for (const t of txns) {
    if (isObligationCharge(t)) totalCharges += t.amount;
  }
  const otherCharges = Math.max(
    0,
    totalCharges - categorized - forfeitureCharges,
  );

  // Payments + credits that reduce the obligation (includes deposit applications).
  let payments = 0;
  let credits = 0;
  let refunds = 0;
  for (const t of txns) {
    if (!affectsRentalObligation(t)) continue;
    const signed = obligationSignedAmount(t);
    if (signed < 0) {
      if (t.category === "credit") credits += -signed;
      else payments += -signed;
    } else if (signed > 0 && t.category === "refund") {
      refunds += signed;
    }
  }

  // Customer balance = total obligation signed amount (charges + refunds −
  // payments − credits − deposit applications). Derived from the same signed
  // computation used everywhere so settlement agrees with the general ledger.
  let signedTotal = 0;
  for (const t of txns) {
    signedTotal += obligationSignedAmount(t);
  }
  const customerBalanceDue = Math.max(0, signedTotal);

  // Account credit = overpayment beyond all charges.
  const accountCredit = Math.max(0, -signedTotal);

  const impact = getDepositSettlementImpact(deposit);
  const depositRefundDueTotal = impact.refundDue;

  return {
    rentalCharges,
    addons,
    lateFees,
    damageCharges,
    ticketCharges,
    fuelCharges,
    mileageCharges,
    otherCharges: otherCharges + forfeitureCharges,
    totalCharges,
    credits,
    payments,
    refunds,
    depositCollected: impact.collected,
    depositApplied: impact.applied,
    depositRefunded: impact.refunded,
    depositForfeited: impact.forfeited,
    depositHeld: impact.held,
    depositRefundDue: impact.refundDue,
    outstandingBalance: customerBalanceDue,
    accountCredit,
    customerBalanceDue,
    depositRefundDueTotal,
  };
}
