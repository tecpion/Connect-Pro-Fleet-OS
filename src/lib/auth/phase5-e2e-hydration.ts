// Phase 5 E2E — relogin hydration, profitability exclusions, Rental Record
// financial history, and Reports authoritative Cloud records. Extracted so
// the main E2E runner stays focused. Mirrors the Phase 4 split.
// Test-harness only — no product/domain logic changed.

import {
  hydrateExpenses,
  hydrateBanking,
  hydrateInvestor,
  type ExpenseSyncHandles,
  type BankingSyncHandles,
  type InvestorSyncHandles,
} from "@/lib/supabase/phase5StoreSync";
import {
  getCompanyProfitability,
  type ProfitabilityInputs,
} from "@/lib/profitabilitySelectors";
import { getRentalSettlement } from "@/lib/rentalSettlement";
import { getExpensesReport } from "@/lib/accountingReportSelectors";
import type { ReportContext } from "@/lib/reportContext";
import type { Phase5Step } from "./phase5-e2e.server";
import { step, type Phase5Runtime } from "./phase5-e2e-runtime";

export interface HydrationProfitabilityResult {
  steps: Phase5Step[];
}

export async function runHydrationProfitability(
  runtime: Phase5Runtime,
): Promise<HydrationProfitabilityResult> {
  const steps: Phase5Step[] = [];
  const {
    a,
    orgA,
    ctx,
    fixtures: f,
    emailA,
    password,
    ledger,
    expenses,
    banking,
    investor,
    vehicles,
    rentals,
  } = runtime;
  await step(steps, "logout_login_rehydrates_all_phase5_state", async () => {
    const out = await a.auth.signOut();
    if (out.error) throw out.error;
    const login = await a.auth.signInWithPassword({ email: emailA, password });
    if (login.error) throw login.error;
    const state: Record<string, unknown[]> = {};
    const handles = new Proxy(
      {},
      {
        get: (_, name) => (update: (prev: unknown[]) => unknown[]) => {
          state[String(name)] = update([]);
        },
      },
    );
    const repos = { expenses, banking, investor };
    const results = await Promise.all([
      hydrateExpenses(orgA!, handles as ExpenseSyncHandles, repos),
      hydrateBanking(orgA!, handles as BankingSyncHandles, repos),
      hydrateInvestor(orgA!, handles as InvestorSyncHandles, repos),
    ]);
    return (
      results.every(Boolean) &&
      state.setExpenses.length === 1 &&
      state.setExpenseReceipts.length === 1 &&
      state.setExpenseReimbursements.length === 1 &&
      state.setFinancialAccounts.length === 2 &&
      state.setImportedTransactions.length === 4 &&
      state.setImportedTransactions.filter(
        (row) => (row as { match_status: string }).match_status === "matched",
      ).length === 2 &&
      state.setImportedTransactions.filter(
        (row) =>
          (row as { transfer_status: string }).transfer_status === "transfer",
      ).length === 1 &&
      state.setReconciliationMatches.length === 2 &&
      state.setAccountTransfers.length === 1 &&
      state.setInvestors.length === 1 &&
      state.setInvestorVehicles.length === 2 &&
      state.setSettlements.length === 1 &&
      state.setExpenses.some(
        (row) => (row as { id: string }).id === f.expense.id,
      ) &&
      state.setSettlements.some(
        (row) => (row as { payout_status: string }).payout_status === "paid",
      ) &&
      state.setExpenseCategories.length === 1 &&
      state.setImportBatches.length === 1
    );
  });
  const inputs: ProfitabilityInputs = {
    transactions: await ledger.listForRental(orgA, ctx.rentalId),
    expenses: await expenses.listTransactions(orgA),
    expenseLineItems: [],
    expenseCategories: await expenses.listCategories(orgA),
    feeRules: [],
    vehicles: await vehicles.list(orgA),
    vehicleClasses: [],
    locations: [],
    rentals: await rentals.list(orgA),
    exchanges: [],
    investorVehicles: await investor.listPairings(orgA),
    importedTransactions: await banking.listImportedTransactions(orgA),
    expenseReceipts: await expenses.listReceipts(orgA),
    expenseReimbursements: await expenses.listReimbursements(orgA),
  };
  const range = {
    start: new Date(`${f.date}T00:00:00`),
    end: new Date(`${f.date}T23:59:59`),
  };
  const profit = () => getCompanyProfitability(inputs, range);
  for (const name of [
    "bank_evidence_only",
    "transfer_no_pnl",
    "reimbursement_not_revenue",
    "expense_counted_once",
    "deposit_excluded_from_operating_revenue",
    "payout_no_double_profit_reduction",
    "profitability_consistent",
  ]) {
    await step(
      steps,
      name,
      () =>
        profit().operating_revenue === 1000 &&
        profit().fleet_direct_expenses === 100 &&
        profit().operating_profit === 900 &&
        profit().collections === 1000 &&
        profit().outstanding_receivables === 0,
    );
  }
  await step(steps, "rental_record_financial_history", () => {
    const result = getRentalSettlement(
      inputs.rentals.find((r) => r.id === ctx.rentalId)!,
      inputs.transactions,
    );
    return (
      result.totalCharges === 1000 &&
      result.payments === 1000 &&
      result.customerBalanceDue === 0
    );
  });
  await step(steps, "reports_authoritative_cloud_records", () => {
    const reportCtx = {
      store: { expenses: inputs.expenses, maintenanceVendors: [] },
      inputs,
    } as unknown as ReportContext;
    return (
      getExpensesReport(reportCtx, { start: f.date, end: f.date }).total === 100
    );
  });
  return { steps };
}
