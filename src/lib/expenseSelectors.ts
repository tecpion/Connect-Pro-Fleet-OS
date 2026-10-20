// Connect Pro Fleet — Accounting Expense Ledger selectors (Build #14).
//
// Pure functions over expense transactions / line items / categories /
// reimbursements / petty cash. The accounting expense ledger is separate from
// the rental financial ledger — these selectors never touch customer money.
//
// Double-count prevention: maintenance work-order costs flow into the expense
// ledger as linked ExpenseTransactions (source = maintenance_work_order). The
// vehicle maintenance-cost selector sums ONLY non-reversed work-order-sourced
// expenses so a repair is counted once, not as (work-order cost + expense).
//
// Business-calendar ranges (e.g. getTotalExpensesForRange) are evaluated in the
// organization's configured timezone (`tz`), never the machine wall clock.

import type {
  CashAccount,
  CashEntry,
  ExpenseCategory,
  ExpenseEvent,
  ExpenseLineItem,
  ExpenseReceipt,
  ExpenseReimbursement,
  ExpenseTransaction,
} from "./expenseTypes";
import { TENDER_METHOD_LABELS } from "./paymentMethodTypes";
import { startOfDayInTz } from "./timezone";

const DAY = 86_400_000;

function startOfDay(d: Date, tz?: string): Date {
  if (tz) return startOfDayInTz(d, tz);
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inRange(date: string, start: Date, end: Date, tz?: string): boolean {
  // Anchor date-only values at local noon before reading org parts so a
  // date-only value never shifts a calendar day because of UTC parsing.
  const d = startOfDay(new Date(date + "T12:00:00Z"), tz);
  return d >= start && d <= end;
}

/** Next expense number in the EXP-YYYY-000000 sequence (tenant-scoped). */
export function nextExpenseNumber(expenses: ExpenseTransaction[]): string {
  const year = new Date().getFullYear();
  const max = expenses
    .map((e) => {
      const m = e.expense_number.match(/^EXP-(\d{4})-(\d+)$/);
      return m && m[1] === String(year) ? Number(m[2]) : 0;
    })
    .reduce((a, b) => Math.max(a, b), 0);
  return `EXP-${year}-${String(max + 1).padStart(6, "0")}`;
}

/** Effective amount of an expense for accounting: positive for posted, zero
 *  for voided, and for a reversal the original is netted out by the caller
 *  (reversals carry their own positive amount but reference reversal_of). */
export function effectiveAmount(e: ExpenseTransaction): number {
  if (e.status === "voided") return 0;
  return e.amount;
}

/** Is this expense a reversal of another (correction) entry? */
export function isReversal(e: ExpenseTransaction): boolean {
  return e.reversal_of !== null;
}

/** Net spending total for a set of expenses: posted originals minus posted
 *  reversals (a reversal is a negative contribution). Voided entries count 0. */
export function netExpenseTotal(expenses: ExpenseTransaction[]): number {
  return expenses.reduce((sum, e) => {
    if (e.status === "voided") return sum;
    return sum + (isReversal(e) ? -e.amount : e.amount);
  }, 0);
}

/** All posted (non-voided) expenses — reversals included as negative. */
export function activeExpenses(
  expenses: ExpenseTransaction[],
): ExpenseTransaction[] {
  return expenses.filter((e) => e.status === "posted");
}

/** Expenses for a specific vehicle (vehicle_id on the expense OR any line item
 *  allocated to it). Excludes voided. */
export function getVehicleExpenses(
  expenses: ExpenseTransaction[],
  lineItems: ExpenseLineItem[],
  vehicleId: string,
): ExpenseTransaction[] {
  const liExpenseIds = new Set(
    lineItems
      .filter((l) => l.vehicle_id === vehicleId)
      .map((l) => l.expense_id),
  );
  return expenses.filter(
    (e) =>
      e.status === "posted" &&
      (e.vehicle_id === vehicleId || liExpenseIds.has(e.id)),
  );
}

/** Company-overhead expenses (scope = company_overhead). Excludes voided. */
export function getCompanyOverheadExpenses(
  expenses: ExpenseTransaction[],
): ExpenseTransaction[] {
  return expenses.filter(
    (e) =>
      e.status === "posted" &&
      e.maintenance_work_order_id === null &&
      e.vehicle_id === null &&
      e.rental_id === null,
  );
}

/** Expenses grouped by category (net amount). */
export function getExpensesByCategory(
  expenses: ExpenseTransaction[],
  categories: ExpenseCategory[],
): { category: ExpenseCategory | null; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    if (e.status === "voided") continue;
    const key = e.expense_category_id ?? "__none__";
    const cur = map.get(key) ?? { total: 0, count: 0 };
    cur.total += isReversal(e) ? -e.amount : e.amount;
    cur.count += 1;
    map.set(key, cur);
  }
  return Array.from(map.entries()).map(([key, v]) => ({
    category:
      key === "__none__"
        ? null
        : (categories.find((c) => c.id === key) ?? null),
    total: v.total,
    count: v.count,
  }));
}

/** Expenses grouped by payment method (net amount). */
export function getExpensesByPaymentMethod(
  expenses: ExpenseTransaction[],
): { method: string; label: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    if (e.status === "voided") continue;
    const cur = map.get(e.payment_method) ?? { total: 0, count: 0 };
    cur.total += isReversal(e) ? -e.amount : e.amount;
    cur.count += 1;
    map.set(e.payment_method, cur);
  }
  return Array.from(map.entries()).map(([method, v]) => ({
    method,
    label:
      TENDER_METHOD_LABELS[method as keyof typeof TENDER_METHOD_LABELS] ??
      method,
    total: v.total,
    count: v.count,
  }));
}

/** Expenses grouped by vendor (net amount). */
export function getExpensesByVendor(
  expenses: ExpenseTransaction[],
  vendorName: (id: string | null) => string,
): { vendorId: string | null; vendor: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    if (e.status === "voided") continue;
    const key = e.vendor_id ?? "__none__";
    const cur = map.get(key) ?? { total: 0, count: 0 };
    cur.total += isReversal(e) ? -e.amount : e.amount;
    cur.count += 1;
    map.set(key, cur);
  }
  return Array.from(map.entries()).map(([key, v]) => ({
    vendorId: key === "__none__" ? null : key,
    vendor: key === "__none__" ? "No vendor" : vendorName(key),
    total: v.total,
    count: v.count,
  }));
}

/** Cash expenses (payment_method = cash), net. */
export function getCashExpenses(
  expenses: ExpenseTransaction[],
): ExpenseTransaction[] {
  return expenses.filter(
    (e) => e.status === "posted" && e.payment_method === "cash",
  );
}

/** Expenses missing a required receipt (posted, receipt_required, no active
 *  receipt). Useful for the Missing Receipts queue. */
export function getExpensesMissingReceipts(
  expenses: ExpenseTransaction[],
  receipts: ExpenseReceipt[],
): ExpenseTransaction[] {
  const activeReceipts = new Set(
    receipts.filter((r) => !r.voided_at).map((r) => r.expense_id),
  );
  return expenses.filter(
    (e) =>
      e.status === "posted" &&
      e.receipt_required &&
      e.receipt_status === "missing" &&
      !activeReceipts.has(e.id),
  );
}

/** Outstanding (owed + approved) reimbursements. */
export function getOutstandingReimbursements(
  reimbursements: ExpenseReimbursement[],
): ExpenseReimbursement[] {
  return reimbursements.filter(
    (r) => r.status === "owed" || r.status === "approved",
  );
}

/** Total outstanding reimbursement amount. */
export function getOutstandingReimbursementTotal(
  reimbursements: ExpenseReimbursement[],
): number {
  return getOutstandingReimbursements(reimbursements).reduce(
    (s, r) => s + r.amount,
    0,
  );
}

/** Total expenses within a date range (net, by transaction_date). `tz` (org
 *  timezone) makes the range boundaries org-local. */
export function getTotalExpensesForRange(
  expenses: ExpenseTransaction[],
  start: Date,
  end: Date,
  tz?: string,
): number {
  return netExpenseTotal(
    expenses.filter((e) => inRange(e.transaction_date, start, end, tz)),
  );
}

/** Monthly expenses for a YYYY-MM key (net, by transaction_date). */
export function getMonthlyExpenses(
  expenses: ExpenseTransaction[],
  yearMonth: string,
): number {
  return netExpenseTotal(
    expenses.filter((e) => e.transaction_date.slice(0, 7) === yearMonth),
  );
}

/** Vehicle direct-expense total (vehicle-scoped, net). Excludes
 *  maintenance-work-order-sourced expenses to avoid double-counting with the
 *  work-order cost selector — those are counted via the maintenance path. */
export function getVehicleDirectExpenseTotal(
  expenses: ExpenseTransaction[],
  lineItems: ExpenseLineItem[],
  vehicleId: string,
): number {
  const liExpenseIds = new Set(
    lineItems
      .filter((l) => l.vehicle_id === vehicleId)
      .map((l) => l.expense_id),
  );
  return netExpenseTotal(
    expenses.filter(
      (e) =>
        e.status === "posted" &&
        (e.vehicle_id === vehicleId || liExpenseIds.has(e.id)) &&
        e.source !== "maintenance_work_order",
    ),
  );
}

/** Maintenance work-order-sourced expenses for a vehicle (net). This is the
 *  authoritative maintenance cost path — counted once here, not again as a
 *  generic vehicle expense. */
export function getVehicleMaintenanceExpenseTotal(
  expenses: ExpenseTransaction[],
  workOrderVehicleId: (woId: string) => string | null,
  vehicleId: string,
): number {
  return netExpenseTotal(
    expenses.filter((e) => {
      if (e.status !== "posted" || e.source !== "maintenance_work_order")
        return false;
      return (
        workOrderVehicleId(e.maintenance_work_order_id ?? "") === vehicleId
      );
    }),
  );
}

/** Petty cash balance for an account: opening + cash_in - cash_out + adjustments. */
export function getCashAccountBalance(
  account: CashAccount,
  entries: CashEntry[],
): number {
  const acctEntries = entries.filter((e) => e.cash_account_id === account.id);
  const net = acctEntries.reduce((sum, e) => {
    if (e.entry_type === "cash_in") return sum + e.amount;
    if (e.entry_type === "cash_out") return sum - e.amount;
    return sum + e.amount; // adjustment can be +/- but stored positive; sign by convention
  }, 0);
  return account.opening_balance + net;
}

/** Search expenses by number, description, vendor, vehicle, work order. */
export function searchExpenses(
  expenses: ExpenseTransaction[],
  vendorName: (id: string | null) => string,
  vehicleLabel: (id: string | null) => string,
  query: string,
): ExpenseTransaction[] {
  const q = query.trim().toLowerCase();
  if (!q) return expenses;
  return expenses.filter((e) => {
    if (e.expense_number.toLowerCase().includes(q)) return true;
    if (e.description.toLowerCase().includes(q)) return true;
    if ((e.memo ?? "").toLowerCase().includes(q)) return true;
    if (vendorName(e.vendor_id).toLowerCase().includes(q)) return true;
    if (vehicleLabel(e.vehicle_id).toLowerCase().includes(q)) return true;
    return false;
  });
}

/** Events for an expense (chronological, newest first). */
export function expenseEventsFor(
  events: ExpenseEvent[],
  expenseId: string,
): ExpenseEvent[] {
  return events
    .filter((e) => e.expense_id === expenseId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Active (non-voided) receipts for an expense. */
export function activeReceiptsFor(
  receipts: ExpenseReceipt[],
  expenseId: string,
): ExpenseReceipt[] {
  return receipts
    .filter((r) => r.expense_id === expenseId && !r.voided_at)
    .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
}

/** All receipts for an expense including voided (history). */
export function allReceiptsFor(
  receipts: ExpenseReceipt[],
  expenseId: string,
): ExpenseReceipt[] {
  return receipts
    .filter((r) => r.expense_id === expenseId)
    .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
}

/** Detect a likely duplicate expense (same tenant/amount/date/vendor/vehicle).
 *  Returns true if another posted expense matches — used to WARN, not block. */
export function isLikelyDuplicate(
  expenses: ExpenseTransaction[],
  expense: {
    amount: number;
    transaction_date: string;
    vendor_id: string | null;
    vehicle_id: string | null;
    maintenance_work_order_id: string | null;
  },
  excludeId?: string,
): boolean {
  return expenses.some(
    (e) =>
      e.id !== excludeId &&
      e.status === "posted" &&
      e.amount === expense.amount &&
      e.transaction_date === expense.transaction_date &&
      e.vendor_id === expense.vendor_id &&
      e.vehicle_id === expense.vehicle_id &&
      e.maintenance_work_order_id === expense.maintenance_work_order_id,
  );
}

/** Line items for an expense. */
export function lineItemsFor(
  lineItems: ExpenseLineItem[],
  expenseId: string,
): ExpenseLineItem[] {
  return lineItems.filter((l) => l.expense_id === expenseId);
}

/** Validate that line items sum to the expense amount (rounding-safe). */
export function validateLineItems(
  lineItems: ExpenseLineItem[],
  expenseAmount: number,
): boolean {
  const sum = lineItems.reduce((s, l) => s + l.amount, 0);
  return Math.abs(sum - expenseAmount) < 0.005;
}

/** Reimbursement for an expense (the active one, if any). */
export function reimbursementFor(
  reimbursements: ExpenseReimbursement[],
  expenseId: string,
): ExpenseReimbursement | undefined {
  return reimbursements
    .filter((r) => r.expense_id === expenseId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
}

export { startOfDay, DAY };
