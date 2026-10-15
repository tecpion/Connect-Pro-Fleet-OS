// Connect Pro Fleet — Vehicle Performance expense breakdown + financing.
//
// Re-buckets authoritative vehicle-linked expenses into the owner-facing view
// (maintenance, insurance, registration, GPS, cleaning, fuel, other) and
// separates financing/car-note payments. Financing payments reduce cash-flow
// contribution only — they are NOT operating expenses. Pure function, no React.

import type {
  ExpenseCategory,
  ExpenseLineItem,
  ExpenseTransaction,
} from "./expenseTypes";
import type { DateRange } from "./profitabilityHelpers";
import { inRange, round2 } from "./profitabilityHelpers";
import { vehicleDirectExpenses } from "./profitabilityAttribution";
import type { ProfitabilityInputs } from "./profitabilitySelectors";

export interface ExpenseBreakdownView {
  maintenance: number;
  insurance: number;
  registration: number;
  gps: number;
  cleaning: number;
  fuel: number;
  other: number;
  total: number;
}

export interface FinancingView {
  financingState: "paid_off" | "financed";
  carNotePayments: number;
  hasFinancingData: boolean;
  /** True when the vehicle has no recorded purchase price (acquisition basis unknown). */
  purchasePriceMissing: boolean;
}

function isFinancingCategory(
  e: ExpenseTransaction,
  categories: ExpenseCategory[],
): boolean {
  const cat = categories.find((c) => c.id === e.expense_category_id);
  const name = (cat?.name ?? "").toLowerCase();
  return (
    name.includes("financing") ||
    name.includes("car note") ||
    name.includes("car-note") ||
    name.includes("loan") ||
    name.includes("lease payment")
  );
}

function isGpsCategory(
  e: ExpenseTransaction,
  categories: ExpenseCategory[],
): boolean {
  const cat = categories.find((c) => c.id === e.expense_category_id);
  const name = (cat?.name ?? "").toLowerCase();
  return (
    name.includes("gps") ||
    name.includes("telematics") ||
    name.includes("tracking") ||
    name.includes("subscription")
  );
}

function isCleaningCategory(
  e: ExpenseTransaction,
  categories: ExpenseCategory[],
): boolean {
  const cat = categories.find((c) => c.id === e.expense_category_id);
  const name = (cat?.name ?? "").toLowerCase();
  return name.includes("cleaning") || name.includes("detailing");
}

function expenseNet(e: ExpenseTransaction): number {
  if (e.status === "voided") return 0;
  return e.reversal_of ? -e.amount : e.amount;
}

export function computeExpenseBreakdown(
  inputs: ProfitabilityInputs,
  vehicleId: string,
  range: DateRange,
): { breakdown: ExpenseBreakdownView; financingPayments: number } {
  // Touch the authoritative selector so maintenance non-double-counting +
  // acquisition-spend exclusion rules are respected.
  vehicleDirectExpenses(
    inputs.expenses,
    inputs.expenseLineItems,
    inputs.expenseCategories,
    vehicleId,
    range,
  );

  let maintenance = 0;
  let insurance = 0;
  let registration = 0;
  let gps = 0;
  let cleaning = 0;
  let fuel = 0;
  let other = 0;
  let financing = 0;

  const liByExpense = new Map<string, ExpenseLineItem[]>();
  for (const li of inputs.expenseLineItems) {
    const arr = liByExpense.get(li.expense_id) ?? [];
    arr.push(li);
    liByExpense.set(li.expense_id, arr);
  }

  for (const e of inputs.expenses) {
    if (e.status === "voided") continue;
    if (!inRange(e.transaction_date, range.start, range.end)) continue;
    const lines = liByExpense.get(e.id) ?? [];
    const hasLines = lines.length > 0;
    const vehicleLineAmount = lines
      .filter((l) => l.vehicle_id === vehicleId)
      .reduce((s, l) => s + expenseNet({ ...e, amount: l.amount }), 0);
    const touchesVehicle =
      e.vehicle_id === vehicleId || vehicleLineAmount !== 0;
    if (!touchesVehicle) continue;
    const net = hasLines ? vehicleLineAmount : expenseNet(e);
    if (net === 0) continue;

    if (isFinancingCategory(e, inputs.expenseCategories)) {
      financing += net;
      continue;
    }
    if (e.source === "maintenance_work_order") {
      maintenance += net;
      continue;
    }
    if (isGpsCategory(e, inputs.expenseCategories)) {
      gps += net;
      continue;
    }
    if (isCleaningCategory(e, inputs.expenseCategories)) {
      cleaning += net;
      continue;
    }
    const cat = inputs.expenseCategories.find(
      (c) => c.id === e.expense_category_id,
    );
    const name = (cat?.name ?? "").toLowerCase();
    if (name.includes("insurance")) insurance += net;
    else if (name.includes("registration")) registration += net;
    else if (name.includes("fuel")) fuel += net;
    else other += net;
  }

  const total = round2(
    maintenance + insurance + registration + gps + cleaning + fuel + other,
  );
  return {
    breakdown: {
      maintenance: round2(maintenance),
      insurance: round2(insurance),
      registration: round2(registration),
      gps: round2(gps),
      cleaning: round2(cleaning),
      fuel: round2(fuel),
      other: round2(other),
      total,
    },
    financingPayments: round2(financing),
  };
}

export function buildFinancingView(
  financingPayments: number,
  purchasePriceMissing = false,
): FinancingView {
  return {
    financingState: financingPayments > 0 ? "financed" : "paid_off",
    carNotePayments: financingPayments,
    hasFinancingData: financingPayments > 0,
    purchasePriceMissing,
  };
}
