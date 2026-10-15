// Connect Pro Fleet — profitability helpers (Build #16).
//
// Shared date-range + revenue/expense classification helpers used by the
// profitability selectors. Pure functions, no React.

import type { FinancialTransaction } from "./chargeTypes";
import type { ExpenseCategory, ExpenseTransaction } from "./expenseTypes";
import type { FeeRule } from "./taxFeeTypes";
import type {
  RevenueBreakdown,
  VehicleExpenseBreakdown,
} from "./profitabilityTypes";
import { depositKind, isDepositHeldEvent } from "./deposit";
import { isReversal as isExpenseReversal } from "./expenseSelectors";

const DAY = 86_400_000;

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function inRange(date: string, start: Date, end: Date): boolean {
  const d = new Date(date + "T00:00:00");
  return d >= start && d <= end;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function safeDiv(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

export { DAY };

export interface DateRange {
  start: Date;
  end: Date;
}

export function resolveProfitabilityRange(
  range:
    | "today"
    | "this_week"
    | "this_month"
    | "last_month"
    | "last_30_days"
    | "this_quarter"
    | "this_year"
    | "custom",
  custom?: { start: string; end: string },
  now = new Date(),
): DateRange {
  const today = startOfDay(now);
  switch (range) {
    case "today":
      return { start: today, end: endOfDay(now) };
    case "this_week": {
      const day = (now.getDay() + 6) % 7;
      return {
        start: startOfDay(new Date(now.getTime() - day * DAY)),
        end: endOfDay(now),
      };
    }
    case "this_month":
      return {
        start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: endOfDay(now),
      };
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    case "last_30_days": {
      // Build #33 — real rolling 30-day window ending today (inclusive).
      return {
        start: startOfDay(new Date(now.getTime() - 29 * DAY)),
        end: endOfDay(now),
      };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return {
        start: startOfDay(new Date(now.getFullYear(), q * 3, 1)),
        end: endOfDay(now),
      };
    }
    case "this_year":
      return {
        start: startOfDay(new Date(now.getFullYear(), 0, 1)),
        end: endOfDay(now),
      };
    case "custom": {
      // Guard against empty/partial custom dates (e.g. user selected Custom
      // but hasn't picked a range yet). Fall back to "this month" so the
      // profitability selectors never receive an Invalid Date — which would
      // throw on toISOString() downstream.
      const cs = custom?.start;
      const ce = custom?.end;
      if (!cs || !ce) {
        return {
          start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
          end: endOfDay(now),
        };
      }
      return {
        start: startOfDay(new Date(cs + "T00:00:00")),
        end: endOfDay(new Date(ce + "T00:00:00")),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Revenue classification
// ---------------------------------------------------------------------------

/** Is this transaction a recognized operating revenue charge? */
export function isRevenueCharge(t: FinancialTransaction): boolean {
  if (t.status !== "posted") return false;
  if (t.category !== "charge") return false;
  if (isDepositHeldEvent(t)) return false;
  const dk = depositKind(t);
  if (dk === "forfeiture") return true;
  if (t.transaction_type === "tax_charge") return false;
  // Build #19 — migration opening balance is a pre-existing receivable, NOT
  // current-period earned revenue. Collections against it count as cash
  // collected after migration, but the charge itself is excluded from
  // revenue/profitability so it doesn't inflate Fleet-period P&L.
  if (t.transaction_type === "migration_opening_balance") return false;
  return true;
}

/** Is this a fee charge that is eligible for VEHICLE-level revenue (Build #16
 *  cleanup)? A fee_charge carries metadata.include_in_vehicle_revenue (set
 *  from the FeeRule at posting time). Fees without that flag are valid COMPANY
 *  revenue but excluded from vehicle revenue. Non-fee charges are always
 *  vehicle-eligible (rental charges, late fees, forfeitures, etc.). */
export function isVehicleEligibleRevenue(t: FinancialTransaction): boolean {
  if (!isRevenueCharge(t)) return false;
  if (t.transaction_type !== "fee_charge") return true;
  const md = t.metadata as Record<string, unknown> | null;
  return md?.include_in_vehicle_revenue === true;
}

/** Is this a fee charge that is recognized COMPANY revenue but NOT vehicle
 *  revenue (include_in_vehicle_revenue === false)? These count toward company
 *  operating revenue but are excluded from vehicle P&L. */
export function isCompanyOnlyFeeRevenue(t: FinancialTransaction): boolean {
  if (!isRevenueCharge(t)) return false;
  if (t.transaction_type !== "fee_charge") return false;
  const md = t.metadata as Record<string, unknown> | null;
  return md?.include_in_vehicle_revenue !== true;
}

export function isTaxCharge(t: FinancialTransaction): boolean {
  return (
    t.status === "posted" &&
    t.category === "charge" &&
    t.transaction_type === "tax_charge"
  );
}

export function classifyRevenue(
  t: FinancialTransaction,
): keyof Omit<RevenueBreakdown, "tax_collected" | "total_revenue"> {
  const dk = depositKind(t);
  if (dk === "forfeiture") return "forfeiture_revenue";
  switch (t.transaction_type) {
    case "rental_charge":
    case "weekly_rental_charge":
      return "base_rental_revenue";
    case "late_fee":
      return "late_fee_revenue";
    case "fee_charge":
      return "fee_revenue";
    default:
      return "other_revenue";
  }
}

/** Build a revenue breakdown from a set of transactions. When `vehicleEligible`
 *  is true, fee charges marked include_in_vehicle_revenue=false are excluded
 *  (they remain valid company revenue but not vehicle revenue). When false
 *  (company view), ALL recognized revenue charges are included. */
export function buildRevenueBreakdown(
  txns: FinancialTransaction[],
  vehicleEligible = false,
): RevenueBreakdown {
  const rev: RevenueBreakdown = {
    base_rental_revenue: 0,
    fee_revenue: 0,
    late_fee_revenue: 0,
    forfeiture_revenue: 0,
    other_revenue: 0,
    tax_collected: 0,
    total_revenue: 0,
  };
  for (const t of txns) {
    if (isTaxCharge(t)) {
      rev.tax_collected += t.amount;
      continue;
    }
    if (!isRevenueCharge(t)) continue;
    if (vehicleEligible && !isVehicleEligibleRevenue(t)) continue;
    rev[classifyRevenue(t)] += t.amount;
  }
  rev.total_revenue =
    rev.base_rental_revenue +
    rev.fee_revenue +
    rev.late_fee_revenue +
    rev.forfeiture_revenue +
    rev.other_revenue;
  return rev;
}

// ---------------------------------------------------------------------------
// Expense helpers
// ---------------------------------------------------------------------------

export function isAcquisitionExpense(
  e: ExpenseTransaction,
  categories: ExpenseCategory[],
): boolean {
  const cat = categories.find((c) => c.id === e.expense_category_id);
  const name = (cat?.name ?? "").toLowerCase();
  return name.includes("acquisition") || name.includes("purchase");
}

export function isProcessorFeeExpense(
  e: ExpenseTransaction,
  categories: ExpenseCategory[],
): boolean {
  const cat = categories.find((c) => c.id === e.expense_category_id);
  const name = (cat?.name ?? "").toLowerCase();
  return (
    name.includes("processing") ||
    name.includes("merchant") ||
    name.includes("processor")
  );
}

export function expenseNet(e: ExpenseTransaction): number {
  if (e.status === "voided") return 0;
  return isExpenseReversal(e) ? -e.amount : e.amount;
}

export function emptyExpenseBreakdown(): VehicleExpenseBreakdown {
  return {
    maintenance_expenses: 0,
    registration_expenses: 0,
    insurance_expenses: 0,
    fuel_expenses: 0,
    other_vehicle_expenses: 0,
    total_direct_expenses: 0,
    acquisition_spend: 0,
  };
}
