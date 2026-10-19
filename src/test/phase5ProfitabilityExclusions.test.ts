import { it, expect } from "vitest";
import { getCompanyProfitability } from "@/lib/profitabilitySelectors";
import { inputs, txn, expense } from "./profitabilityFixtures";
import { getRentalSettlement } from "@/lib/rentalSettlement";
import { getExpensesReport } from "@/lib/accountingReportSelectors";
import type { ReportContext } from "@/lib/reportContext";
const range = { start: new Date("2026-08-01"), end: new Date("2026-08-31") };
it("Phase 5 held deposit, bank evidence, and reimbursement do not inflate operating revenue", () => {
  const base = inputs({
    transactions: [
      txn({ amount: 1000 }),
      txn({
        amount: 500,
        transaction_type: "cash_payment",
        category: "payment",
        direction: "payment",
        deposit_id: "deposit",
        metadata: { deposit_kind: "collection" },
      }),
    ],
    expenses: [expense({ amount: 100 })],
    importedTransactions: [{ review_status: "unreviewed" }],
    expenseReimbursements: [{ status: "paid", amount: 100 }],
  });
  const pnl = getCompanyProfitability(base, range);
  expect(pnl.operating_revenue).toBe(1000);
  expect(pnl.fleet_direct_expenses).toBe(100);
  expect(pnl.operating_profit).toBe(900);
  expect(
    getRentalSettlement(base.rentals[0], base.transactions).customerBalanceDue,
  ).toBe(1000);
});
it("Phase 5 Reports use the authoritative expense once", () => {
  const base = inputs({ expenses: [expense({ amount: 100 })] });
  const ctx = {
    store: { expenses: base.expenses, maintenanceVendors: [] },
    inputs: base,
  } as unknown as ReportContext;
  expect(
    getExpensesReport(ctx, { start: "2026-08-01", end: "2026-08-31" }).total,
  ).toBe(100);
});
