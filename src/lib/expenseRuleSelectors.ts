// Connect Pro Fleet — Expenses V1 rule + analytics selectors.
//
// Pure functions over the existing expense ledger. These COMPOSE authoritative
// data — they never duplicate financial records or alter calculations.
//
// - Rule matching: most-specific applicable rule wins; ambiguity → review.
// - Merchant memory: last category/scope used for a merchant (suggestion only).
// - Month-end checklist: operational cleanup counts (NOT formal accounting).
// - Vendor spend, spend-by-category, spend alerts, budget vs actual.

import type {
  ExpenseCategory,
  ExpenseRule,
  ExpenseTransaction,
  ReceiptInboxItem,
  RuleCandidate,
  RuleMatchResult,
  SpendAlert,
  CategoryBudget,
} from "./expenseTypes";
import { isReversal, netExpenseTotal } from "./expenseSelectors";

// ---------------------------------------------------------------------------
// Rule matching
// ---------------------------------------------------------------------------

/** Does a single condition match a candidate transaction? */
function conditionMatches(
  rule: ExpenseRule,
  candidate: RuleCandidate,
): boolean {
  return rule.conditions.every((c) => {
    const field = c.field;
    const val = String(c.value).toLowerCase();
    switch (field) {
      case "merchant_equals": {
        const m = (candidate.merchant ?? "").toLowerCase();
        return m === val;
      }
      case "merchant_contains": {
        const m = (candidate.merchant ?? "").toLowerCase();
        return m.includes(val);
      }
      case "description_contains": {
        return (candidate.description ?? "").toLowerCase().includes(val);
      }
      case "amount_equals": {
        return Math.abs(candidate.amount - Number(c.value)) < 0.005;
      }
      case "amount_min": {
        return candidate.amount >= Number(c.value);
      }
      case "amount_max": {
        return candidate.amount <= Number(c.value);
      }
      case "account_id": {
        return (candidate.account_id ?? "") === String(c.value);
      }
      case "transaction_type": {
        return (candidate.transaction_type ?? "").toLowerCase() === val;
      }
      default:
        return false;
    }
  });
}

/** Specificity score: more conditions + more specific fields = higher score.
 *  merchant_equals > merchant_contains > description_contains > others. */
function specificity(rule: ExpenseRule): number {
  let score = rule.conditions.length * 10;
  for (const c of rule.conditions) {
    if (c.field === "merchant_equals") score += 5;
    else if (c.field === "merchant_contains") score += 3;
    else if (c.field === "amount_equals") score += 4;
    else if (c.field === "account_id") score += 2;
  }
  return score;
}

/** Find the best matching active rule for a candidate transaction.
 *  - If exactly one rule matches (or one is strictly most-specific): matched.
 *  - If multiple rules tie on specificity: ambiguous → review required.
 *  - If no rules match: not matched. */
export function matchExpenseRule(
  rules: ExpenseRule[],
  candidate: RuleCandidate,
): RuleMatchResult {
  const matching = rules
    .filter((r) => r.active && conditionMatches(r, candidate))
    .sort((a, b) => specificity(b) - specificity(a));
  if (matching.length === 0) return { matched: false };
  const top = matching[0];
  const ambiguous =
    matching.length > 1 && specificity(matching[1]) === specificity(top);
  return { matched: true, ruleId: top.id, mode: top.mode, ambiguous };
}

/** Resolve the rule action for a matched candidate (for transparency display). */
export function resolveRuleAction(
  rules: ExpenseRule[],
  ruleId: string,
): ExpenseRule | undefined {
  return rules.find((r) => r.id === ruleId);
}

// ---------------------------------------------------------------------------
// Merchant memory (suggestion only — no formal rule required)
// ---------------------------------------------------------------------------

export interface MerchantMemory {
  merchant: string;
  category_id: string | null;
  category_name: string | null;
  scope: string | null;
  vehicle_id: string | null;
  last_used: string;
}

/** Remember the last category/scope used for a merchant across posted expenses.
 *  Returns the most recent entry per merchant (case-insensitive). */
export function merchantMemory(
  expenses: ExpenseTransaction[],
  categories: ExpenseCategory[],
): MerchantMemory[] {
  const map = new Map<string, MerchantMemory>();
  const sorted = [...expenses]
    .filter((e) => e.status === "posted" && !isReversal(e))
    .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1));
  for (const e of sorted) {
    const merchant = (e.description ?? "").trim();
    if (!merchant) continue;
    const key = merchant.toLowerCase();
    if (map.has(key)) continue;
    const cat = e.expense_category_id
      ? (categories.find((c) => c.id === e.expense_category_id) ?? null)
      : null;
    const scope = e.vehicle_id ? "vehicle" : "company_overhead";
    map.set(key, {
      merchant,
      category_id: e.expense_category_id,
      category_name: cat?.name ?? null,
      scope,
      vehicle_id: e.vehicle_id,
      last_used: e.transaction_date,
    });
  }
  return Array.from(map.values());
}

/** Look up merchant memory for a specific merchant string (suggestion only). */
export function memoryForMerchant(
  memory: MerchantMemory[],
  merchant: string,
): MerchantMemory | undefined {
  const key = merchant.toLowerCase().trim();
  return memory.find((m) => m.merchant.toLowerCase() === key);
}

// ---------------------------------------------------------------------------
// Allocation state
// ---------------------------------------------------------------------------

export type AllocationState =
  "fully_allocated" | "partially_allocated" | "unallocated";

/** Determine allocation state for an expense.
 *  - Vehicle-scoped expense with vehicle_id → fully allocated.
 *  - Overhead (no vehicle, no WO) → fully allocated (overhead is a valid target).
 *  - Has line items but some unallocated → partially.
 *  - No vehicle, no WO, no line items, not overhead → unallocated. */
export function allocationState(
  expense: ExpenseTransaction,
  hasLineItems: boolean,
): AllocationState {
  if (expense.vehicle_id || expense.maintenance_work_order_id)
    return "fully_allocated";
  if (expense.rental_id) return "fully_allocated";
  // No vehicle/WO/rental → overhead by default (a valid allocation target).
  if (!hasLineItems) return "fully_allocated";
  return "partially_allocated";
}

/** Expenses that are genuinely unallocated (need a vehicle/overhead decision). */
export function getUnallocatedExpenses(
  expenses: ExpenseTransaction[],
  lineItemExpenseIds: Set<string>,
): ExpenseTransaction[] {
  return expenses.filter(
    (e) =>
      e.status === "posted" &&
      !isReversal(e) &&
      !e.vehicle_id &&
      !e.maintenance_work_order_id &&
      !e.rental_id &&
      !lineItemExpenseIds.has(e.id) &&
      e.expense_category_id === null,
  );
}

// ---------------------------------------------------------------------------
// Month-end expense check (operational cleanup — NOT formal accounting close)
// ---------------------------------------------------------------------------

export interface MonthEndChecklist {
  month_key: string;
  missing_receipts: number;
  unallocated_expenses: number;
  unmatched_bank_transactions: number;
  reimbursements_owed: number;
  expenses_awaiting_review: number;
  unmatched_receipts: number;
  status: "needs_attention" | "ready_for_review";
}

/** Build the month-end cleanup checklist for a YYYY-MM month. */
export function monthEndChecklist(
  monthKey: string,
  expenses: ExpenseTransaction[],
  receipts: { expense_id: string; voided_at: string | null }[],
  reimbursements: { status: string }[],
  receiptInbox: { month_key: string; state: string }[],
  importedTransactions: {
    matched_expense_id: string | null;
    ignored: boolean;
  }[],
  lineItemExpenseIds: Set<string>,
): MonthEndChecklist {
  const monthExpenses = expenses.filter(
    (e) => e.transaction_date.slice(0, 7) === monthKey && e.status === "posted",
  );
  const activeReceiptIds = new Set(
    receipts.filter((r) => !r.voided_at).map((r) => r.expense_id),
  );
  const missingReceipts = monthExpenses.filter(
    (e) =>
      e.receipt_required &&
      e.receipt_status === "missing" &&
      !activeReceiptIds.has(e.id),
  ).length;
  const unallocated = getUnallocatedExpenses(
    monthExpenses,
    lineItemExpenseIds,
  ).length;
  const unmatchedBank = importedTransactions.filter(
    (t) => !t.matched_expense_id && !t.ignored,
  ).length;
  const reimbursementsOwed = reimbursements.filter(
    (r) => r.status === "owed" || r.status === "approved",
  ).length;
  const awaitingReview = monthExpenses.filter(
    (e) =>
      (e.metadata as Record<string, unknown> | null)?.review_state ===
      "needs_review",
  ).length;
  const monthInbox = receiptInbox.filter((i) => i.month_key === monthKey);
  const unmatchedReceipts = monthInbox.filter(
    (i) =>
      i.state === "unmatched" ||
      i.state === "missing_info" ||
      i.state === "needs_review",
  ).length;
  const issues =
    missingReceipts +
    unallocated +
    unmatchedBank +
    reimbursementsOwed +
    awaitingReview +
    unmatchedReceipts;
  return {
    month_key: monthKey,
    missing_receipts: missingReceipts,
    unallocated_expenses: unallocated,
    unmatched_bank_transactions: unmatchedBank,
    reimbursements_owed: reimbursementsOwed,
    expenses_awaiting_review: awaitingReview,
    unmatched_receipts: unmatchedReceipts,
    status: issues > 0 ? "needs_attention" : "ready_for_review",
  };
}

// ---------------------------------------------------------------------------
// Vendor spend
// ---------------------------------------------------------------------------

export interface VendorSpend {
  vendor_id: string | null;
  vendor: string;
  spend: number;
  transaction_count: number;
  top_category_id: string | null;
  top_category_name: string | null;
  last_expense_date: string | null;
}

/** Vendor spend summary for a set of expenses. */
export function vendorSpend(
  expenses: ExpenseTransaction[],
  categories: ExpenseCategory[],
  vendorName: (id: string | null) => string,
): VendorSpend[] {
  const map = new Map<string, VendorSpend>();
  for (const e of expenses) {
    if (e.status === "voided") continue;
    const key = e.vendor_id ?? "__none__";
    const cur = map.get(key) ?? {
      vendor_id: e.vendor_id,
      vendor: e.vendor_id ? vendorName(e.vendor_id) : "No vendor",
      spend: 0,
      transaction_count: 0,
      top_category_id: null,
      top_category_name: null,
      last_expense_date: null,
    };
    cur.spend += isReversal(e) ? -e.amount : e.amount;
    cur.transaction_count += 1;
    if (!cur.last_expense_date || e.transaction_date > cur.last_expense_date) {
      cur.last_expense_date = e.transaction_date;
    }
    map.set(key, cur);
  }
  // Resolve top category per vendor.
  for (const v of map.values()) {
    const catSpend = new Map<string, number>();
    for (const e of expenses) {
      if (e.status === "voided") continue;
      if ((e.vendor_id ?? "__none__") !== (v.vendor_id ?? "__none__")) continue;
      if (!e.expense_category_id) continue;
      catSpend.set(
        e.expense_category_id,
        (catSpend.get(e.expense_category_id) ?? 0) +
          (isReversal(e) ? -e.amount : e.amount),
      );
    }
    let topId: string | null = null;
    let topAmt = -Infinity;
    for (const [id, amt] of catSpend) {
      if (amt > topAmt) {
        topAmt = amt;
        topId = id;
      }
    }
    v.top_category_id = topId;
    v.top_category_name = topId
      ? (categories.find((c) => c.id === topId)?.name ?? null)
      : null;
  }
  return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
}

// ---------------------------------------------------------------------------
// Spend by category ("Where the Money Went")
// ---------------------------------------------------------------------------

export interface CategorySpend {
  category: ExpenseCategory | null;
  group: "vehicle" | "overhead";
  spend: number;
  count: number;
}

/** Spend grouped by category for a date range, split by group. */
export function spendByCategory(
  expenses: ExpenseTransaction[],
  categories: ExpenseCategory[],
  start: Date,
  end: Date,
): CategorySpend[] {
  const inRange = expenses.filter((e) => {
    if (e.status === "voided") return false;
    const d = new Date(e.transaction_date + "T00:00:00");
    return d >= start && d <= end;
  });
  const map = new Map<string, { spend: number; count: number }>();
  for (const e of inRange) {
    const key = e.expense_category_id ?? "__none__";
    const cur = map.get(key) ?? { spend: 0, count: 0 };
    cur.spend += isReversal(e) ? -e.amount : e.amount;
    cur.count += 1;
    map.set(key, cur);
  }
  return Array.from(map.entries()).map(([key, v]) => {
    const cat =
      key === "__none__"
        ? null
        : (categories.find((c) => c.id === key) ?? null);
    const group: "vehicle" | "overhead" =
      cat?.group ?? (key === "__none__" ? "overhead" : "overhead");
    return { category: cat, group, spend: v.spend, count: v.count };
  });
}

// ---------------------------------------------------------------------------
// Spend alerts
// ---------------------------------------------------------------------------

export interface TriggeredAlert {
  alert: SpendAlert;
  expenses: ExpenseTransaction[];
  total: number;
}

/** Evaluate spend alerts against a set of expenses. Returns triggered alerts. */
export function evaluateSpendAlerts(
  alerts: SpendAlert[],
  expenses: ExpenseTransaction[],
): TriggeredAlert[] {
  const result: TriggeredAlert[] = [];
  for (const alert of alerts) {
    if (!alert.active) continue;
    let triggered: ExpenseTransaction[] = [];
    if (alert.metric === "single_expense") {
      triggered = expenses.filter(
        (e) =>
          e.status === "posted" &&
          !isReversal(e) &&
          e.amount >= alert.threshold,
      );
    } else if (alert.metric === "maintenance_expense") {
      triggered = expenses.filter(
        (e) =>
          e.status === "posted" &&
          !isReversal(e) &&
          e.source === "maintenance_work_order" &&
          e.amount >= alert.threshold,
      );
    } else if (alert.metric === "vehicle_expense") {
      triggered = expenses.filter(
        (e) =>
          e.status === "posted" &&
          !isReversal(e) &&
          e.vehicle_id !== null &&
          e.amount >= alert.threshold,
      );
    } else if (alert.metric === "category_spend" && alert.category_id) {
      const catTotal = netExpenseTotal(
        expenses.filter(
          (e) =>
            e.status === "posted" &&
            e.expense_category_id === alert.category_id,
        ),
      );
      if (catTotal >= alert.threshold) {
        result.push({
          alert,
          expenses: expenses.filter(
            (e) => e.expense_category_id === alert.category_id,
          ),
          total: catTotal,
        });
      }
      continue;
    }
    if (triggered.length > 0) {
      result.push({
        alert,
        expenses: triggered,
        total: triggered.reduce((s, e) => s + e.amount, 0),
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Budget vs actual
// ---------------------------------------------------------------------------

export interface BudgetVsActual {
  category: ExpenseCategory;
  budget: number;
  actual: number;
  difference: number;
}

/** Budget vs actual for a month. Only categories with a budget are returned. */
export function budgetVsActual(
  budgets: CategoryBudget[],
  categories: ExpenseCategory[],
  expenses: ExpenseTransaction[],
  monthKey: string,
): BudgetVsActual[] {
  const monthBudgets = budgets.filter((b) => b.month_key === monthKey);
  return monthBudgets
    .map((b) => {
      const cat = categories.find((c) => c.id === b.category_id);
      if (!cat) return null;
      const actual = netExpenseTotal(
        expenses.filter(
          (e) =>
            e.status === "posted" &&
            e.expense_category_id === b.category_id &&
            e.transaction_date.slice(0, 7) === monthKey,
        ),
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
