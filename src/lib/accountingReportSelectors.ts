// Connect Pro Fleet — Build #18 accounting report selectors.
//
// Expenses, missing receipts, reimbursements, banking/reconciliation, and
// deposits reports. All derived from authoritative ledgers. Held deposits
// are never revenue. Reimbursement settlement is never a second expense.

import type { ReportContext, ReportFilter } from "./reportContext";
import { filterToDateRange } from "./reportInputs";
import {
  getCompanyOverheadExpenses,
  getCashExpenses,
  getExpensesMissingReceipts,
  getOutstandingReimbursements,
  getExpensesByCategory,
  getExpensesByVendor,
  getExpensesByPaymentMethod,
} from "./expenseSelectors";
import type { ExpenseTransaction, ExpenseReimbursement } from "./expenseTypes";
import {
  getUnreviewedTransactions,
  getSuggestedTransactions,
  getUnmatchedMoneyIn,
  getUnmatchedMoneyOut,
} from "./reconciliationSelectors";
import { isAcquisitionExpense } from "./profitabilityHelpers";
import { inRange } from "./reconciliationSelectors";

const round2 = (n: number) => Math.round(n * 100) / 100;
const net = (e: ExpenseTransaction) => (e.reversal_of ? -e.amount : e.amount);

// ---------------------------------------------------------------------------
// Expenses Report
// ---------------------------------------------------------------------------

export interface ExpensesReport {
  total: number;
  vehicle_direct: number;
  company_overhead: number;
  cash_expenses: number;
  acquisition_spend: number;
  by_category: { category: string; amount: number }[];
  by_vendor: { vendor: string; amount: number }[];
  by_payment_method: { method: string; amount: number }[];
}

export function getExpensesReport(
  ctx: ReportContext,
  filter: ReportFilter,
): ExpensesReport {
  const { store, inputs } = ctx;
  const { start, end } = filterToDateRange(filter);
  const period = store.expenses.filter(
    (e) => e.status !== "voided" && inRange(e.transaction_date, start, end),
  );
  const total = period.reduce((s, e) => s + net(e), 0);
  const vehicleDirect = period
    .filter((e) => e.vehicle_id || e.maintenance_work_order_id)
    .filter((e) => !isAcquisitionExpense(e, inputs.expenseCategories))
    .reduce((s, e) => s + net(e), 0);
  const overhead = getCompanyOverheadExpenses(period).reduce(
    (s, e) => s + net(e),
    0,
  );
  const cash = getCashExpenses(period).reduce((s, e) => s + net(e), 0);
  const acquisition = period
    .filter((e) => isAcquisitionExpense(e, inputs.expenseCategories))
    .reduce((s, e) => s + net(e), 0);

  return {
    total: round2(total),
    vehicle_direct: round2(vehicleDirect),
    company_overhead: round2(overhead),
    cash_expenses: round2(cash),
    acquisition_spend: round2(acquisition),
    by_category: getExpensesByCategory(period, inputs.expenseCategories).map(
      (c) => ({
        category: c.category?.name ?? "Uncategorized",
        amount: round2(c.total),
      }),
    ),
    by_vendor: getExpensesByVendor(
      period,
      (id) =>
        store.maintenanceVendors.find((v) => v.id === id)?.name ?? "No vendor",
    ).map((v) => ({
      vendor: v.vendor,
      amount: round2(v.total),
    })),
    by_payment_method: getExpensesByPaymentMethod(period).map((m) => ({
      method: m.method,
      amount: round2(m.total),
    })),
  };
}

// ---------------------------------------------------------------------------
// Missing Receipts Report
// ---------------------------------------------------------------------------

export interface MissingReceiptsReport {
  rows: {
    expense_id: string;
    expense_number: string;
    date: string;
    vendor: string;
    amount: number;
    category: string;
    vehicle: string;
    paid_by: string;
    payment_method: string;
    reimbursement_status: string;
    age_days: number;
  }[];
  count: number;
  total_amount: number;
}

function reimbursementStatusFor(
  e: ExpenseTransaction,
  reimbursements: ExpenseReimbursement[],
): string {
  return (
    reimbursements.find((r) => r.expense_id === e.id)?.status ?? "not_required"
  );
}

export function getMissingReceiptsReport(
  ctx: ReportContext,
): MissingReceiptsReport {
  const { store } = ctx;
  const missing = getExpensesMissingReceipts(
    store.expenses,
    store.expenseReceipts,
  );
  const rows = missing.map((e) => {
    const veh = e.vehicle_id
      ? store.vehicles.find((v) => v.id === e.vehicle_id)
      : null;
    const ageMs = Date.now() - new Date(e.transaction_date).getTime();
    return {
      expense_id: e.id,
      expense_number: e.expense_number,
      date: e.transaction_date,
      vendor: e.vendor_id
        ? (store.maintenanceVendors.find((v) => v.id === e.vendor_id)?.name ??
          "—")
        : "—",
      amount: e.amount,
      category:
        store.expenseCategories.find((c) => c.id === e.expense_category_id)
          ?.name ?? "—",
      vehicle: veh ? `${veh.make} ${veh.model}` : "—",
      paid_by: e.paid_by_type,
      payment_method: e.payment_method,
      reimbursement_status: reimbursementStatusFor(
        e,
        store.expenseReimbursements,
      ),
      age_days: Math.max(0, Math.floor(ageMs / 86_400_000)),
    };
  });
  return {
    rows,
    count: rows.length,
    total_amount: round2(rows.reduce((s, r) => s + r.amount, 0)),
  };
}

// ---------------------------------------------------------------------------
// Reimbursements Report
// ---------------------------------------------------------------------------

export interface ReimbursementsReport {
  owed: ExpenseReimbursement[];
  approved: ExpenseReimbursement[];
  paid: ExpenseReimbursement[];
  total_outstanding: number;
  by_payee: { payee: string; amount: number }[];
}

export function getReimbursementsReport(
  ctx: ReportContext,
): ReimbursementsReport {
  const { store } = ctx;
  const rems = store.expenseReimbursements;
  const owed = getOutstandingReimbursements(rems).filter(
    (r) => r.status === "owed",
  );
  const approved = getOutstandingReimbursements(rems).filter(
    (r) => r.status === "approved",
  );
  const paid = rems.filter((r) => r.status === "paid");
  const outstanding = getOutstandingReimbursements(rems).reduce(
    (s, r) => s + r.amount,
    0,
  );
  const byPayee = new Map<string, number>();
  for (const r of getOutstandingReimbursements(rems)) {
    const payee = r.payee_user_id
      ? (store.staff.find((s) => s.id === r.payee_user_id)?.full_name ?? "—")
      : r.payee_type;
    byPayee.set(payee, (byPayee.get(payee) ?? 0) + r.amount);
  }
  return {
    owed,
    approved,
    paid,
    total_outstanding: round2(outstanding),
    by_payee: Array.from(byPayee.entries()).map(([payee, amount]) => ({
      payee,
      amount: round2(amount),
    })),
  };
}

// ---------------------------------------------------------------------------
// Banking / Reconciliation Report
// ---------------------------------------------------------------------------

export interface BankingReconciliationReport {
  accounts: {
    account_id: string;
    name: string;
    last_four: string | null;
    unreviewed: number;
    suggested_matches: number;
    unmatched_in: number;
    unmatched_out: number;
  }[];
  total_unreviewed: number;
  total_suggested: number;
  statements_needing_attention: number;
}

export function getBankingReconciliationReport(
  ctx: ReportContext,
): BankingReconciliationReport {
  const { store } = ctx;
  const accounts = store.financialAccounts.map((a) => {
    const txns = store.importedTransactions.filter(
      (t) => t.financial_account_id === a.id,
    );
    return {
      account_id: a.id,
      name: a.name,
      last_four: a.last_four,
      unreviewed: txns.filter((t) => t.review_status === "unreviewed").length,
      suggested_matches: txns.filter((t) => t.match_status === "suggested")
        .length,
      unmatched_in: getUnmatchedMoneyIn(txns).length,
      unmatched_out: getUnmatchedMoneyOut(txns).length,
    };
  });
  return {
    accounts,
    total_unreviewed: getUnreviewedTransactions(store.importedTransactions)
      .length,
    total_suggested: getSuggestedTransactions(store.importedTransactions)
      .length,
    statements_needing_attention: store.statements.filter(
      (s) =>
        s.reconciliation_status === "needs_attention" ||
        s.reconciliation_status === "in_progress",
    ).length,
  };
}

// ---------------------------------------------------------------------------
// Deposits Report
// ---------------------------------------------------------------------------

export interface DepositsReport {
  held_liability: number;
  collected: number;
  applied: number;
  refund_pending: number;
  refunded: number;
  forfeited: number;
  uncollected: number;
  rows: {
    deposit_id: string;
    customer: string;
    rental: string;
    required: number;
    held: number;
    applied: number;
    refund_due: number;
    status: string;
  }[];
}

export function getDepositsReport(ctx: ReportContext): DepositsReport {
  const { store } = ctx;
  const deposits = store.rentalDeposits ?? [];
  let held = 0;
  let collected = 0;
  let applied = 0;
  let refundPending = 0;
  let refunded = 0;
  let forfeited = 0;
  let uncollected = 0;
  const rows = deposits.map((d) => {
    const heldBal = Math.max(
      0,
      d.collected_amount -
        d.applied_amount -
        d.refunded_amount -
        d.forfeited_amount,
    );
    held += heldBal;
    collected += d.collected_amount;
    applied += d.applied_amount;
    refundPending += Math.max(
      0,
      d.collected_amount -
        d.applied_amount -
        d.forfeited_amount -
        d.refunded_amount,
    );
    refunded += d.refunded_amount;
    forfeited += d.forfeited_amount;
    uncollected += Math.max(0, d.required_amount - d.collected_amount);
    return {
      deposit_id: d.id,
      customer: d.customer_id ? store.customerName(d.customer_id) : "—",
      rental: d.rental_id ?? "—",
      required: d.required_amount,
      held: round2(heldBal),
      applied: round2(d.applied_amount),
      refund_due: round2(
        Math.max(
          0,
          d.collected_amount -
            d.applied_amount -
            d.forfeited_amount -
            d.refunded_amount,
        ),
      ),
      status: d.status,
    };
  });
  return {
    held_liability: round2(held),
    collected: round2(collected),
    applied: round2(applied),
    refund_pending: round2(refundPending),
    refunded: round2(refunded),
    forfeited: round2(forfeited),
    uncollected: round2(uncollected),
    rows,
  };
}
