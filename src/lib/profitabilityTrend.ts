// Connect Pro Fleet — profitability trend data builder (Build #16).
// Builds daily-bucket series for the revenue/expense/profit charts from the
// authoritative ledgers, respecting the same semantics as the P&L selectors.

import type { FinancialTransaction } from "./chargeTypes";
import type { ExpenseTransaction, ExpenseCategory } from "./expenseTypes";
import {
  isRevenueCharge,
  isTaxCharge,
  isAcquisitionExpense,
  expenseNet,
  type DateRange,
} from "./profitabilityHelpers";

const DAY = 86_400_000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Daily revenue (recognized charges, excl. tax) within range. */
export function buildRevenueTrend(
  transactions: FinancialTransaction[],
  range: DateRange,
): { date: string; revenue: number }[] {
  const map = new Map<string, number>();
  const days: string[] = [];
  let cursor = new Date(range.start.getTime());
  while (cursor <= range.end) {
    const k = dayKey(cursor);
    map.set(k, 0);
    days.push(k);
    cursor = new Date(cursor.getTime() + DAY);
  }
  for (const t of transactions) {
    if (t.status !== "posted") continue;
    if (!isRevenueCharge(t)) continue;
    const k = t.effective_date.slice(0, 10);
    if (!map.has(k)) continue;
    map.set(k, (map.get(k) ?? 0) + t.amount);
  }
  return days.map((d) => ({
    date: d,
    revenue: Math.round((map.get(d) ?? 0) * 100) / 100,
  }));
}

/** Daily direct vehicle expenses (excl. overhead, excl. acquisition) within range. */
export function buildExpenseTrend(
  expenses: ExpenseTransaction[],
  categories: ExpenseCategory[],
  range: DateRange,
): { date: string; expenses: number }[] {
  const map = new Map<string, number>();
  const days: string[] = [];
  let cursor = new Date(range.start.getTime());
  while (cursor <= range.end) {
    const k = dayKey(cursor);
    map.set(k, 0);
    days.push(k);
    cursor = new Date(cursor.getTime() + DAY);
  }
  for (const e of expenses) {
    if (e.status === "voided") continue;
    if (!e.vehicle_id) continue; // vehicle direct only
    if (isAcquisitionExpense(e, categories)) continue;
    const k = e.transaction_date.slice(0, 10);
    if (!map.has(k)) continue;
    map.set(k, (map.get(k) ?? 0) + expenseNet(e));
  }
  return days.map((d) => ({
    date: d,
    expenses: Math.round((map.get(d) ?? 0) * 100) / 100,
  }));
}

/** Combined revenue + expense + profit daily series. */
export function buildProfitTrend(
  transactions: FinancialTransaction[],
  expenses: ExpenseTransaction[],
  categories: ExpenseCategory[],
  range: DateRange,
): { date: string; revenue: number; expenses: number; profit: number }[] {
  const rev = buildRevenueTrend(transactions, range);
  const exp = buildExpenseTrend(expenses, categories, range);
  return rev.map((r, i) => ({
    date: r.date,
    revenue: r.revenue,
    expenses: exp[i]?.expenses ?? 0,
    profit: Math.round((r.revenue - (exp[i]?.expenses ?? 0)) * 100) / 100,
  }));
}
