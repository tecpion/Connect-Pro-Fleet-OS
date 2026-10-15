import type { FinancialTransaction } from "./types";
import {
  affectsRentalObligation,
  isDepositHeldEvent,
  obligationSignedAmount,
} from "./deposit";

// ---------------------------------------------------------------------------
// Centralized financial ledger selectors.
//
// A rental's balance is DERIVED from its posted ledger entries — never a
// mutable total. Charges increase what the customer owes; payments, credits,
// and refunds reduce it. Voided entries (and their reversals) are excluded.
//
// Build #8 cleanup — deposit semantics:
// Held deposit collection/refund do NOT affect the rental obligation (they
// are held money, not revenue). A deposit APPLICATION reduces the obligation
// (like a payment) and a FORFEITURE increases it (recognized revenue). We use
// deposit.depositKind / affectsRentalObligation so held money never satisfies
// ordinary rental charges and applications/forfeitures are recognized.
//
// Sign convention (obligation):
//   charge   -> +amount  (customer owes more)
//   payment  -> -amount  (customer paid, owes less)
//   credit   -> -amount  (reduces what's owed)
//   refund   -> +amount  (money returned to customer, increases balance)
//   deposit collection/refund -> 0 (held money)
//   deposit application -> -amount (settles an existing charge)
//   deposit forfeiture   -> +amount (recognized revenue charge)
// ---------------------------------------------------------------------------

const POSTED = (t: FinancialTransaction) => t.status === "posted";

/** Signed amount of a single transaction (positive = customer owes more),
 *  applying deposit semantics. */
export function signedAmount(t: FinancialTransaction): number {
  return obligationSignedAmount(t);
}

export function rentalTransactions(
  all: FinancialTransaction[],
  rentalId: string,
): FinancialTransaction[] {
  return all
    .filter((t) => t.rental_id === rentalId && POSTED(t))
    .sort((a, b) =>
      a.effective_date === b.effective_date
        ? a.created_at < b.created_at
          ? -1
          : 1
        : a.effective_date < b.effective_date
          ? -1
          : 1,
    );
}

export function customerTransactions(
  all: FinancialTransaction[],
  customerId: string,
): FinancialTransaction[] {
  return all
    .filter((t) => t.customer_id === customerId && POSTED(t))
    .sort((a, b) =>
      a.effective_date === b.effective_date
        ? a.created_at < b.created_at
          ? -1
          : 1
        : a.effective_date < b.effective_date
          ? -1
          : 1,
    );
}

export interface LedgerSummary {
  totalCharges: number;
  totalPayments: number;
  totalCredits: number;
  totalRefunds: number;
  /** Outstanding balance the customer owes (charges + refunds - payments - credits). */
  balance: number;
  /** Total amount the customer has paid (sum of payment entries). */
  paid: number;
}

export function summarize(transactions: FinancialTransaction[]): LedgerSummary {
  let totalCharges = 0;
  let totalPayments = 0;
  let totalCredits = 0;
  let totalRefunds = 0;
  for (const t of transactions) {
    if (t.status !== "posted") continue;
    if (!affectsRentalObligation(t)) continue; // held collection/refund excluded
    // A reversal (metadata.reversal) is an audit companion to a voided
    // original; the voided original is already excluded above, so the reversal
    // must also be excluded to avoid a lone opposite-signed entry.
    if (t.metadata?.reversal === true) continue;
    switch (t.category) {
      case "charge":
        totalCharges += t.amount;
        break;
      case "payment":
        totalPayments += t.amount;
        break;
      case "credit":
        totalCredits += t.amount;
        break;
      case "refund":
        totalRefunds += t.amount;
        break;
    }
  }
  return {
    totalCharges,
    totalPayments,
    totalCredits,
    totalRefunds,
    paid: totalPayments,
    balance: totalCharges + totalRefunds - totalPayments - totalCredits,
  };
}

export function rentalBalance(
  all: FinancialTransaction[],
  rentalId: string,
): number {
  return summarize(rentalTransactions(all, rentalId)).balance;
}

export function customerBalance(
  all: FinancialTransaction[],
  customerId: string,
): number {
  return summarize(customerTransactions(all, customerId)).balance;
}

/** Lifetime revenue = qualifying rental charges actually collected (payments),
 *  excluding security deposits. Deposit applications are not new revenue
 *  (they settle an existing charge); held collections are excluded. */
export function customerLifetimeRevenue(
  all: FinancialTransaction[],
  customerId: string,
): number {
  return customerTransactions(all, customerId)
    .filter(
      (t) =>
        t.category === "payment" && !isDepositHeldEvent(t) && !t.deposit_id,
    )
    .reduce((s, t) => s + t.amount, 0);
}

/** Has a weekly charge already been posted for this billing period? */
export function weeklyChargeExists(
  all: FinancialTransaction[],
  rentalId: string,
  billingPeriod: string,
): boolean {
  return all.some(
    (t) =>
      t.rental_id === rentalId &&
      t.transaction_type === "weekly_rental_charge" &&
      t.billing_period === billingPeriod &&
      t.status === "posted",
  );
}

/** All posted ledger entries linked to a given invoice (charges + payments). */
export function invoiceTransactions(
  all: FinancialTransaction[],
  invoiceId: string,
): FinancialTransaction[] {
  return all
    .filter((t) => t.invoice_id === invoiceId && t.status === "posted")
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

/** Sum of posted payments applied to an invoice (what's been paid on it). */
export function invoicePaid(
  all: FinancialTransaction[],
  invoiceId: string,
): number {
  return invoiceTransactions(all, invoiceId)
    .filter((t) => t.category === "payment")
    .reduce((s, t) => s + t.amount, 0);
}

/** Sum of posted charges on an invoice (its total). */
export function invoiceCharges(
  all: FinancialTransaction[],
  invoiceId: string,
): number {
  return invoiceTransactions(all, invoiceId)
    .filter((t) => t.category === "charge")
    .reduce((s, t) => s + t.amount, 0);
}
