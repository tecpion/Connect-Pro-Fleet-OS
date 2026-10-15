// Connect Pro Fleet — Vehicle Performance violation economics.
//
// Net company violation impact = company-paid cost - recovered. A renter-paid
// violation has zero net impact. Company-paid cost comes from linked
// ExpenseTransactions; recovery from customer payments toward the violation
// charge. Pure function, no React.

import type { FinancialTransaction } from "./chargeTypes";
import type { ExpenseTransaction } from "./expenseTypes";
import type { Violation } from "./violationTypes";
import type { DateRange } from "./profitabilityHelpers";
import { inRange, round2 } from "./profitabilityHelpers";

export interface ViolationEconomicsView {
  /** Total assessed violation amount for the vehicle in-period. */
  totalAssessed: number;
  companyPaid: number;
  recovered: number;
  netCompanyImpact: number;
}

function expenseNet(e: ExpenseTransaction): number {
  if (e.status === "voided") return 0;
  return e.reversal_of ? -e.amount : e.amount;
}

export function computeViolationEconomics(
  transactions: FinancialTransaction[],
  expenses: ExpenseTransaction[],
  violations: Violation[],
  vehicleId: string,
  range: DateRange,
): ViolationEconomicsView {
  const viols = violations.filter(
    (v) =>
      v.vehicle_id === vehicleId &&
      inRange(v.occurred_at.slice(0, 10), range.start, range.end),
  );
  let companyPaid = 0;
  let recovered = 0;
  let totalAssessed = 0;

  for (const v of viols) {
    totalAssessed += v.total_amount;
    if (v.company_payment_status === "paid" && v.linked_expense_id) {
      const exp = expenses.find((e) => e.id === v.linked_expense_id);
      if (exp && exp.status !== "voided") {
        companyPaid += expenseNet(exp);
      }
    }
    if (v.customer_charge_transaction_id) {
      const payments = transactions.filter(
        (t) =>
          t.rental_id === v.rental_id &&
          t.status === "posted" &&
          t.category === "payment",
      );
      for (const p of payments) {
        if (inRange(p.effective_date, range.start, range.end)) {
          recovered += p.amount;
        }
      }
    }
  }
  recovered = Math.min(recovered, companyPaid);
  return {
    totalAssessed: round2(totalAssessed),
    companyPaid: round2(companyPaid),
    recovered: round2(recovered),
    netCompanyImpact: round2(Math.max(0, companyPaid - recovered)),
  };
}
