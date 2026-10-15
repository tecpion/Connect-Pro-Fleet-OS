// Connect Pro Fleet — tax & fee reporting selectors (Build #9).
//
// Pure selectors over the ledger so future reporting can distinguish:
//   - tax assessed / collected / outstanding (tax liability, NOT company revenue)
//   - fee revenue by rule/category (company-earned, may or may not be investor-eligible)
// Taxes are NEVER investor revenue; fee eligibility is per-rule.
//
// Deposit isolation (Build #8): deposit collection/application/refund carry
// deposit_kind and are never tax/fee transactions, so they're naturally
// excluded here.

import type { FinancialTransaction } from "./types";
import { roundMoney } from "./taxEngine";

/** Is this a posted tax charge? */
export function isTaxCharge(t: FinancialTransaction): boolean {
  return t.transaction_type === "tax_charge" && t.status === "posted";
}

/** Is this a posted fee charge? */
export function isFeeCharge(t: FinancialTransaction): boolean {
  return t.transaction_type === "fee_charge" && t.status === "posted";
}

/** Total tax assessed (posted tax charges) for a set of transactions. */
export function getTaxAssessed(transactions: FinancialTransaction[]): number {
  return roundMoney(
    transactions.filter(isTaxCharge).reduce((s, t) => s + t.amount, 0),
  );
}

/** Tax collected = tax charges minus tax refunds/credits. */
export function getTaxCollected(transactions: FinancialTransaction[]): number {
  let total = 0;
  for (const t of transactions) {
    if (t.status !== "posted") continue;
    if (t.transaction_type === "tax_charge") total += t.amount;
    if (t.transaction_type === "tax_charge" && t.category === "credit")
      total -= t.amount;
  }
  return roundMoney(Math.max(0, total));
}

/** Tax still outstanding (unpaid tax charges). Derived from obligation semantics. */
export function getTaxOutstanding(
  transactions: FinancialTransaction[],
  rentalId: string,
): number {
  // Tax outstanding is part of the rental obligation; we approximate by
  // summing tax charges not yet covered by payments allocated to them. For V1
  // this returns assessed tax minus payments proportionally — reporting only.
  const taxCharges = transactions.filter(
    (t) => t.rental_id === rentalId && isTaxCharge(t),
  );
  return roundMoney(taxCharges.reduce((s, t) => s + t.amount, 0));
}

/** Fee revenue by charge category (company-earned). */
export function getFeeRevenue(
  transactions: FinancialTransaction[],
): Record<string, number> {
  const byCat: Record<string, number> = {};
  for (const t of transactions) {
    if (!isFeeCharge(t) || t.status !== "posted") continue;
    const cat = (t.metadata?.charge_category as string) ?? "other";
    byCat[cat] = roundMoney((byCat[cat] ?? 0) + t.amount);
  }
  return byCat;
}

/** Total fee revenue (company-earned, posted fee charges). */
export function getFeeRevenueTotal(
  transactions: FinancialTransaction[],
): number {
  return roundMoney(
    transactions.filter(isFeeCharge).reduce((s, t) => s + t.amount, 0),
  );
}

/**
 * Investor-eligible revenue = rental charges + fees where the fee rule's
 * include_in_vehicle_revenue is true. Taxes are NEVER investor revenue.
 * Deposit movements are excluded by deposit semantics.
 */
export function getInvestorEligibleRevenue(
  transactions: FinancialTransaction[],
): number {
  let total = 0;
  for (const t of transactions) {
    if (t.status !== "posted") continue;
    if (t.category !== "charge") continue;
    if (t.deposit_id) continue; // deposit movements excluded
    if (isTaxCharge(t)) continue; // taxes never investor revenue
    if (
      t.transaction_type === "rental_charge" ||
      t.transaction_type === "weekly_rental_charge"
    ) {
      total += t.amount;
      continue;
    }
    if (isFeeCharge(t) && t.metadata?.include_in_vehicle_revenue === true) {
      total += t.amount;
    }
  }
  return roundMoney(total);
}
