// Connect Pro Fleet — Expenses V1 workspace selectors.
//
// Pure functions over the expense ledger for: allocation states, vendor spend,
// "Where the Money Went" category analytics, month-end close checklist, spend
// alerts, and category budget vs actual. These COMPOSE existing authoritative
// selectors (netExpenseTotal, getExpensesByCategory, getExpensesByVendor,
// getExpensesMissingReceipts, getOutstandingReimbursements) — they never
// reimplement financial formulas or duplicate money.

import type {
  ExpenseCategory,
  ExpenseLineItem,
  ExpenseReceipt,
  ExpenseReimbursement,
  ExpenseRule,
  ExpenseTransaction,
  ReceiptInboxItem,
  RecurringExpense,
  SpendAlert,
  CategoryBudget,
} from "./expenseTypes";
import {
  netExpenseTotal,
  isReversal,
  getExpensesByCategory,
  getExpensesByVendor,
  getExpensesMissingReceipts,
  getOutstandingReimbursements,
} from "./expenseSelectors";
import type { ImportedTransaction } from "./bankingTypes";

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

export type AllocationState = "fully" | "partial" | "unallocated";

/** Determine allocation state for an expense. A vehicle-scoped expense with
 *  line items is fully allocated when line items cover the amount; an overhead
 *  expense with no vehicle is "fully" (overhead is a valid allocation target).
 *  Unallocated = vehicle category but no vehicle and no line items. */
export function allocationState(
  e: ExpenseTransaction,
  lineItems: ExpenseLineItem[],
): AllocationState {
  if (e.status === "voided" || isReversal(e)) return "fully"; // reversals inherit
  // Overhead (no vehicle, no WO) is a valid allocation.
  if (!e.vehicle_id && !e.maintenance_work_order_id && !e.rental_id) {
    const hasLines = lineItems.some((l) => l.expense_id === e.id);
    return hasLines ? "partial" : "fully";
  }
  // Vehicle/WO-scoped: check line items cover the amount.
  const lines = lineItems.filter((l) => l.expense_id === e.id);
  if (lines.length === 0) {
    // Single vehicle_id on the expense = fully allocated to that vehicle.
    return e.vehicle_id || e.maintenance_work_order_id
      ? "fully"
      : "unallocated";
  }
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  if (Math.abs(sum - e.amount) < 0.005) return "fully";
  if (sum > 0) return "partial";
  return "unallocated";
}

export function getUnallocatedExpenses(
  expenses: ExpenseTransaction[],
  lineItems: ExpenseLineItem[],
): ExpenseTransaction[] {
  return expenses.filter(
    (e) =>
      e.status === "posted" && allocationState(e, lineItems) === "unallocated",
  );
}

// ---------------------------------------------------------------------------
// Vendor spend
// ---------------------------------------------------------------------------

export interface VendorSpendRow {
  vendorId: string | null;
  vendor: string;
  spendThisMonth: number;
  ytdSpend: number;
  transactionCount: number;
  topCategoryId: string | null;
  topCategoryName: string | null;
  lastExpenseDate: string | null;
}

export function vendorSpendSummary(
  expenses: ExpenseTransaction[],
  categories: ExpenseCategory[],
  vendorName: (id: string | null) => string,
  monthKey: string,
  year: number,
): VendorSpendRow[] {
  const byVendor = new Map<string, ExpenseTransaction[]>();
  for (const e of expenses) {
    if (e.status === "voided") continue;
    const key = e.vendor_id ?? "__none__";
    const arr = byVendor.get(key) ?? [];
    arr.push(e);
    byVendor.set(key, arr);
  }
  const rows: VendorSpendRow[] = [];
  for (const [key, list] of byVendor) {
    const posted = list.filter((e) => e.status === "posted");
    const monthRows = posted.filter(
      (e) => e.transaction_date.slice(0, 7) === monthKey,
    );
    const ytdRows = posted.filter(
      (e) => e.transaction_date.slice(0, 4) === String(year),
    );
    // Top category
    const catMap = new Map<string, number>();
    for (const e of posted) {
      const ck = e.expense_category_id ?? "__none__";
      catMap.set(
        ck,
        (catMap.get(ck) ?? 0) + (isReversal(e) ? -e.amount : e.amount),
      );
    }
    let topCatId: string | null = null;
    let topCatAmt = -Infinity;
    for (const [ck, amt] of catMap) {
      if (amt > topCatAmt) {
        topCatAmt = amt;
        topCatId = ck === "__none__" ? null : ck;
      }
    }
    const topCat = topCatId ? categories.find((c) => c.id === topCatId) : null;
    const lastDate =
      posted
        .map((e) => e.transaction_date)
        .sort((a, b) => (a < b ? 1 : -1))[0] ?? null;
    rows.push({
      vendorId: key === "__none__" ? null : key,
      vendor: key === "__none__" ? "No vendor" : vendorName(key),
      spendThisMonth: netExpenseTotal(monthRows),
      ytdSpend: netExpenseTotal(ytdRows),
      transactionCount: posted.length,
      topCategoryId: topCatId,
      topCategoryName: topCat?.name ?? null,
      lastExpenseDate: lastDate,
    });
  }
  return rows.sort((a, b) => b.ytdSpend - a.ytdSpend);
}

// ---------------------------------------------------------------------------
// Where the Money Went — category/group analytics
// ---------------------------------------------------------------------------

export interface CategorySpendRow {
  categoryId: string | null;
  categoryName: string;
  group: "vehicle" | "overhead" | "other";
  total: number;
  count: number;
}

export function whereTheMoneyWent(
  expenses: ExpenseTransaction[],
  categories: ExpenseCategory[],
): CategorySpendRow[] {
  const byCat = getExpensesByCategory(expenses, categories);
  return byCat
    .map((row) => {
      const group: CategorySpendRow["group"] =
        row.category?.group === "vehicle"
          ? "vehicle"
          : row.category?.group === "overhead"
            ? "overhead"
            : "other";
      return {
        categoryId: row.category?.id ?? null,
        categoryName: row.category?.name ?? "Uncategorized",
        group,
        total: row.total,
        count: row.count,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Group totals (vehicle vs overhead) for a date range. */
export function spendByGroup(
  expenses: ExpenseTransaction[],
  categories: ExpenseCategory[],
): { vehicle: number; overhead: number; other: number } {
  const rows = whereTheMoneyWent(expenses, categories);
  return rows.reduce(
    (acc, r) => {
      acc[r.group] += r.total;
      return acc;
    },
    { vehicle: 0, overhead: 0, other: 0 },
  );
}

// ---------------------------------------------------------------------------
// Month-End Expense Check (operational cleanup, NOT formal accounting close)
// ---------------------------------------------------------------------------

export interface MonthEndChecklist {
  monthKey: string;
  missingReceipts: number;
  unallocatedExpenses: number;
  unmatchedBankTransactions: number;
  reimbursementsOwed: number;
  expensesAwaitingReview: number;
  unmatchedReceipts: number;
  status: "needs_attention" | "ready_for_review";
}

export function monthEndChecklist(
  monthKey: string,
  expenses: ExpenseTransaction[],
  lineItems: ExpenseLineItem[],
  receipts: ExpenseReceipt[],
  reimbursements: ExpenseReimbursement[],
  importedTransactions: ImportedTransaction[],
  inboxItems: ReceiptInboxItem[],
): MonthEndChecklist {
  const monthExpenses = expenses.filter(
    (e) => e.status === "posted" && e.transaction_date.slice(0, 7) === monthKey,
  );
  const missingReceipts = getExpensesMissingReceipts(
    monthExpenses,
    receipts,
  ).length;
  const unallocated = getUnallocatedExpenses(monthExpenses, lineItems).length;
  const unmatchedBank = importedTransactions.filter(
    (t) =>
      t.match_status === "unmatched" &&
      t.transaction_date.slice(0, 7) === monthKey,
  ).length;
  const reimbursementsOwed = getOutstandingReimbursements(
    reimbursements.filter(
      (r) => (r.requested_at ?? "").slice(0, 7) === monthKey,
    ),
  ).length;
  const awaitingReview = monthExpenses.filter(
    (e) => (e.metadata?.review_state as string) === "needs_review",
  ).length;
  const unmatchedReceipts = inboxItems.filter(
    (i) =>
      i.month_key === monthKey &&
      (i.state === "unmatched" || i.state === "missing_info"),
  ).length;
  const issues =
    missingReceipts +
    unallocated +
    unmatchedBank +
    reimbursementsOwed +
    awaitingReview +
    unmatchedReceipts;
  return {
    monthKey,
    missingReceipts,
    unallocatedExpenses: unallocated,
    unmatchedBankTransactions: unmatchedBank,
    reimbursementsOwed,
    expensesAwaitingReview: awaitingReview,
    unmatchedReceipts,
    status: issues > 0 ? "needs_attention" : "ready_for_review",
  };
}

// ---------------------------------------------------------------------------
// Spend alerts
// ---------------------------------------------------------------------------

export interface TriggeredAlert {
  alert: SpendAlert;
  expense: ExpenseTransaction;
  message: string;
}

export function evaluateSpendAlerts(
  alerts: SpendAlert[],
  expenses: ExpenseTransaction[],
  categories: ExpenseCategory[],
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];
  for (const a of alerts) {
    if (!a.active) continue;
    for (const e of expenses) {
      if (e.status !== "posted" || isReversal(e)) continue;
      let fire = false;
      let message = "";
      switch (a.metric) {
        case "single_expense":
          if (e.amount >= a.threshold) {
            fire = true;
            message = `Expense ${e.expense_number} exceeds $${a.threshold}`;
          }
          break;
        case "maintenance_expense":
          if (
            e.source === "maintenance_work_order" &&
            e.amount >= a.threshold
          ) {
            fire = true;
            message = `Maintenance expense ${e.expense_number} exceeds $${a.threshold}`;
          }
          break;
        case "vehicle_expense":
          if (e.vehicle_id && e.amount >= a.threshold) {
            fire = true;
            message = `Vehicle expense ${e.expense_number} exceeds $${a.threshold}`;
          }
          break;
        case "category_spend": {
          if (!a.category_id) break;
          const catExpenses = expenses.filter(
            (x) =>
              x.status === "posted" && x.expense_category_id === a.category_id,
          );
          const total = netExpenseTotal(catExpenses);
          if (total >= a.threshold) {
            const cat = categories.find((c) => c.id === a.category_id);
            fire = true;
            message = `${cat?.name ?? "Category"} spend ${fmt(total)} reached $${a.threshold}`;
          }
          break;
        }
      }
      if (fire) triggered.push({ alert: a, expense: e, message });
    }
  }
  return triggered;
}

function fmt(n: number) {
  return `$${n.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Category budget vs actual
// ---------------------------------------------------------------------------

export interface BudgetVsActual {
  category: ExpenseCategory;
  budget: number;
  actual: number;
  difference: number;
}

export function budgetVsActual(
  budgets: CategoryBudget[],
  categories: ExpenseCategory[],
  expenses: ExpenseTransaction[],
  monthKey: string,
): BudgetVsActual[] {
  const monthBudgets = budgets.filter((b) => b.month_key === monthKey);
  const monthExpenses = expenses.filter(
    (e) => e.status === "posted" && e.transaction_date.slice(0, 7) === monthKey,
  );
  return monthBudgets
    .map((b) => {
      const cat = categories.find((c) => c.id === b.category_id);
      if (!cat) return null;
      const actual = netExpenseTotal(
        monthExpenses.filter((e) => e.expense_category_id === b.category_id),
      );
      return {
        category: cat,
        budget: b.budget_amount,
        actual,
        difference: b.budget_amount - actual,
      };
    })
    .filter((x): x is BudgetVsActual => x !== null);
}

// ---------------------------------------------------------------------------
// Recurring expense helpers
// ---------------------------------------------------------------------------

/** Recurring templates whose next occurrence falls within the upcoming window
 *  (days ahead). Uses frequency to compute the next due date from
 *  last_generated_at (or start_date). */
export function upcomingRecurring(
  recurring: RecurringExpense[],
  now: Date,
  daysAhead: number,
): RecurringExpense[] {
  const horizon = new Date(now.getTime() + daysAhead * 86_400_000);
  return recurring
    .filter((r) => r.active)
    .filter((r) => {
      const next = nextRecurringDate(r, now);
      return next && next <= horizon;
    });
}

export function nextRecurringDate(r: RecurringExpense, now: Date): Date | null {
  const base = r.last_generated_at ?? r.start_date;
  const baseDate = new Date(base + "T00:00:00");
  if (isNaN(baseDate.getTime())) return null;
  if (r.end_date && new Date(r.end_date + "T00:00:00") < now) return null;
  let next = new Date(baseDate);
  // Advance past `now` by frequency increments.
  let guard = 0;
  while (next < now && guard < 600) {
    next = advance(next, r.frequency);
    guard++;
  }
  return next;
}

function advance(d: Date, freq: RecurringExpense["frequency"]): Date {
  const n = new Date(d);
  switch (freq) {
    case "weekly":
      n.setDate(n.getDate() + 7);
      break;
    case "monthly":
      n.setMonth(n.getMonth() + 1);
      break;
    case "quarterly":
      n.setMonth(n.getMonth() + 3);
      break;
    case "yearly":
      n.setFullYear(n.getFullYear() + 1);
      break;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Receipt inbox helpers
// ---------------------------------------------------------------------------

export interface ReceiptMonthGroup {
  monthKey: string;
  label: string;
  total: number;
  matched: number;
  unmatched: number;
  missingInfo: number;
  needsReview: number;
  items: ReceiptInboxItem[];
}

export function groupReceiptsByMonth(
  items: ReceiptInboxItem[],
): ReceiptMonthGroup[] {
  const map = new Map<string, ReceiptInboxItem[]>();
  for (const i of items) {
    const arr = map.get(i.month_key) ?? [];
    arr.push(i);
    map.set(i.month_key, arr);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([monthKey, list]) => ({
      monthKey,
      label: monthLabel(monthKey),
      total: list.length,
      matched: list.filter(
        (i) => i.state === "matched" || i.state === "attached",
      ).length,
      unmatched: list.filter((i) => i.state === "unmatched").length,
      missingInfo: list.filter((i) => i.state === "missing_info").length,
      needsReview: list.filter((i) => i.state === "needs_review").length,
      items: list.sort((a, b) => (a.captured_at < b.captured_at ? 1 : -1)),
    }));
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Deterministic receipt match suggestions based on date + amount + merchant. */
export interface ReceiptMatchSuggestion {
  inboxItem: ReceiptInboxItem;
  expenseId: string | null;
  importedId: string | null;
  reason: string;
}

export function suggestReceiptMatches(
  inbox: ReceiptInboxItem[],
  expenses: ExpenseTransaction[],
  imported: ImportedTransaction[],
  vendorName: (id: string | null) => string,
): ReceiptMatchSuggestion[] {
  const out: ReceiptMatchSuggestion[] = [];
  for (const item of inbox) {
    if (item.state === "matched" || item.state === "attached") continue;
    // Try expenses first.
    let best: { id: string; reason: string } | null = null;
    if (item.amount != null) {
      const cand = expenses
        .filter(
          (e) =>
            e.status === "posted" &&
            e.amount === item.amount &&
            Math.abs(
              new Date(e.transaction_date).getTime() -
                new Date(item.captured_at.slice(0, 10)).getTime(),
            ) <=
              3 * 86_400_000,
        )
        .sort((a, b) => (a.transaction_date < b.transaction_date ? -1 : 1))[0];
      if (cand) {
        best = {
          id: cand.id,
          reason: `Matches ${cand.expense_number} by amount + date`,
        };
      }
    }
    if (best) {
      out.push({
        inboxItem: item,
        expenseId: best.id,
        importedId: null,
        reason: best.reason,
      });
      continue;
    }
    // Try imported transactions.
    if (item.amount != null) {
      const cand = imported
        .filter(
          (t) =>
            t.amount === item.amount &&
            Math.abs(
              new Date(t.transaction_date).getTime() -
                new Date(item.captured_at.slice(0, 10)).getTime(),
            ) <=
              3 * 86_400_000,
        )
        .sort((a, b) => (a.transaction_date < b.transaction_date ? -1 : 1))[0];
      if (cand) {
        out.push({
          inboxItem: item,
          expenseId: null,
          importedId: cand.id,
          reason: `Matches bank transaction by amount + date`,
        });
      }
    }
  }
  return out;
}
